import { NextRequest, NextResponse } from 'next/server';

interface WebDAVRequestBody {
  operation: 'check' | 'upload' | 'download';
  serverUrl: string;
  username: string;
  password: string;
  storagePath: string;
  data?: any;
  fileName?: string; // 可选的自定义文件名
}

/**
 * WebDAV请求处理API路由
 * 作为代理服务器，处理来自客户端的WebDAV请求，避免CORS限制
 */
export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const body: WebDAVRequestBody = await request.json();
    const { operation, serverUrl, username, password, storagePath, data, fileName } = body;

    // 验证必要参数
    if (!operation || !serverUrl || !username || !password) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // 规范化URL和路径
    const normalizedUrl = normalizeUrl(serverUrl);
    // 如果是上传操作且客户端提供了文件名，则使用客户端提供的文件名
    // 否则生成带时间戳的文件名（上传）或使用普通文件名（下载/检查）
    const normalizedPath = normalizePath(storagePath, operation, fileName);
    const url = normalizedUrl + normalizedPath.substring(1); // 移除开头的斜杠以构建URL

    // 准备认证头
    const headers: Record<string, string> = {
      'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    };

    // 根据操作类型处理请求
    if (operation === 'check') {
      return await handleCheckOperation(url, headers);
    } else if (operation === 'upload') {
      return await handleUploadOperation(url, headers, data);
    } else if (operation === 'download') {
      return await handleDownloadOperation(url, headers);
    } else {
      return NextResponse.json(
        { error: 'Invalid operation' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('WebDAV proxy error:', error);
    return NextResponse.json(
      {
        error: `Request processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * 处理检查文件是否存在的操作
 */
async function handleCheckOperation(url: string, headers: Record<string, string>) {
  try {
    // 使用PROPFIND方法检查文件是否存在
    headers['Depth'] = '0';
    headers['Content-Type'] = 'application/xml';

    const response = await fetch(url, {
      method: 'PROPFIND',
      headers,
    });

    // 文件存在时WebDAV服务器通常返回207状态码
    if (response.ok || response.status === 207) {
      return NextResponse.json({ exists: true, status: response.status });
    } else {
      // 文件不存在或其他错误
      return NextResponse.json(
        {
          exists: false,
          status: response.status,
          statusText: response.statusText
        },
        { status: 200 } // 返回200给客户端，但内容表示文件不存在
      );
    }
  } catch (error) {
    console.error('WebDAV check operation error:', error);
    return NextResponse.json(
      {
        error: `Check operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        exists: false
      },
      { status: 500 }
    );
  }
}

/**
 * 处理上传文件操作
 */
async function handleUploadOperation(url: string, headers: Record<string, string>, data: any) {
  try {
    // 添加内容类型头
    headers['Content-Type'] = 'application/json';

    // 发送PUT请求上传数据
    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data)
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        status: response.status
      });
    } else {
      // 尝试获取错误详情
      let errorDetails = '';
      try {
        const text = await response.text();
        errorDetails = text;
      } catch (e) {
        errorDetails = 'Could not retrieve error details';
      }

      return NextResponse.json(
        {
          success: false,
          status: response.status,
          statusText: response.statusText,
          details: errorDetails
        },
        { status: 200 } // 返回200给客户端，但内容表示上传失败
      );
    }
  } catch (error) {
    console.error('WebDAV upload operation error:', error);
    return NextResponse.json(
      {
        error: `Upload operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        success: false
      },
      { status: 500 }
    );
  }
}

/**
 * 处理下载文件操作，支持查找最新的备份文件
 */
async function handleDownloadOperation(url: string, headers: Record<string, string>) {
  try {
    // 首先尝试直接下载请求的文件
    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    // 如果文件存在直接返回
    if (response.ok) {
      try {
        const data = await response.json();
        return NextResponse.json({
          success: true,
          data,
          status: response.status
        });
      } catch (error) {
        console.error('Error parsing WebDAV response as JSON:', error);

        // 如果不是JSON，返回文本内容
        const text = await response.text();
        return NextResponse.json({
          success: false,
          error: 'Invalid JSON data',
          text: text.substring(0, 1000), // 限制返回的文本长度
          status: response.status
        });
      }
    }

    // 如果直接下载失败，尝试查找目录中最新的备份文件
    console.log("Requested file not found, trying to find latest timestamped backup...");

    // 获取目录的基本URL（去掉文件名部分）
    const urlParts = url.split('/');
    urlParts.pop(); // 移除文件名
    const directoryUrl = urlParts.join('/') + '/';

    // 使用PROPFIND列出目录内容
    headers['Depth'] = '1'; // 列出目录中的所有项目
    headers['Content-Type'] = 'application/xml';

    const propfindResponse = await fetch(directoryUrl, {
      method: 'PROPFIND',
      headers
    });

    if (!propfindResponse.ok && propfindResponse.status !== 207) {
      // 无法列出目录
      console.error(`PROPFIND failed: ${propfindResponse.status} ${propfindResponse.statusText}`);
      return NextResponse.json({
        success: false,
        error: `Unable to list directory: ${propfindResponse.status} ${propfindResponse.statusText}`,
        status: 200 // 返回200给客户端，但内容表示下载失败
      });
    }

    // 解析WebDAV目录列表响应
    const responseText = await propfindResponse.text();

    // 记录PROPFIND响应的部分内容，帮助调试
    console.log(`PROPFIND response (first 500 chars): ${responseText.substring(0, 500)}...`);
    console.log(`PROPFIND response contains "bookmarks_": ${responseText.includes("bookmarks_")}`);

    // 尝试不同的正则表达式模式来查找备份文件
    const patterns = [
      // 标准模式：完全匹配14位数字的时间戳
      { regex: /bookmarks_\d{14}\.json/g, name: "Standard mode (14 digits)" },
      // 宽松模式1：匹配任意数字
      { regex: /bookmarks_[0-9]+\.json/g, name: "Relaxed mode (any digits)" },
      // 宽松模式2：匹配可能被XML转义的文件名
      { regex: /bookmarks_[0-9]+\.json/gi, name: "Relaxed mode (case insensitive)" },
      // 宽松模式3：匹配URL编码的可能性
      { regex: /bookmarks_[0-9]+(?:\.json|%2Ejson)/gi, name: "Relaxed mode (URL encoded)" }
    ];

    let matches = null;
    let matchedPattern = "";

    // 尝试所有模式直到找到匹配
    for (const pattern of patterns) {
      const result = responseText.match(pattern.regex);
      console.log(`${pattern.name} match result: ${result ? JSON.stringify(result) : 'null'}`);

      if (result && result.length > 0) {
        matches = result;
        matchedPattern = pattern.name;
        break;
      }
    }

    console.log(`Final matching pattern used: ${matchedPattern || 'No match'}`);

    // 如果没有找到任何备份文件
    if (!matches || matches.length === 0) {
      console.log("No backup files found with any pattern");
      return NextResponse.json({
        success: false,
        error: 'No backup files found in directory',
        status: 404
      });
    }

    // 按时间戳排序找到最新的备份文件
    const latestFile = findLatestBackupFile(matches);
    console.log(`找到最新的备份文件: ${latestFile}`);

    // 下载最新的备份文件
    const latestFileUrl = directoryUrl + latestFile;

    // 创建新的headers，移除PROPFIND特有的headers
    const downloadHeaders = { ...headers };
    delete downloadHeaders['Depth'];
    delete downloadHeaders['Content-Type'];

    const latestFileResponse = await fetch(latestFileUrl, {
      method: 'GET',
      headers: downloadHeaders
    });

    if (!latestFileResponse.ok) {
      // 无法下载最新备份文件
      return NextResponse.json({
        success: false,
        error: `Failed to download latest backup: ${latestFileResponse.status} ${latestFileResponse.statusText}`,
        status: 200
      });
    }

    // 解析并返回最新备份文件的数据
    try {
      const data = await latestFileResponse.json();
      return NextResponse.json({
        success: true,
        data,
        status: latestFileResponse.status,
        fileName: latestFile // 返回找到的文件名
      });
    } catch (error) {
      console.error('Error parsing latest backup file:', error);
      return NextResponse.json({
        success: false,
        error: 'Invalid JSON data in latest backup file',
        status: 500
      });
    }
  } catch (error) {
    console.error('WebDAV download operation error:', error);
    return NextResponse.json(
      {
        error: `Download operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        success: false
      },
      { status: 500 }
    );
  }
}

