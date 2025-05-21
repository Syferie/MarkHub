// 不再需要从api-client导入不存在的函数

/**
 * 标签API接口
 *
 * 这个文件提供了与标签相关的API功能，包括：
 * 1. 通过后端AI生成标签建议
 */

export interface GeminiConfig {
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
}

export interface TagSuggestionResponse {
  suggested_tags: string[];
}

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}

/**
 * 生成标签建议
 *
 * 通过调用后端API为书签生成标签建议
 *
 * @param title 书签标题
 * @param url 书签URL
 * @param existingUserTags 用户现有标签列表
 * @param token 用户认证令牌
 * @returns 建议的标签数组
 */
export async function generateTags(
  token: string,
  title: string,
  url: string,
  existingUserTags: string[] = [],
  geminiConfig?: GeminiConfig
): Promise<string[]> {
  try {
    if (!title || !url) {
      throw new ApiError('必须提供标题和URL', 400);
    }

    if (!token) {
      throw new ApiError('未提供用户认证令牌', 401);
    }

    // 由于fetchAPI没有导出，这里直接使用fetch调用API
    const response = await fetch(`http://127.0.0.1:8090/api/custom/suggest-tags-for-bookmark`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title,
        url,
        existingUserTags
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.message || '标签建议请求失败',
        response.status
      );
    }

    return data.suggested_tags || [];
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('生成标签时出错:', error);
    throw new ApiError(
      error instanceof Error ? error.message : '生成标签时出错',
      500
    );
  }
}

// 保留这些类型定义以确保向后兼容
export interface TaskSubmissionResponse {
  task_id: string;
  status: 'pending';
  message: string;
  status_url: string;
}

export interface TaskStatusBase {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface TaskStatusPending extends TaskStatusBase {
  status: 'pending';
  message: string;
}

export interface TaskStatusProcessing extends TaskStatusBase {
  status: 'processing';
  progress?: number;
  message: string;
}

export interface TaskStatusCompleted extends TaskStatusBase {
  status: 'completed';
  tags: string[];
  url: string;
  completed_at: string;
}

export interface TaskStatusFailed extends TaskStatusBase {
  status: 'failed';
  error: string;
  error_code?: string;
}

export type TaskStatus = TaskStatusPending | TaskStatusProcessing | TaskStatusCompleted | TaskStatusFailed;

export interface GenerateTagsOptions {
  url: string;
  filter_tags?: string[];
  fetch_options?: {
    timeout?: number;
    wait_until?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
    debug?: boolean;
  };
}
