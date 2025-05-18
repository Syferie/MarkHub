/**
 * 文件夹建议 API 客户端
 *
 * 提供与文件夹建议服务交互的TypeScript函数
 */
import { getGeminiAPIConfig } from "@/lib/config-storage"; // 导入配置工具

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

// 辅助函数已被移除，不再需要代理配置

/**
 * 提交文件夹建议任务
 *
 * @param options - 任务选项，包括URL和文件夹列表
 * @returns 包含task_id的Promise
 */
export async function submitFolderSuggestionTask(
  options: SuggestFolderOptions
): Promise<string> {
  try {
    // 使用直接路由来启动任务
    const url = '/api/suggest-folder';

    // 从localStorage获取API配置
    const apiConfig = getGeminiAPIConfig();

    // 准备请求选项
    const requestOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: options.url,
        folders: options.folders, // 传递现有文件夹列表
        customApiKey: apiConfig.geminiApiKey || undefined,
        customApiBaseUrl: apiConfig.geminiApiBaseUrl || undefined,
        customModelName: apiConfig.geminiModelName || undefined
      })
    };

    // 发送请求到Next.js API路由
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
 * @param taskId - 临时任务ID
 * @param options - 任务选项
 * @returns 包含任务状态和结果的Promise
 */
export async function getTaskStatus(
  taskId: string,
  options: SuggestFolderOptions
): Promise<TaskStatus> {
  try {
    // 使用直接路由查询任务状态
    const url = `/api/suggest-folder?taskId=${encodeURIComponent(taskId)}`;

    // 准备请求选项
    const requestOptions: RequestInit = {
      method: 'GET'
    };

    // 发送GET请求到Next.js API路由
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

    // 获取原始文本响应
    const rawResponseText = await response.text();

    // 尝试移除Markdown代码块标记
    let cleanedResponseText = rawResponseText.trim();
    if (cleanedResponseText.startsWith("```json")) {
      cleanedResponseText = cleanedResponseText.substring(7);
    }
    if (cleanedResponseText.endsWith("```")) {
      cleanedResponseText = cleanedResponseText.substring(0, cleanedResponseText.length - 3);
    }
    cleanedResponseText = cleanedResponseText.trim(); // 再次 trim

    // 解析JSON响应
    let taskStatus;
    let actualRawAiResponseToLog = rawResponseText; // 默认记录整个后端响应

    try {
      taskStatus = JSON.parse(cleanedResponseText);
      // 如果解析成功，并且后端返回的JSON中有raw_ai_content，则优先使用它作为日志内容
      if (taskStatus && typeof taskStatus === 'object' && taskStatus.raw_ai_content) {
        actualRawAiResponseToLog = taskStatus.raw_ai_content;
      }
    } catch (parseError: any) {
      console.error(`获取任务状态失败 (${taskId}) - JSON解析错误:`, parseError);
      // 解析失败时，actualRawAiResponseToLog 仍然是 rawResponseText
      console.error(`获取任务状态失败 (${taskId}) - 原始AI响应:`, actualRawAiResponseToLog);
      throw new ApiError(`Failed to parse AI response for task ${taskId}: ${parseError.message}`, response.status);
    }

    // 简化的响应处理
    if (taskStatus.status === 'completed') {
      // 处理文件夹数据
      // 获取建议的文件夹名称
      let suggestedFolder: string = taskStatus.suggested_folder || '';

      return {
        task_id: taskId,
        status: 'completed',
        suggested_folder: suggestedFolder,
        url: options.url, // 使用传入的options中的url
        completed_at: new Date().toISOString()
      } as TaskStatusCompleted;
    }
    // 如果任务失败
    else if (taskStatus.status === 'failed') {
      console.error(`任务失败 (${taskId}):`, taskStatus.error);
      // 这里的 actualRawAiResponseToLog 已经被更新（如果成功解析了包含 raw_ai_content 的外层 JSON）
      console.error(`任务失败 (${taskId}) - 原始AI响应:`, actualRawAiResponseToLog);
      return {
        task_id: taskId,
        status: 'failed',
        error: taskStatus.error || '未知错误',
        // 将 taskStatus 中的 raw_ai_content (如果存在) 也传递到返回的错误对象中，虽然 TaskStatusFailed 类型目前没有它
        // 但调用者可能会检查这个属性
        ...(taskStatus.raw_ai_content && { raw_ai_content_from_backend: taskStatus.raw_ai_content })
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
 * 完整流程：提交文件夹建议任务并等待结果
 *
 * @param options - 任务选项
 * @param pollOptions - 轮询选项
 * @returns 建议的文件夹名称或抛出错误
 */
export async function suggestFolder(
  options: SuggestFolderOptions,
  pollOptions?: Parameters<typeof pollTaskUntilComplete>[1]
): Promise<string> {
  try {
    // 首先提交任务
    const taskId = await submitFolderSuggestionTask(options);

    // 准备轮询选项，添加任务选项
    const fullPollOptions = {
      ...pollOptions,
      taskOptions: options // 传递任务选项给轮询函数
    };

    // 调用轮询函数获取结果
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