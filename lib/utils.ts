import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 检查给定的 favicon URL 是否有效。
 * 目前，这只是检查 URL 是否可以成功获取 (HTTP 200 OK)。
 * @param url 要验证的 favicon URL。
 * @returns 如果 favicon 有效则返回 true，否则返回 false。
 */
async function isValidFavicon(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' }); // 使用 HEAD 请求以避免下载整个图片
    return response.ok; // 检查 HTTP 状态码是否在 200-299 范围内
  } catch (error) {
    console.error(`Error validating favicon ${url}:`, error);
    return false;
  }
}

/**
 * 尝试获取给定页面 URL 的最佳 favicon URL。
 * 它会依次尝试 Google 和 DuckDuckGo 的 favicon 服务。
 * @param pageUrl 网页的完整 URL。
 * @returns favicon 的 URL 字符串，如果找不到则返回 null。
 */
export async function getOptimalFaviconUrl(pageUrl: string): Promise<string | null> {
  if (!pageUrl) {
    return null;
  }

  let hostname: string;
  try {
    const urlObject = new URL(pageUrl);
    hostname = urlObject.hostname;
  } catch (error) {
    console.error("Invalid pageUrl for favicon fetching:", pageUrl, error);
    return null;
  }

  // 1. 尝试 Google Favicon 服务
  const googleFaviconUrl = `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(pageUrl)}&size=64`;
  try {
    const response = await fetch(googleFaviconUrl);
    if (response.ok) {
      // 简单的验证：检查内容类型是否为图片，并且内容长度大于某个阈值（例如 100 字节）
      // Google 的默认图标可能很小或者有特定的内容类型
      const contentType = response.headers.get("content-type");
      const contentLength = response.headers.get("content-length");

      if (contentType && contentType.startsWith("image/") && contentLength && parseInt(contentLength, 10) > 100) {
         // 进一步验证，确保它不是一个已知的 Google 占位符
         // 这是一个更复杂的步骤，暂时我们假设成功的响应和合理的大小意味着它是一个有效的图标
        return googleFaviconUrl;
      }
    }
  } catch (error) {
    console.warn(`Failed to fetch favicon from Google for ${pageUrl}:`, error);
  }

  // 2. 尝试 DuckDuckGo Favicon 服务
  const duckduckgoFaviconUrl = `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  try {
    // DuckDuckGo 的服务有时即使没有图标也会返回 200 OK，但内容可能不是有效的 ICO。
    // isValidFavicon 可以帮助进行更可靠的检查。
    if (await isValidFavicon(duckduckgoFaviconUrl)) {
        // 为了更可靠，我们可以实际获取图标并检查其内容，
        // 但对于 .ico 文件，HEAD 请求可能不足以判断其有效性。
        // DuckDuckGo 通常直接重定向到实际的 favicon.ico 或返回一个有效的图标。
        // 我们假设如果 isValidFavicon 返回 true，则它是可用的。
        const checkResponse = await fetch(duckduckgoFaviconUrl);
        if (checkResponse.ok) {
            const contentType = checkResponse.headers.get("content-type");
            const contentLength = checkResponse.headers.get("content-length");
            // .ico 文件可能没有标准的 image/* 类型，可能是 image/x-icon, image/vnd.microsoft.icon
            // 并且大小可能变化很大
            if (contentType && (contentType.startsWith("image/") || contentType === "application/octet-stream") && contentLength && parseInt(contentLength, 10) > 0){
                 return duckduckgoFaviconUrl;
            }
        }
    }
  } catch (error) {
    console.warn(`Failed to fetch favicon from DuckDuckGo for ${hostname}:`, error);
  }

  // 3. 回退
  return null;
}
