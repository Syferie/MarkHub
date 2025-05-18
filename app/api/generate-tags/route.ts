import { NextRequest, NextResponse } from 'next/server';
// @ts-ignore - 假设这些依赖已经安装
import { Redis } from 'ioredis';
// @ts-ignore - 假设这些依赖已经安装
import { v4 as uuidv4 } from 'uuid';
// @ts-ignore - 假设这些依赖已经安装
import { Readability } from '@mozilla/readability';
// @ts-ignore - 假设这些依赖已经安装
import TurndownService from 'turndown';
// @ts-ignore - 假设这些依赖已经安装
import { JSDOM } from 'jsdom';
import { z } from 'zod'; // 引入 Zod

// Zod Schema for AI response validation
const TagsResponseSchema = z.object({
  tags: z.array(z.string().min(1)).min(1).max(5) // 要求1-5个标签，每个标签至少1个字符
});

/**
 * API响应类型
 */
interface TaskResponse {
  task_id: string;
  status: string;
  message: string;
}

interface TaskStatusResponse {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  tags?: string[];
  url?: string;
  title?: string;
  error?: string;
  update_time?: string;
  message?: string; // 添加message属性用于pending/processing状态
}

interface TaskData {
  id: string;
  url: string;
  status: "pending" | "processing" | "completed" | "failed";
  filterTags?: string[];
  tags?: string[];
  title?: string;
  error?: string;
  createTime: string;
  updateTime?: string;
}

/**
 * 环境变量配置检查
 */
function checkRequiredEnvVars() {
  // 不再强制要求环境变量中的GEMINI_API_KEY
  // 因为用户可以通过UI提供自己的API Key
  if (!process.env.REDIS_URL) {
    throw new Error('Missing required environment variable: REDIS_URL');
  }
}

/**
 * 初始化Redis客户端
 */
function getRedisClient() {
  return new Redis(process.env.REDIS_URL as string);
}