/**
 * 辅助函数：从备份文件名列表中找出最新的文件
 * 按时间戳的数值（而非字典序）排序，确保真正找到最新的文件
 */
function findLatestBackupFile(files: string[]): string {
  // 记录原始文件列表
  console.log(`Original backup files: ${JSON.stringify(files)}`);

  // 提取每个文件名中的时间戳并按时间戳数值排序
  const sortedFiles = [...files].sort((a, b) => {
    // 提取时间戳部分 (bookmarks_TIMESTAMP.json)
    const timestampA = a.match(/bookmarks_(\d+)\.json/)?.[1] || "";
    const timestampB = b.match(/bookmarks_(\d+)\.json/)?.[1] || "";

    // 如果格式不匹配，按原始字符串比较
    if (!timestampA || !timestampB) {
      return a.localeCompare(b);
    }

    // 将时间戳转换为数字后比较，较大的时间戳表示较新的文件
    // 由于JavaScript的数字限制，将时间戳作为字符串比较，但使用自然排序
    return timestampA.length !== timestampB.length
      ? timestampA.length - timestampB.length  // 先按长度排序
      : timestampA.localeCompare(timestampB);  // 长度相同时按字典序排序
  });

  console.log(`Sorted backup files: ${JSON.stringify(sortedFiles)}`);

  // 返回最后一个（最新的）文件
  return sortedFiles[sortedFiles.length - 1];
}

