/**
 * 文件夹建议 API 客户端
 *
 * 提供与文件夹建议服务交互的TypeScript函数
 */

// API响应类型
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
  suggested_folder: string; // 修改为文件夹字段
  url: string;
  completed_at: string;
}

export interface TaskStatusFailed extends TaskStatusBase {
  status: 'failed';
  error: string;
  error_code?: string;
}

export type TaskStatus = TaskStatusPending | TaskStatusProcessing | TaskStatusCompleted | TaskStatusFailed;

// 请求类型
export interface SuggestFolderOptions {
  url: string;
  folders: string[]; // 传递现有的文件夹列表
}

// API 错误类型
export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}

/**
 * 从应用设置中获取API密钥
 *
 * 注意：此函数必须由调用者传入API密钥，因为它无法直接访问React上下文
 * @param apiKey - 可选的外部传入的API密钥
 * @returns 返回传入的API密钥或空字符串
 */
const getApiKey = (apiKey?: string): string => {
  // 如果外部传入了API密钥，直接使用
  if (apiKey) {
    return apiKey;
  }

  console.warn('未提供API密钥，API请求可能会失败');
  return '';
};

/**
 * 从应用设置中获取API基础URL
 *
 * 注意：此函数必须由调用者传入API基础URL，因为它无法直接访问React上下文
 * @param apiBaseUrl - 可选的外部传入的API基础URL
 * @returns 返回传入的API基础URL或默认值
 */
const getApiBaseUrl = (apiBaseUrl?: string): string => {
  // 如果外部传入了API基础URL，直接使用
  if (apiBaseUrl) {
    return apiBaseUrl;
  }

  // 如未配置，返回默认值或显示警告
  console.warn('未提供API基础URL，使用默认URL');
  return 'http://localhost:8080'; // 更新默认值为本地开发服务器
};

/**
 * 提交文件夹建议任务
 *
 * @param options - 任务选项，包括URL和文件夹列表
 * @returns 包含task_id的Promise
 */
export async function submitFolderSuggestionTask(
  options: SuggestFolderOptions,
  apiSettings?: {
    apiKey?: string;
    apiBaseUrl?: string;
  }
): Promise<string> {
  try {
    // 获取API密钥和基础URL，优先使用传入的配置
    const apiKey = getApiKey(apiSettings?.apiKey);
    if (!apiKey) {
      throw new ApiError('API密钥未配置', 401);
    }
    const apiBaseUrl = getApiBaseUrl(apiSettings?.apiBaseUrl);

    // 使用代理路由来启动任务
    const url = '/api/suggest-folder';

    // 准备请求选项
    const requestOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Base-Url': apiBaseUrl,
        'X-Api-Key': apiKey
      },
      body: JSON.stringify({
        url: options.url,
        folders: options.folders // 传递现有文件夹列表
      })
    };

    // 发送请求到Next.js API代理路由
    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      let errorMessage = '文件夹建议任务启动失败';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (e) {
        // 解析错误响应失败，使用默认错误消息
      }
      throw new ApiError(errorMessage, response.status);
    }

    // 解析响应
    const taskResponse = await response.json();

    // 返回任务ID
    return taskResponse.task_id;
  } catch (error) {
    console.error('提交文件夹建议任务失败:', error);
    throw error;
  }
}

/**
 * 获取任务状态/结果
 *
 * @param taskId - 临时任务ID（包含原始选项）
 * @returns 包含任务状态和结果的Promise
 */