export async function POST(request: NextRequest) {
  try {
    // 检查环境变量
    checkRequiredEnvVars();
    
    // 解析请求体
    const body = await request.json();
    const { url, filter_tags, customApiBaseUrl, customModelName, customApiKey } = body;

    if (!url) {
      return NextResponse.json(
        { error: '缺少URL参数' },
        { status: 400 }
      );
    }
    
    // 立即验证API Key是否存在
    if (!customApiKey) {
      return NextResponse.json(
        { error: '缺少 API Key，请在应用设置中配置' },
        { status: 400 }
      );
    }

    // 生成唯一任务ID
    const taskId = uuidv4();
    
    // 初始化Redis连接
    const redis = getRedisClient();
    
    // 创建初始任务状态
    const taskData: TaskData = {
      id: taskId,
      url: url,
      status: 'pending',
      filterTags: filter_tags || [],
      createTime: new Date().toISOString()
    };
    
    // 存储任务状态到Redis
    const redisKey = `task:${taskId}`;
    await redis.set(redisKey, JSON.stringify(taskData));
    
    // 设置24小时的过期时间
    await redis.expire(redisKey, 24 * 60 * 60);
    
    // 立即返回响应给前端
    const response: TaskResponse = {
      task_id: taskId,
      status: 'pending',
      message: 'Tag generation task created successfully.'
    };
    
    // 开始异步处理
    processTaskAsync(taskId, url, filter_tags, customApiBaseUrl, customModelName, customApiKey).catch(error => {
      console.error(`Error processing task ${taskId}:`, error);
    });
    
    // 关闭Redis连接
    redis.disconnect();
    
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('API error:', error);

    // 改进错误处理，返回结构化的错误响应
    return NextResponse.json(
      {
        error: `Error processing request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * 异步处理任务
 * 这个函数不会阻塞POST响应
 */
async function processTaskAsync(
  taskId: string,
  url: string,
  filterTags?: string[],
  customApiBaseUrl?: string,
  customModelName?: string,
  customApiKey?: string
) {
  const redis = getRedisClient();
  const redisKey = `task:${taskId}`;
  
  try {
    let markdownContent: string;
    let title: string | undefined;

    try {
      // 1. 尝试主要方法获取和处理网页内容
      console.log(`[Task ${taskId}] Attempting primary content extraction for URL: ${url}`);
      const fetchResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        signal: AbortSignal.timeout(30000) // 30秒超时
      });

      if (!fetchResponse.ok) {
        throw new Error(`Primary fetch failed: ${fetchResponse.status} ${fetchResponse.statusText}`);
      }

      const html = await fetchResponse.text();
      const dom = new JSDOM(html);
      const document = dom.window.document;
      const reader = new Readability(document);
      const article = reader.parse();

      if (!article || !article.content) {
        console.warn(`[Task ${taskId}] Primary readability extraction failed for URL: ${url}. Article object (title): ${article ? article.title : 'null'}. Article content length: ${article && article.content ? article.content.length : 0}`);
        throw new Error('Primary readability extraction failed');
      }

      title = article.title === null ? undefined : article.title; // 处理 null case
      const turndownService = new TurndownService();
      markdownContent = turndownService.turndown(article.content);
      console.log(`[Task ${taskId}] Primary content extraction successful for URL: ${url}`);

    } catch (primaryError) {
      console.warn(`[Task ${taskId}] Primary content extraction failed for URL ${url}:`, primaryError instanceof Error ? primaryError.message : primaryError);
      console.log(`[Task ${taskId}] Attempting fallback API for URL: ${url}`);

      const fallbackApiUrl = `https://api.pearktrue.cn/api/llmreader/?url=${encodeURIComponent(url)}&type=json`;
      const fallbackResponse = await fetch(fallbackApiUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(45000) // 给备用API稍长一点的超时时间
      });

      if (!fallbackResponse.ok) {
        throw new Error(`Fallback API request failed: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
      }

      const fallbackResult = await fallbackResponse.json();

      if (fallbackResult.code !== 200 || !fallbackResult.data) {
        console.error(`[Task ${taskId}] Fallback API returned an error or no data for URL ${url}:`, fallbackResult);
        throw new Error(`Fallback API failed: ${fallbackResult.msg || 'Unknown error from fallback API'}`);
      }
      
      markdownContent = fallbackResult.data;
      // 尝试从返回的data中提取Title，如果API本身不直接提供
      // 这是一个简单的尝试，可能不总是准确
      const titleMatch = fallbackResult.data.match(/^Title:\s*(.*)\n/);
      title = titleMatch && titleMatch[1] ? titleMatch[1] : fallbackResult.url; // 如果API返回了URL，可以作为备用标题

      console.log(`[Task ${taskId}] Fallback API content extraction successful for URL: ${url}`);
    }

    if (!markdownContent) {
      // 如果主要和备用方法都失败了（理论上不应该到这里，因为上面会抛错）
      throw new Error('Failed to extract content from webpage using all methods');
    }
    
    // 更新任务状态为处理中
    await redis.set(redisKey, JSON.stringify({
      id: taskId,
      url: url,
      status: 'processing',
      title: title,
      filterTags: filterTags || [],
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString()
    }));
    
    // 4. 调用AI厂商API (Gemini)
    // 使用用户自定义的配置，或使用默认值，但不再从环境变量读取
    const apiBaseUrl = customApiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/v1';
    const modelName = customModelName || 'gemini-2.0-flash';
    
    // 检查API Key是否可用，必须由用户在前端UI提供
    if (!customApiKey) {
      throw new Error('Missing API Key. Please configure it in the application settings.');
    }
    
    const apiKey = customApiKey;
    
    const aiRequestBody = {
      model: modelName,
      messages: [
        {
          role: "system",
          content: "You are a professional bookmark tagging assistant for a bookmarking application. Your sole task is to analyze the provided webpage content and generate 2-3 most relevant tags that accurately categorize the content. Users will see these tags as recommendations when saving bookmarks. Return ONLY a JSON response in the format {\"tags\": [\"tag1\", \"tag2\"]}, with no additional text or explanations. Tags should be concise (1-2 words), descriptive, and highly relevant to the core topic. The tags should be in the same language as the main content of the page."
        },
        {
          role: "user",
          content: `Analyze the following webpage content and generate 2-3 highly relevant tags for a bookmarking application. These tags will be recommended to users when they save this webpage as a bookmark. The tags should accurately reflect the main topic, domain, and key concepts of the content. Choose tags that would be most helpful for categorizing and retrieving this bookmark later. Note: This content has been automatically extracted from the webpage and may contain only the main textual content. ${filterTags && filterTags.length > 0 ? `\nIf appropriate, prioritize selecting from the user's existing tag collection: ${JSON.stringify(filterTags)}. These are tags the user has previously created. Matching with existing tags helps with organization, but only choose them if truly relevant to the content.` : ''}\n\nWEBPAGE CONTENT:\n${markdownContent.substring(0, 30000)}` // 限制长度避免超过API限制
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: "json_object" }
    };
    
    const aiResponse = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(aiRequestBody)
    });
    
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`AI API request failed: ${aiResponse.status} ${aiResponse.statusText} - ${errorText}`);
    }
    
    const aiResultText = await aiResponse.text(); // 首先获取原始文本
    let tags: string[] = [];
    let rawAiContentForLogging = aiResultText; // 用于日志记录的原始AI响应

    try {
      const aiResult = JSON.parse(aiResultText); // 解析外层JSON
      
      if (!aiResult.choices || !aiResult.choices[0] || !aiResult.choices[0].message || !aiResult.choices[0].message.content) {
        console.error(`[Task ${taskId}] AI response structure unexpected:`, aiResultText);
        throw new Error('AI response structure unexpected. Missing choices or message content.');
      }
      
      const responseContentString = aiResult.choices[0].message.content;
      rawAiContentForLogging = responseContentString; // 更新为真正的AI内容字符串

      // 尝试移除Markdown代码块标记
      let cleanedResponseContentString = responseContentString.trim();
      if (cleanedResponseContentString.startsWith("```json")) {
        cleanedResponseContentString = cleanedResponseContentString.substring(7);
        // 如果移除了```json，通常也需要移除末尾的```
        if (cleanedResponseContentString.endsWith("```")) {
          cleanedResponseContentString = cleanedResponseContentString.substring(0, cleanedResponseContentString.length - 3);
        }
      } else if (cleanedResponseContentString.startsWith("```")) { // 处理仅有```的情况
        cleanedResponseContentString = cleanedResponseContentString.substring(3);
        if (cleanedResponseContentString.endsWith("```")) {
          cleanedResponseContentString = cleanedResponseContentString.substring(0, cleanedResponseContentString.length - 3);
        }
      } else if (cleanedResponseContentString.endsWith("```")) { // 处理仅有末尾```的情况
         cleanedResponseContentString = cleanedResponseContentString.substring(0, cleanedResponseContentString.length - 3);
      }
      cleanedResponseContentString = cleanedResponseContentString.trim();
      
      // 首先确保 cleanedResponseContentString 是有效的 JSON
      let jsonParsedObject;
      try {
        jsonParsedObject = JSON.parse(cleanedResponseContentString);
      } catch (jsonParseError: any) {
        console.error(`[Task ${taskId}] Failed to parse cleaned string into JSON. Error: ${jsonParseError.message}. Cleaned Content:`, cleanedResponseContentString);
        // 将 cleanedResponseContentString 记录为原始AI内容，因为它更接近AI的直接输出（在清理后）
        rawAiContentForLogging = cleanedResponseContentString;
        throw new Error(`Invalid JSON format after cleaning: ${jsonParseError.message}`);
      }

      // 然后使用 Zod 验证结构
      const validationResult = TagsResponseSchema.safeParse(jsonParsedObject);

      if (!validationResult.success) {
        console.error(`[Task ${taskId}] Zod validation failed. Errors:`, validationResult.error.flatten().fieldErrors);
        console.error(`[Task ${taskId}] Invalid data for Zod validation:`, jsonParsedObject);
        rawAiContentForLogging = cleanedResponseContentString; // Zod验证失败时，记录清理后的JSON字符串
        throw new Error(`AI response does not match expected schema. Errors: ${JSON.stringify(validationResult.error.flatten().fieldErrors)}`);
      }
      
      tags = validationResult.data.tags; // 从验证成功的数据中获取标签
      
      // 更新任务状态为已完成
      await redis.set(redisKey, JSON.stringify({
        id: taskId,
        url: url,
        status: 'completed',
        title: title,
        tags: tags,
        filterTags: filterTags || [],
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString()
      }));
    } catch (error) {
      console.error(`[Task ${taskId}] Failed to parse AI response. Error: ${error instanceof Error ? error.message : 'Unknown error'}. Raw AI Content:`, rawAiContentForLogging);
      throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}. Raw content logged.`);
    }
  } catch (error) {
    // 更新任务状态为失败
    await redis.set(redisKey, JSON.stringify({
      id: taskId,
      url: url,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      filterTags: filterTags || [],
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString()
    }));
  } finally {
    // 确保关闭Redis连接
    redis.disconnect();
  }
}

/**
 * 获取任务状态
 *
 * 此方法处理任务状态查询请求，通过任务ID查询后端API以获取任务的当前状态
 */
export async function GET(request: NextRequest) {
  try {
    // 检查环境变量
    checkRequiredEnvVars();
    
    // 从URL获取任务ID
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { error: '缺少taskId参数' },
        { status: 400 }
      );
    }
    
    // 初始化Redis连接
    const redis = getRedisClient();
    const redisKey = `task:${taskId}`;
    
    // 从Redis获取任务数据
    const taskDataJson = await redis.get(redisKey);
    
    // 关闭Redis连接
    redis.disconnect();
    
    // 如果任务不存在
    if (!taskDataJson) {
      return NextResponse.json(
        { error: '任务不存在或已过期' },
        { status: 404 }
      );
    }
    
    // 解析任务数据
    const taskData: TaskData = JSON.parse(taskDataJson);
    
    // 根据任务状态构造响应
    let response: TaskStatusResponse;
    
    switch (taskData.status) {
      case 'pending':
      case 'processing':
        response = {
          task_id: taskId,
          status: taskData.status,
          message: 'ai.taskProcessing'
        };
        break;
        
      case 'completed':
        response = {
          task_id: taskId,
          status: 'completed',
          url: taskData.url,
          title: taskData.title,
          tags: taskData.tags,
          update_time: taskData.updateTime
        };
        break;
        
      case 'failed':
        response = {
          task_id: taskId,
          status: 'failed',
          error: taskData.error || '未知错误'
        };
        break;
        
      default:
        response = {
          task_id: taskId,
          status: 'failed',
          error: '未知任务状态'
        };
    }
    
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error getting task status:', error);

    return NextResponse.json(
      {
        error: `Error getting task status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}