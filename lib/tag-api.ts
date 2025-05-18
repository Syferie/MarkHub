/**
 * 标签生成 API 客户端
 *
 * 提供与标签生成服务交互的TypeScript函数
 */
import { db } from "@/lib/db"; // 导入db实例

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

// 请求类型
export interface GenerateTagsOptions {
  url: string;
  filter_tags?: string[];
  fetch_options?: {
    timeout?: number;
    wait_until?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
    debug?: boolean;
  };
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
// 这里之前的辅助函数已被移除，不再需要代理配置

/**
 * 提交标签生成任务
 *
 * @param options - 任务选项，包括URL和可选参数
 * @returns 包含task_id的Promise
 *
 * 注意：此函数已被适配为直接与Gemini API兼容的后端交互
 */
export async function submitTagGenerationTask(
  options: GenerateTagsOptions
): Promise<string> {
  try {
    // 使用直接路由来启动任务
    const url = '/api/generate-tags';

    // 准备请求选项
    // 从IndexedDB获取应用设置
    const appSettings = await db.getAppSettings();

    const requestOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: options.url,
        filter_tags: options.filter_tags,
        customApiBaseUrl: appSettings?.geminiApiBaseUrl || undefined,
        customModelName: appSettings?.geminiModelName || undefined,
        customApiKey: appSettings?.geminiApiKey || undefined
      })
    };

    // 发送请求到Next.js API代理路由
    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      let errorMessage = '标签生成任务启动失败';
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
    console.error('提交标签生成任务失败:', error);
    throw error;
  }
}

/**
 * 获取任务状态/结果
 *
 * 注意：此函数已被修改为通过Next.js API代理路由与后端交互
 * 它现在直接请求标签，而不是检查任务状态
 *
 * @param taskId - 临时任务ID（包含原始选项）
 * @returns 包含任务状态和结果的Promise
 */
export async function getTaskStatus(
  taskId: string,
  options?: GenerateTagsOptions
): Promise<TaskStatus> {
  try {
    // 使用直接路由查询任务状态
    const url = `/api/generate-tags?taskId=${encodeURIComponent(taskId)}`;

    // 准备请求选项
    const requestOptions: RequestInit = {
      method: 'GET'
    };

    // 发送GET请求到Next.js API代理路由
    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      let errorMessage = '获取任务状态失败';
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

    // 简化的响应处理
    if (taskStatus.status === 'completed') {
      // 直接使用未加密的标签
      const tags = taskStatus.tags || [];

      return {
        task_id: taskId,
        status: 'completed',
        tags: tags,
        url: taskStatus.url || (options?.url || ''), // 优先使用后端返回的URL，否则使用选项中的URL
        completed_at: new Date().toISOString()
      } as TaskStatusCompleted;
    }
    // 如果任务失败
    else if (taskStatus.status === 'failed') {
      return {
        task_id: taskId,
        status: 'failed',
        error: taskStatus.error || '未知错误'
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
    console.error(`获取任务状态失败 (${taskId}):`, error);

    // 将错误转换为前端期望的格式
    return {
      task_id: taskId,
      status: 'failed',
      error: error instanceof Error ? error.message : '未知错误'
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
    taskOptions?: GenerateTagsOptions; // 添加任务选项参数
  } = {}
): Promise<TaskStatusCompleted | TaskStatusFailed> {
  const {
    intervalMs = 2000,
    timeoutMs = 5 * 60 * 1000, // 默认5分钟超时
    onProgressUpdate,
    taskOptions
  } = options;

  const startTime = Date.now();

  while (true) {
    // 检查是否超时
    if (Date.now() - startTime > timeoutMs) {
      throw new ApiError('任务轮询超时', 408);
    }

    // 获取任务状态，传递必要的任务选项
    const status = await getTaskStatus(taskId, taskOptions);

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
 * 完整流程：提交标签生成任务并等待结果
 *
 * @param options - 任务选项
 * @param pollOptions - 轮询选项
 * @returns 生成的标签数组或抛出错误
 */
export async function generateTags(
  options: GenerateTagsOptions,
  pollOptions?: Parameters<typeof pollTaskUntilComplete>[1]
): Promise<string[]> {
  try {
    // 为了保持接口一致，我们仍然使用与之前相同的函数签名
    // 但实际实现改为直接请求并返回结果

    // 首先提交任务（现在只返回一个临时ID）
    const taskId = await submitTagGenerationTask(options);

    // 准备轮询选项，添加任务选项
    const fullPollOptions = {
      ...pollOptions,
      taskOptions: options // 传递任务选项给轮询函数
    };

    // 调用轮询函数获取结果，同时传递API配置
    const result = await pollTaskUntilComplete(taskId, fullPollOptions);

    // 检查任务是否成功
    if (result.status === 'completed') {
      return (result as TaskStatusCompleted).tags;
    } else {
      throw new ApiError(`标签生成失败: ${(result as TaskStatusFailed).error}`, 0);
    }
  } catch (error) {
    console.error("生成标签失败:", error);
    throw error;
  }
}
