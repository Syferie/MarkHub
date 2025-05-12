import { NextRequest, NextResponse } from 'next/server';

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
    console.error('API代理发生错误:', error);
    
    // 改进错误处理，返回结构化的错误响应
    return NextResponse.json(
      {
        error: `处理请求时发生错误: ${error instanceof Error ? error.message : '未知错误'}`,
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
    
    // 获取并转发任务状态响应
    const taskStatus = await statusResponse.json() as TaskStatusResponse;
    
    return NextResponse.json(
      taskStatus,
      { status: 200 }
    );
  } catch (error) {
    console.error('获取任务状态时发生错误:', error);
    
    return NextResponse.json(
      {
        error: `获取任务状态时发生错误: ${error instanceof Error ? error.message : '未知错误'}`,
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}