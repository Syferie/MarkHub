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
  suggested_folder?: string;
  url?: string;
  error?: string;
  update_time?: string;
  message?: string;
}

interface TaskData {
  id: string;
  url: string;
  status: "pending" | "processing" | "completed" | "failed";
  folders?: string[];
  suggested_folder?: string;
  title?: string;
  error?: string;
  createTime: string;
  updateTime?: string;
}

/**
 * 环境变量配置检查
 */
function checkRequiredEnvVars() {
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
    const { url, folders, customApiBaseUrl, customModelName, customApiKey } = body;

    if (!url) {
      return NextResponse.json(
        { error: '缺少URL参数' },
        { status: 400 }
      );
    }
    
    // 验证folders参数
    if (!folders || !Array.isArray(folders)) {
      return NextResponse.json(
        { error: '缺少folders参数或格式不正确' },
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
      folders: folders,
      createTime: new Date().toISOString()
    };
    
    // 存储任务状态到Redis
    const redisKey = `folder-task:${taskId}`;
    await redis.set(redisKey, JSON.stringify(taskData));
    
    // 设置24小时的过期时间
    await redis.expire(redisKey, 24 * 60 * 60);
    
    // 立即返回响应给前端
    const response: TaskResponse = {
      task_id: taskId,
      status: 'pending',
      message: 'Folder suggestion task created successfully.'
    };
    
    // 开始异步处理
    processTaskAsync(taskId, url, folders, customApiBaseUrl, customModelName, customApiKey).catch(error => {
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
  folders: string[],
  customApiBaseUrl?: string,
  customModelName?: string,
  customApiKey?: string
) {
  const redis = getRedisClient();
  const redisKey = `folder-task:${taskId}`;
  
  try {
    let markdownContent: string;
    let title: string | undefined;

    try {
      // 1. 尝试主要方法获取和处理网页内容
      console.log(`[FolderTask ${taskId}] Attempting primary content extraction for URL: ${url}`);
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
        console.warn(`[FolderTask ${taskId}] Primary readability extraction failed for URL: ${url}. Article object (title): ${article ? article.title : 'null'}. Article content length: ${article && article.content ? article.content.length : 0}`);
        throw new Error('Primary readability extraction failed');
      }

      title = article.title === null ? undefined : article.title;
      const turndownService = new TurndownService();
      markdownContent = turndownService.turndown(article.content);
      console.log(`[FolderTask ${taskId}] Primary content extraction successful for URL: ${url}`);

    } catch (primaryError) {
      console.warn(`[FolderTask ${taskId}] Primary content extraction failed for URL ${url}:`, primaryError instanceof Error ? primaryError.message : primaryError);
      console.log(`[FolderTask ${taskId}] Attempting fallback API for URL: ${url}`);

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
        console.error(`[FolderTask ${taskId}] Fallback API returned an error or no data for URL ${url}:`, fallbackResult);
        throw new Error(`Fallback API failed: ${fallbackResult.msg || 'Unknown error from fallback API'}`);
      }
      
      markdownContent = fallbackResult.data;
      const titleMatch = fallbackResult.data.match(/^Title:\s*(.*)\n/);
      title = titleMatch && titleMatch[1] ? titleMatch[1] : (fallbackResult.url || url); // 使用API返回的URL或原始URL作为备用标题

      console.log(`[FolderTask ${taskId}] Fallback API content extraction successful for URL: ${url}`);
    }
    
    if (!markdownContent) {
      throw new Error('Failed to extract content from webpage using all methods');
    }
    
    // 更新任务状态为处理中
    await redis.set(redisKey, JSON.stringify({
      id: taskId,
      url: url,
      status: 'processing',
      title: title,
      folders: folders,
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
          content: "你是一个专业的书签文件夹管理助手。你的目标是为网页内容推荐一个最合适的文件夹分类。分析提供的markdown内容并生成一个文件夹建议。考虑已有文件夹列表，尽量从中选择一个合适的文件夹。如果没有合适的，可以建议一个新的文件夹名称。文件夹名称应该与网页的主要内容、主题或领域相关。返回的文件夹名称应该简洁、具体，且与网页内容的语言一致。以JSON格式返回，包含一个键\"suggested_folder\"，值为字符串类型的文件夹名称。"
        },
        {
          role: "user",
          content: `已有文件夹列表: ${JSON.stringify(folders)}\n\n网页内容 (Markdown):\n${markdownContent.substring(0, 30000)}` // 限制长度避免超过API限制
        }
      ],
      temperature: 0.3,
      max_tokens: 100,
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
    
    const aiResult = await aiResponse.json();
    let suggestedFolder: string = '';
    
    try {
      // 解析AI返回的JSON
      const responseContent = aiResult.choices[0].message.content;
      const parsedContent = JSON.parse(responseContent);
      suggestedFolder = parsedContent.suggested_folder || '';
      
      // 确保文件夹名称是字符串
      if (typeof suggestedFolder !== 'string') {
        throw new Error('AI response did not return a valid folder name string');
      }
      
      // 更新任务状态为已完成
      await redis.set(redisKey, JSON.stringify({
        id: taskId,
        url: url,
        status: 'completed',
        title: title,
        suggested_folder: suggestedFolder,
        folders: folders,
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString()
      }));
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    // 更新任务状态为失败
    await redis.set(redisKey, JSON.stringify({
      id: taskId,
      url: url,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      folders: folders,
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
    const redisKey = `folder-task:${taskId}`;
    
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
          suggested_folder: taskData.suggested_folder, // 直接返回明文文件夹
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