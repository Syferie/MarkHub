/**
 * Markhub API 通信模块
 * 
 * 该模块负责:
 * 1. 用户认证 (登录/登出)
 * 2. 书签和文件夹的 CRUD 操作
 * 3. 与 Markhub 后端的所有 API 通信
 */

import { getConfigManager } from './ConfigManager';

// 自定义错误类型
export class AIServiceNotAvailableError extends Error {
  constructor(message: string = 'AI tag recommendation service is not available or not yet implemented on the server') {
    super(message);
    this.name = 'AIServiceNotAvailableError';
  }
}

// API 响应接口
interface APIResponse<T = any> {
  items?: T[];
  [key: string]: any;
}

// 认证响应接口
interface AuthResponse {
  token: string;
  record: {
    id: string;
    email: string;
    [key: string]: any;
  };
}

// 书签接口
export interface Bookmark {
  id: string;
  title: string;
  url: string;
  folderId?: string | null;
  favicon?: string;
  isFavorite?: boolean;
  tags?: string[];
  userId: string;
  createdAt: string;
  updatedAt: string;
  faviconUrl?: string | null;
  chromeBookmarkId?: string; // 用于关联 Chrome 书签
}

// 文件夹接口
export interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  chromeParentId?: string; // 用于关联 Chrome 文件夹
}

/**
 * Markhub API 客户端类
 */
export class MarkhubAPIClient {
  private static instance: MarkhubAPIClient;
  private configManager = getConfigManager();
  
  // 全局文件夹缓存，用于跨多个同步操作共享文件夹状态
  private globalFolderCache: Folder[] | null = null;
  private folderCacheTimestamp: number = 0;
  private readonly CACHE_EXPIRY_MS = 30000; // 30秒缓存过期时间
  
  // 防止并发创建文件夹的锁机制
  private folderCreationLocks = new Map<string, Promise<Folder>>();

  private constructor() {}

  /**
   * 获取 API 客户端单例
   */
  public static getInstance(): MarkhubAPIClient {
    if (!MarkhubAPIClient.instance) {
      MarkhubAPIClient.instance = new MarkhubAPIClient();
    }
    return MarkhubAPIClient.instance;
  }

