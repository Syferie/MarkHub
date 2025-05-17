import { NextRequest, NextResponse } from 'next/server';
import {
  generateSignature,
  verifySignature,
  containsSuspiciousContent,
  encryptData,
  decryptData
} from '@/lib/security';

// 从环境变量中获取安全密钥
const SECRET_KEY = process.env.NEXT_PUBLIC_SECRET_KEY || '';

// 如果环境变量未设置，记录警告
if (!SECRET_KEY) {
  console.warn('警告: NEXT_PUBLIC_SECRET_KEY 环境变量未设置。请在生产环境中设置此变量以确保安全性。');
}

/**
 * API响应类型
 */
interface TaskResponse {
  task_id: string;
  status: string;
  status_url: string;
}

interface TaskStatusResponse {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  tags?: string[];
  error?: string;
}

/**
 * 获取API基础URL和密钥的函数
 *
 * 注意：在服务器端无法访问localStorage，所以这些值需要从客户端传递过来
 * 或者通过环境变量/配置文件提供
 */
function getApiSettings(request: Request) {
  try {
    // 从请求头中获取API基础URL和密钥
    const apiBaseUrl = request.headers.get('X-Api-Base-Url') || 'http://localhost:8080';
    const apiKey = request.headers.get('X-Api-Key');

    return { apiBaseUrl, apiKey };
  } catch (error) {
    console.error("获取API设置失败:", error);
    return { apiBaseUrl: 'http://localhost:8080', apiKey: null };
  }
}

/**
 * 处理生成标签的API请求 - 启动任务
 *
 * 此代理路由将接收来自前端的请求，转发到实际的后端API以启动标签生成任务，
 * 并将后端API返回的任务ID返回给前端
 */
// 为Vercel添加配置
export const config = {
  runtime: 'edge',
};

export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const body = await request.json();
    const { url, filter_tags } = body;

    if (!url) {
      return NextResponse.json(
        { error: '缺少URL参数' },
        { status: 400 }
      );
    }

    // 从请求头中获取API设置
    const { apiBaseUrl, apiKey } = getApiSettings(request);

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API密钥未配置' },
        { status: 401 }
      );
    }

    // 准备发送到后端的请求体
    const backendRequestBody = {
      url,
      filter_tags: filter_tags || [] // 直接传递数组，而不是字符串
    };

    // 向后端API发送请求 - 启动标签生成任务
    const backendResponse = await fetch(`${apiBaseUrl}/api/v1/tags/generate-from-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(backendRequestBody)
    });

    // 获取后端响应的状态和数据
    if (!backendResponse.ok) {
      // 处理后端返回的错误
      let errorMessage = '标签生成任务启动失败';
      try {
        const errorData = await backendResponse.json();
        errorMessage = errorData.error || errorData.message || `API错误: ${backendResponse.status}`;
        return NextResponse.json(
          { error: errorMessage },
          { status: backendResponse.status }
        );
      } catch (e) {
        // 后端可能返回非JSON格式的错误
        const textError = await backendResponse.text().catch(() => '未知错误');
        return NextResponse.json(
          { error: textError || errorMessage },
          { status: backendResponse.status }
        );
      }
    }

    // 获取任务响应并转发给前端
    const taskResponse = await backendResponse.json() as TaskResponse;

    // 将后端任务响应转发给前端
    return NextResponse.json(
      taskResponse,
      { status: backendResponse.status }
    );
  } catch (error) {
    console.error('API proxy error:', error);

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
 * 获取任务状态
 *
 * 此方法处理任务状态查询请求，通过任务ID查询后端API以获取任务的当前状态
 */
export async function GET(request: NextRequest) {
  try {
    // 从URL获取任务ID
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { error: '缺少taskId参数' },
        { status: 400 }
      );
    }

    // 从请求头中获取API设置
    const { apiBaseUrl, apiKey } = getApiSettings(request);

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API密钥未配置' },
        { status: 401 }
      );
    }

    // 向后端API发送任务状态查询请求
    const statusResponse = await fetch(`${apiBaseUrl}/api/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    // 处理错误响应
    if (!statusResponse.ok) {
      let errorMessage = '获取任务状态失败';
      try {
        const errorData = await statusResponse.json();
        errorMessage = errorData.error || errorData.message || `API错误: ${statusResponse.status}`;
      } catch (e) {
        // 后端可能返回非JSON格式的错误
        const textError = await statusResponse.text().catch(() => '未知错误');
        errorMessage = textError || errorMessage;
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: statusResponse.status }
      );
    }

    // 获取任务状态响应
    const taskStatus = await statusResponse.json() as TaskStatusResponse;

    // 验证响应内容，检测是否被篡改
    if (taskStatus.status === 'completed' && taskStatus.tags) {
      // 检查标签内容是否包含不适当内容
      if (containsSuspiciousContent(taskStatus.tags)) {
        console.error('API响应包含可疑标签，可能被篡改', {
          tags: taskStatus.tags
        });
        return NextResponse.json(
          { error: 'API响应可能被篡改，请联系管理员' },
          { status: 400 }
        );
      }
    }

    // 添加响应签名
    const responseWithSignature = {
      ...taskStatus,
      _signature: generateSignature(taskStatus, SECRET_KEY)
    };

    // 对敏感数据进行加密（如果有标签）
    if (responseWithSignature.tags && responseWithSignature.tags.length > 0) {
      // 加密标签数据
      const encryptedTags = encryptData(responseWithSignature.tags, SECRET_KEY);

      // 替换原始标签数据为加密数据
      const secureResponse = {
        ...responseWithSignature,
        tags: undefined, // 移除明文标签
        _encryptedTags: encryptedTags, // 添加加密标签
      };

      // 转发加密的响应
      return NextResponse.json(
        secureResponse,
        { status: 200 }
      );
    }

    // 转发验证后的任务状态响应（带签名）
    return NextResponse.json(
      responseWithSignature,
      { status: 200 }
    );
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