export async function getTaskStatus(
  taskId: string,
  options: SuggestFolderOptions,
  apiSettings?: {
    apiKey?: string;
    apiBaseUrl?: string;
  }
): Promise<TaskStatus> {
  try {
    // 获取API密钥和基础URL，优先使用传入的配置
    const apiKey = getApiKey(apiSettings?.apiKey);
    if (!apiKey) {
      throw new ApiError('API密钥未配置', 401);
    }
    const apiBaseUrl = getApiBaseUrl(apiSettings?.apiBaseUrl);

    // 使用代理路由查询任务状态
    const url = `/api/suggest-folder?taskId=${encodeURIComponent(taskId)}`;

    // 准备请求选项
    const requestOptions: RequestInit = {
      method: 'GET',
      headers: {
        // 通过自定义头传递API基础URL和密钥给代理路由
        'X-Api-Base-Url': apiBaseUrl,
        'X-Api-Key': apiKey
      }
    };

    // 发送GET请求到Next.js API代理路由
    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      let errorMessage = 'Failed to get task status';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (e) {
        // 解析错误响应失败，使用默认错误消息
      }
      throw new ApiError(errorMessage, response.status);
    }

    // 解析响应
    const taskStatus = await response.json();

    // 如果任务已完成并包含建议的文件夹，转换为前端期望的格式
    if (taskStatus.status === 'completed') {
      return {
        task_id: taskId,
        status: 'completed',
        suggested_folder: taskStatus.suggested_folder || '',
        url: options.url,
        completed_at: new Date().toISOString()
      } as TaskStatusCompleted;
    }
    // 如果任务失败
    else if (taskStatus.status === 'failed') {
      return {
        task_id: taskId,
        status: 'failed',
        error: taskStatus.error || 'Unknown error'
      } as TaskStatusFailed;
    }
    // 如果任务正在进行中
    else {
      return {
        task_id: taskId,
        status: taskStatus.status as 'pending' | 'processing',
        message: taskStatus.message || `Task ${taskStatus.status}`
      } as TaskStatusPending | TaskStatusProcessing;
    }
  } catch (error) {
    console.error(`Failed to get task status (${taskId}):`, error);

    // 将错误转换为前端期望的格式
    return {
      task_id: taskId,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    } as TaskStatusFailed;
  }
}

/**
 * 轮询任务状态，直到任务完成或失败
 *
 * @param taskId - 任务ID
 * @param options - 轮询选项
 * @returns 完成的任务状态
 */
export async function pollTaskUntilComplete(
  taskId: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    onProgressUpdate?: (status: TaskStatus) => void;
    taskOptions?: SuggestFolderOptions; // 添加任务选项参数
    apiSettings?: {
      apiKey?: string;
      apiBaseUrl?: string;
    };
  } = {}
): Promise<TaskStatusCompleted | TaskStatusFailed> {
  const {
    intervalMs = 2000,
    timeoutMs = 5 * 60 * 1000, // 默认5分钟超时
    onProgressUpdate,
    taskOptions
  } = options;

  // 如果没有提供任务选项，就无法调用getTaskStatus
  if (!taskOptions) {
    throw new ApiError('缺少任务选项', 400);
  }

  const startTime = Date.now();

  while (true) {
    // 检查是否超时
    if (Date.now() - startTime > timeoutMs) {
      throw new ApiError('任务轮询超时', 408);
    }

    // 获取任务状态，传递必要的任务选项和API配置
    const status = await getTaskStatus(taskId, taskOptions, options.apiSettings);

    // 如果有进度回调函数，调用它
    if (onProgressUpdate) {
      onProgressUpdate(status);
    }

    // 检查任务是否已完成
    if (status.status === 'completed' || status.status === 'failed') {
      return status as TaskStatusCompleted | TaskStatusFailed;
    }

    // 等待指定的时间间隔
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/**
 * 完整流程：提交文件夹建议任务并等待结果
 *
 * @param options - 任务选项
 * @param pollOptions - 轮询选项
 * @returns 建议的文件夹名称或抛出错误
 */
export async function suggestFolder(
  options: SuggestFolderOptions,
  pollOptions?: Parameters<typeof pollTaskUntilComplete>[1],
  apiSettings?: {
    apiKey?: string;
    apiBaseUrl?: string;
  }
): Promise<string> {
  try {
    // 首先提交任务（现在只返回一个临时ID），传递API配置
    const taskId = await submitFolderSuggestionTask(options, apiSettings);

    // 准备轮询选项，添加任务选项和API配置
    const fullPollOptions = {
      ...pollOptions,
      taskOptions: options, // 传递任务选项给轮询函数
      apiSettings: apiSettings // 传递API配置给轮询函数
    };

    // 调用轮询函数获取结果，同时传递API配置
    const result = await pollTaskUntilComplete(taskId, fullPollOptions);

    // 检查任务是否成功
    if (result.status === 'completed') {
      return (result as TaskStatusCompleted).suggested_folder;
    } else {
      throw new ApiError(`文件夹建议失败: ${(result as TaskStatusFailed).error}`, 0);
    }
  } catch (error) {
    console.error("生成文件夹建议失败:", error);
    throw error;
  }
}