  /**
   * 通用 API 请求方法
   */
  private async fetchAPI<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
    body?: any,
    useAuth: boolean = true
  ): Promise<T> {
    const config = await this.configManager.getConfig();
    const url = `${config.markhubApiUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (useAuth && config.authToken) {
      headers['Authorization'] = `Bearer ${config.authToken}`;
    }

    const requestConfig: RequestInit = {
      method,
      headers,
    };

    if (body) {
      requestConfig.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, requestConfig);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          message: response.statusText
        }));
        
        // 如果是认证错误，清除 token 和缓存
        if (response.status === 401 || response.status === 403) {
          await this.configManager.set('authToken', '');
          this.clearFolderCache();
        }
        
        // 注意：移除了之前针对 AI 标签推荐接口的特定 404 错误处理
        // 现在 404 错误将作为常规错误处理（如书签 ID 无效等）
        
        throw new Error(errorData.message || `API request failed with status ${response.status}`);
      }

      // 处理无内容响应
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      // 只在真正的网络错误时记录日志，认证错误等预期错误不记录
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.error('Network error during API request:', error);
      }
      throw error;
    }
  }

  /**
   * 用户登录
   */
  public async login(identity: string, password: string): Promise<AuthResponse> {
    const response = await this.fetchAPI<AuthResponse>(
      '/api/collections/users/auth-with-password',
      'POST',
      { identity, password },
      false // 登录时不需要认证
    );

    // 保存认证 token
    if (response.token) {
      await this.configManager.set('authToken', response.token);
    }

    return response;
  }

  /**
   * 用户登出
   */
  public async logout(): Promise<void> {
    await this.configManager.set('authToken', '');
    // 清除文件夹缓存
    this.clearFolderCache();
  }

  /**
   * 检查认证状态
   */
  public isAuthenticated(): boolean {
    const token = this.configManager.getSync('authToken');
    return !!token;
  }

  /**
   * 获取所有书签
   */
  public async getBookmarks(): Promise<Bookmark[]> {
    const response = await this.fetchAPI<APIResponse<Bookmark>>('/api/collections/bookmarks/records');
    return response.items || [];
  }

  /**
   * 创建书签
   */
  public async createBookmark(bookmarkData: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'userId'>): Promise<Bookmark> {
    return this.fetchAPI<Bookmark>(
      '/api/collections/bookmarks/records',
      'POST',
      bookmarkData
    );
  }

  /**
   * 更新书签
   */
  public async updateBookmark(bookmarkId: string, bookmarkData: Partial<Bookmark>): Promise<Bookmark> {
    return this.fetchAPI<Bookmark>(
      `/api/collections/bookmarks/records/${bookmarkId}`,
      'PATCH',
      bookmarkData
    );
  }

  /**
   * 删除书签
   */
  public async deleteBookmark(bookmarkId: string): Promise<void> {
    await this.fetchAPI<void>(
      `/api/collections/bookmarks/records/${bookmarkId}`,
      'DELETE'
    );
  }

  /**
   * 获取所有文件夹
   */
  public async getFolders(): Promise<Folder[]> {
    const response = await this.fetchAPI<APIResponse<Folder>>('/api/collections/folders/records');
    return response.items || [];
  }

  /**
   * 获取缓存的文件夹列表，如果缓存过期或不存在则重新获取
   */
  private async getCachedFolders(): Promise<Folder[]> {
    const now = Date.now();
    
    // 检查缓存是否有效
    if (this.globalFolderCache && (now - this.folderCacheTimestamp) < this.CACHE_EXPIRY_MS) {
      return this.globalFolderCache;
    }
    
    // 缓存过期或不存在，重新获取
    console.log('MarkhubAPIClient: Refreshing folder cache');
    this.globalFolderCache = await this.getFolders();
    this.folderCacheTimestamp = now;
    
    return this.globalFolderCache;
  }

  /**
   * 将新创建的文件夹添加到缓存中
   */
  private addFolderToCache(folder: Folder): void {
    if (this.globalFolderCache) {
      // 检查是否已存在，避免重复添加
      const exists = this.globalFolderCache.find(f => f.id === folder.id);
      if (!exists) {
        this.globalFolderCache.push(folder);
        console.log(`MarkhubAPIClient: Added folder "${folder.name}" to cache`);
      }
    }
  }

  /**
   * 清除文件夹缓存（在需要强制刷新时使用）
   */
  public clearFolderCache(): void {
    this.globalFolderCache = null;
    this.folderCacheTimestamp = 0;
    this.folderCreationLocks.clear();
    console.log('MarkhubAPIClient: Folder cache and locks cleared');
  }

  /**
   * 创建文件夹
   */
  public async createFolder(folderData: Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'userId'>): Promise<Folder> {
    return this.fetchAPI<Folder>(
      '/api/collections/folders/records',
      'POST',
      folderData
    );
  }

  /**
   * 通过后端 API 确保文件夹路径存在
   * 这个方法将文件夹查找和创建的逻辑完全移到后端处理
   */
  public async ensureFolderPathViaAPI(folderPath: string[]): Promise<string | null> {
    try {
      const response = await this.fetchAPI<{
        folderId: string | null;
        created: string[];
      }>(
        '/api/custom/ensure-folder-path',
        'POST',
        { folderPath }
      );

      if (response.created.length > 0) {
        console.log(`MarkhubAPIClient: Created folders via API: ${response.created.join(', ')}`);
      }

      return response.folderId;
    } catch (error) {
      console.error('MarkhubAPIClient: Error ensuring folder path via API:', error);
      throw error;
    }
  }

  /**
   * 更新文件夹
   */
  public async updateFolder(folderId: string, folderData: Partial<Folder>): Promise<Folder> {
    return this.fetchAPI<Folder>(
      `/api/collections/folders/records/${folderId}`,
      'PATCH',
      folderData
    );
  }

  /**
   * 删除文件夹
   */
  public async deleteFolder(folderId: string): Promise<void> {
    await this.fetchAPI<void>(
      `/api/collections/folders/records/${folderId}`,
      'DELETE'
    );
  }

  /**
   * 触发 AI 标签推荐并设置
   * 调用后端接口为指定书签生成并设置 AI 推荐的标签
   */
  public async triggerAITagSuggestion(bookmarkId: string): Promise<{
    success: boolean;
    message: string;
    bookmark: Bookmark;
    aiUsed: boolean;
  }> {
    return this.fetchAPI<{
      success: boolean;
      message: string;
      bookmark: Bookmark;
      aiUsed: boolean;
    }>(
      `/api/custom/bookmarks/${bookmarkId}/ai-suggest-and-set-tags`,
      'POST'
    );
  }

  /**
   * 根据 Chrome 书签对象获取其完整的文件夹路径
   * 返回从根目录到直接父文件夹的路径数组
   */
  public async getChromeBookmarkFolderPath(chromeBookmarkId: string): Promise<string[]> {
    try {
      // 获取书签信息
      const bookmarks = await chrome.bookmarks.get(chromeBookmarkId);
      if (bookmarks.length === 0) {
        throw new Error(`Chrome bookmark not found: ${chromeBookmarkId}`);
      }

      const bookmark = bookmarks[0];
      if (!bookmark.parentId) {
        return []; // 根目录
      }

      // 递归获取父文件夹路径
      const path: string[] = [];
      let currentParentId: string | null = bookmark.parentId || null;

      while (currentParentId) {
        const parentNodes = await chrome.bookmarks.get(currentParentId);
        if (parentNodes.length === 0) break;

        const parentNode = parentNodes[0];
        
        // 跳过根节点和系统文件夹
        if (parentNode.id !== '0' && parentNode.title &&
            !['Other bookmarks', '其他书签', 'Bookmarks bar', '书签栏'].includes(parentNode.title)) {
          path.unshift(parentNode.title); // 添加到路径开头
        }

        currentParentId = parentNode.parentId || null;
      }

      return path;
    } catch (error) {
      console.error('Error getting Chrome bookmark folder path:', error);
      return [];
    }
  }

  /**
   * 根据 Chrome 文件夹路径确保 Markhub 中存在对应文件夹
   * 返回最终文件夹的 Markhub ID
   */
  public async ensureFolderPath(
    chromeFolderPath: string[],
    folderCache?: Map<string, Folder[]>
  ): Promise<string | null> {
    if (chromeFolderPath.length === 0) {
      return null; // 根目录
    }

    // 优先使用全局缓存，兼容传统的 Map 缓存（用于 performInitialSync）
    let folders: Folder[];
    if (folderCache) {
      // 兼容现有的 Map 缓存逻辑（如 performInitialSync 中的用法）
      const cacheKey = 'all_folders';
      if (!folderCache.has(cacheKey)) {
        folders = await this.getFolders();
        folderCache.set(cacheKey, folders);
      } else {
        folders = folderCache.get(cacheKey)!;
      }
    } else {
      // 使用全局缓存
      folders = await this.getCachedFolders();
    }

    let currentParentId: string | null = null;

    for (const folderName of chromeFolderPath) {
      // 查找当前层级是否已存在该文件夹
      const existingFolder = folders.find(f =>
        f.name === folderName && f.parentId === currentParentId
      );

      if (existingFolder) {
        currentParentId = existingFolder.id;
      } else {
        // 使用锁机制防止并发创建相同文件夹
        const lockKey = `${folderName}:${currentParentId || 'root'}`;
        
        let newFolder: Folder;
        if (this.folderCreationLocks.has(lockKey)) {
          // 如果已经有相同的文件夹正在创建，等待其完成
          console.log(`MarkhubAPIClient: Waiting for concurrent folder creation: ${folderName}`);
          newFolder = await this.folderCreationLocks.get(lockKey)!;
        } else {
          // 创建新的文件夹创建 Promise 并加锁
          const creationPromise = this.createFolder({
            name: folderName,
            parentId: currentParentId,
          });
          
          this.folderCreationLocks.set(lockKey, creationPromise);
          
          try {
            newFolder = await creationPromise;
            console.log(`MarkhubAPIClient: Created new folder "${folderName}" with ID: ${newFolder.id}`);
          } finally {
            // 创建完成后移除锁
            this.folderCreationLocks.delete(lockKey);
          }
        }
        
        // 添加到相应的缓存中
        if (folderCache) {
          // 兼容现有逻辑，添加到 Map 缓存
          const cacheKey = 'all_folders';
          const cachedFolders = folderCache.get(cacheKey);
          if (cachedFolders) {
            // 检查是否已存在，避免重复添加
            const exists = cachedFolders.find(f => f.id === newFolder.id);
            if (!exists) {
              cachedFolders.push(newFolder);
            }
          }
        } else {
          // 添加到全局缓存
          this.addFolderToCache(newFolder);
        }
        
        // 同时添加到当前使用的 folders 数组（检查重复）
        const exists = folders.find(f => f.id === newFolder.id);
        if (!exists) {
          folders.push(newFolder);
        }
        
        currentParentId = newFolder.id;
      }
    }

    return currentParentId;
  }

  /**
   * 根据 Chrome 书签 ID 确保其文件夹路径在 Markhub 中存在
   * 返回最终文件夹的 Markhub ID
   */
  public async ensureChromeBookmarkFolderPath(chromeBookmarkId: string): Promise<string | null> {
    const chromeFolderPath = await this.getChromeBookmarkFolderPath(chromeBookmarkId);
    
    try {
      // 优先使用新的后端 API 来处理文件夹路径确保，避免客户端并发问题
      return await this.ensureFolderPathViaAPI(chromeFolderPath);
    } catch (error) {
      console.warn('MarkhubAPIClient: New API failed, falling back to old method:', error);
      // 如果新 API 失败，回退到原来的方法
      return this.ensureFolderPath(chromeFolderPath);
    }
  }
}

// 导出工厂函数
export const getMarkhubAPIClient = () => MarkhubAPIClient.getInstance();