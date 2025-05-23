/**
 * MarkHub Chrome Sync - AI 服务模块
 * 
 * 该模块负责:
 * 1. 封装与外部 AI 服务的交互
 * 2. 根据书签信息和现有文件夹构建 Prompt
 * 3. 解析 AI 服务响应
 * 4. 处理错误情况
 */

// 导入配置管理器
import { getConfig } from './config_manager.js';

/**
 * 根据书签信息和现有文件夹，推荐最合适的文件夹
 * 
 * @param {Object} bookmarkInfo - 书签信息对象
 * @param {string} bookmarkInfo.url - 书签URL
 * @param {string} bookmarkInfo.title - 书签标题
 * @param {Array<Object>} folderList - 用户现有的Chrome文件夹列表
 * @param {string} folderList[].title - 文件夹标题
 * @returns {Promise<string|null>} 推荐的文件夹名称，失败时返回null
 * @throws {Error} 配置错误或API调用失败时抛出
 */
async function suggestFolder(bookmarkInfo, folderList) {
  try {
    // 1. 加载配置
    const config = await getConfig();
    
    // 检查是否配置了API Key
    if (!config.apiKey) {
      throw new Error('未配置AI服务API Key，请在扩展选项中设置');
    }
    
    // 2. 构建消息数组 - 现在返回的是消息数组而不是单一字符串
    const messages = buildPrompt(bookmarkInfo, folderList);
    
    // 3. 调用AI服务 - 传递消息数组
    const suggestedFolder = await callAIService(messages, config);
    
    return suggestedFolder;
  } catch (error) {
    console.error('AI文件夹推荐失败:', error);
    throw error; // 向上传递错误，让调用者处理
  }
}

/**
 * 构建发送给AI服务的消息数组
 *
 * @param {Object} bookmarkInfo - 书签信息
 * @param {Array<Object>} folderList - 文件夹列表
 * @returns {Array<Object>} 构建好的消息数组，符合OpenAI API格式
 */
function buildPrompt(bookmarkInfo, folderList) {
  // 提取文件夹名称列表
  const folderNames = folderList.map(folder => folder.title);
  
  // 系统提示部分
  const systemMessage = {
    role: "system",
    content: '你是一个智能文件夹分类助手。根据提供的书签URL、标题和页面内容，从现有文件夹列表中选择一个最合适的文件夹。' +
      '请直接返回推荐的文件夹名称，不要添加任何额外的文字或解释。' +
      '如果没有找到合适的文件夹，请返回"未分类"。' +
      '请仅从提供的文件夹列表中选择，不要创建新的文件夹名称。'
  };
  
  // 构建用户消息内容
  let userContent = `这是一个新书签:\n标题: "${bookmarkInfo.title}"\nURL: "${bookmarkInfo.url}"`;
  
  // 添加页面内容信息（如果有）
  if (bookmarkInfo.metaDescription) {
    userContent += `\n页面描述: "${bookmarkInfo.metaDescription}"`;
  }
  
  if (bookmarkInfo.h1 && bookmarkInfo.h1 !== bookmarkInfo.title) {
    userContent += `\n页面标题: "${bookmarkInfo.h1}"`;
  }
  
  if (bookmarkInfo.pageText) {
    // 截取页面文本摘要（最多500字符），避免过长
    const textSummary = bookmarkInfo.pageText.length > 500
      ? bookmarkInfo.pageText.substring(0, 500) + '...'
      : bookmarkInfo.pageText;
    
    userContent += `\n\n页面内容摘要:\n"${textSummary}"`;
  }
  
  // 添加文件夹列表
  userContent += `\n\n请从以下文件夹列表中选择一个最合适的文件夹:\n${folderNames.join('\n')}\n\n` +
    `请仅返回推荐的文件夹名称，不要添加任何其他文字。`;
  
  // 用户消息
  const userMessage = {
    role: "user",
    content: userContent
  };
  
  // 返回消息数组
  return [systemMessage, userMessage];
}

/**
 * 调用外部AI服务
 * 
 * @param {string} prompt - 构建好的Prompt
 * @param {Object} config - AI服务配置
 * @returns {Promise<string|null>} 推荐的文件夹名称，失败时返回null
 */
async function callAIService(promptMessages, config) {
  // 确保配置有效
  const apiKey = config.apiKey;
  const apiBaseUrl = config.apiBaseUrl || 'https://api.openai.com/v1';
  const modelName = config.modelName || 'gpt-3.5-turbo';
  
  // 构建API URL - 使用OpenAI兼容的端点格式
  const apiUrl = `${apiBaseUrl}/chat/completions`;
  
  // 构建请求体 - 使用OpenAI兼容的请求体格式
  const requestBody = {
    model: modelName,
    messages: promptMessages,
    temperature: 0.3,
    max_tokens: 100
  };
  
  try {
    console.log('调用AI服务:', apiUrl);
    console.log('使用模型:', modelName);
    
    // 发送请求到AI服务 - 使用Bearer认证头
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
    });
    
    // 检查响应状态
    if (!response.ok) {
      let errorDetails = '';
      try {
        // 尝试解析错误响应为JSON
        const errorJson = await response.json();
        errorDetails = JSON.stringify(errorJson);
      } catch (e) {
        // 如果解析失败，获取文本响应
        errorDetails = await response.text();
      }
      throw new Error(`AI服务请求失败: ${response.status} - ${errorDetails}`);
    }
    
    // 解析响应
    const responseData = await response.json();
    console.log('AI服务响应:', JSON.stringify(responseData).substring(0, 100) + '...');
    
    // 提取AI建议的文件夹名称
    return extractFolderSuggestion(responseData);
  } catch (error) {
    console.error('调用AI服务失败:', error);
    throw error; // 向上传递错误，而不是返回null
  }
}

/**
 * 从AI服务响应中提取文件夹建议
 *
 * @param {Object} responseData - AI服务响应数据
 * @returns {string|null} 提取的文件夹名称，如果无法提取则返回null
 */
function extractFolderSuggestion(responseData) {
  try {
    // 检查是否有有效的响应 - 适用于OpenAI API格式
    if (!responseData || !responseData.choices || !responseData.choices[0] ||
        !responseData.choices[0].message || !responseData.choices[0].message.content) {
      console.error('无效的AI响应格式:', responseData);
      return null;
    }
    
    // 提取AI返回的文本 - 从OpenAI响应格式中获取
    const suggestedText = responseData.choices[0].message.content;
    
    // 清理和规范化文本（移除多余空格、引号等）
    return suggestedText.trim().replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error('解析AI响应失败:', error);
    return null;
  }
}

// 导出模块函数
export {
  suggestFolder
};