/**
 * 辅助函数：规范化URL
 * 确保URL以斜杠结尾
 */
function normalizeUrl(url: string): string {
  if (!url) return "";
  url = url.trim();
  if (!url.endsWith("/")) {
    url += "/";
  }
  return url;
}

/**
 * 辅助函数：生成格式为YYYYMMDDHHMMSS的时间戳
 */
function generateTimestamp(): string {
  const now = new Date();
  return now.getFullYear().toString() +
         (now.getMonth() + 1).toString().padStart(2, '0') +
         now.getDate().toString().padStart(2, '0') +
         now.getHours().toString().padStart(2, '0') +
         now.getMinutes().toString().padStart(2, '0') +
         now.getSeconds().toString().padStart(2, '0');
}

/**
 * 辅助函数：规范化路径
 * 确保路径以斜杠开头和结尾，并根据操作类型和可选的自定义文件名添加适当的文件名
 *
 * @param path 基本路径
 * @param operation 操作类型（'upload'/'download'/'check'）
 * @param customFileName 可选的自定义文件名
 * @returns 完整规范化路径
 */
function normalizePath(path: string, operation?: string, customFileName?: string): string {
  if (!path) path = "";
  path = path.trim();
  if (!path.startsWith("/")) {
    path = "/" + path;
  }
  if (!path.endsWith("/")) {
    path += "/";
  }

  // 如果提供了自定义文件名，使用它
  if (customFileName) {
    return path + customFileName;
  }

  // 根据操作类型决定文件名
  if (operation === 'upload') {
    // 上传时使用带时间戳的文件名
    return path + `bookmarks_${generateTimestamp()}.json`;
  } else {
    // 下载或检查时使用普通文件名（兼容旧版本）
    return path + "bookmarks.json";
  }
}