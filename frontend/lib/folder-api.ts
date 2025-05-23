/**
 * 文件夹建议 API 客户端
 *
 * 提供与新的Go后端文件夹建议服务交互的TypeScript函数
 */

import { getApiBaseUrl } from './config'; // 导入配置

// API 错误类型
export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}

// 请求Go后端时的选项
interface SuggestFolderGoAPIOptions {
  title: string;
  url: string;
}

// Go后端返回的响应类型
interface GoAPISuggestionResponse {
  suggested_folder: string;
}

/**
 * 调用Go后端API获取文件夹建议
 *
 * @param options - 包含title和url
 * @param token - 用户认证令牌
 * @returns 建议的文件夹名称字符串，如果无建议或出错则为null
 */
export async function suggestFolder(
  token: string,
  title: string,
  url: string,
  geminiConfig?: any
): Promise<string | null> {
  if (!title || !url) {
    console.error('suggestFolder: Title and URL are required.');
    throw new ApiError('Title and URL are required for folder suggestion.', 400);
  }
  if (!token) {
    console.error('suggestFolder: Auth token is required.');
    throw new ApiError('User authentication token is required.', 401);
  }

  try {
    // 使用配置中的API基础URL
    const POCKETBASE_URL = getApiBaseUrl();
    const endpoint = `${POCKETBASE_URL}/api/custom/suggest-folder`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: title,
        url: url,
      }),
    });

    if (!response.ok) {
      let errorMessage = `Folder suggestion request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch (e) {
        // 无法解析错误JSON，使用状态文本
        errorMessage = response.statusText || errorMessage;
      }
      console.error(`suggestFolder API Error: ${errorMessage} (Status: ${response.status})`);
      throw new ApiError(errorMessage, response.status);
    }

    const data: GoAPISuggestionResponse = await response.json();
    return data.suggested_folder || null; // 如果没有建议，后端可能返回空字符串

  } catch (error) {
    console.error('Error in suggestFolder:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'An unknown error occurred while suggesting folder.',
      500
    );
  }
}