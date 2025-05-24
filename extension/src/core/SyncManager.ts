/**
 * Markhub Chrome Extension - 同步管理器
 * 
 * 该模块负责:
 * 1. 处理 Chrome 书签到 Markhub 的同步
 * 2. 确保文件夹路径在 Markhub 中存在
 * 3. 调用 AI 标签推荐 API
 * 4. 错误处理和重试机制
 */

import { getConfigManager } from './ConfigManager';
import { getMarkhubAPIClient, Bookmark } from './MarkhubAPIClient';
import { t } from '../utils/coreI18n';

/**
 * 同步结果接口
 */
export interface SyncResult {
  success: boolean;
  markhubBookmarkId?: string;
  error?: string;
}

/**
 * Chrome 书签信息接口
 */
export interface ChromeBookmarkInfo {
  id: string;
  title: string;
  url: string;
  parentId?: string;
}

/**
 * 同步管理器类
 */
export class SyncManager {
  private static instance: SyncManager;
  private configManager = getConfigManager();
  private apiClient = getMarkhubAPIClient();

  private constructor() {}

  /**
   * 获取同步管理器单例
   */
  public static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  /**
   * 同步新书签到 Markhub
   */
  public async syncNewBookmark(chromeBookmark: ChromeBookmarkInfo): Promise<SyncResult> {
    try {
      console.log('SyncManager: Starting bookmark sync', chromeBookmark);

      // 检查同步功能是否启用
      const config = await this.configManager.getConfig();
      if (!config.syncEnabled) {
        console.log('SyncManager: Sync is disabled, skipping');
        return { success: false, error: t('syncDisabled') };
      }

      // 检查用户是否已认证
      if (!this.apiClient.isAuthenticated()) {
        console.log('SyncManager: User not authenticated, skipping sync');
        return { success: false, error: t('userNotAuthenticated') };
      }

      // 确保文件夹路径在 Markhub 中存在
      const markhubFolderId = await this.apiClient.ensureChromeBookmarkFolderPath(chromeBookmark.id);
      console.log('SyncManager: Ensured folder path, folderId:', markhubFolderId);

      // 创建书签数据
      const bookmarkData = {
        title: chromeBookmark.title,
        url: chromeBookmark.url,
        folderId: markhubFolderId,
        chromeBookmarkId: chromeBookmark.id,
      };

      // 调用 API 创建书签
      const newBookmark = await this.apiClient.createBookmark(bookmarkData);
      console.log('SyncManager: Bookmark created successfully', newBookmark);

      // 触发 AI 标签推荐
      await this.triggerAITagRecommendation(newBookmark.id);

      return {
        success: true,
        markhubBookmarkId: newBookmark.id,
      };

    } catch (error) {
      console.error('SyncManager: Error syncing bookmark:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : t('unknownError'),
      };
    }
  }

  /**
   * 更新书签同步
   */
  public async syncBookmarkUpdate(chromeBookmark: ChromeBookmarkInfo): Promise<SyncResult> {
    try {
      console.log('SyncManager: Starting bookmark update sync', chromeBookmark);

      // 检查同步功能是否启用
      const config = await this.configManager.getConfig();
      if (!config.syncEnabled) {
        console.log('SyncManager: Sync is disabled, skipping');
        return { success: false, error: t('syncDisabled') };
      }

      // 检查用户是否已认证
      if (!this.apiClient.isAuthenticated()) {
        console.log('SyncManager: User not authenticated, skipping sync');
        return { success: false, error: t('userNotAuthenticated') };
      }

      // 查找对应的 Markhub 书签
      const markhubBookmark = await this.findMarkhubBookmarkByChromeId(chromeBookmark.id);
      if (!markhubBookmark) {
        console.log('SyncManager: Markhub bookmark not found, creating new one');
        return this.syncNewBookmark(chromeBookmark);
      }

      // 确保文件夹路径在 Markhub 中存在
      const markhubFolderId = await this.apiClient.ensureChromeBookmarkFolderPath(chromeBookmark.id);

      // 更新书签数据
      const updateData = {
        title: chromeBookmark.title,
        url: chromeBookmark.url,
        folderId: markhubFolderId,
      };

      // 调用 API 更新书签
      const updatedBookmark = await this.apiClient.updateBookmark(markhubBookmark.id, updateData);
      console.log('SyncManager: Bookmark updated successfully', updatedBookmark);

      return {
        success: true,
        markhubBookmarkId: updatedBookmark.id,
      };

    } catch (error) {
      console.error('SyncManager: Error updating bookmark:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : t('unknownError'),
      };
    }
  }

  /**
   * 删除书签同步
   */
  public async syncBookmarkDeletion(chromeBookmarkId: string): Promise<SyncResult> {
    try {
      console.log('SyncManager: Starting bookmark deletion sync', chromeBookmarkId);

      // 检查同步功能是否启用
      const config = await this.configManager.getConfig();
      if (!config.syncEnabled) {
        console.log('SyncManager: Sync is disabled, skipping');
        return { success: false, error: t('syncDisabled') };
      }

      // 检查用户是否已认证
      if (!this.apiClient.isAuthenticated()) {
        console.log('SyncManager: User not authenticated, skipping sync');
        return { success: false, error: t('userNotAuthenticated') };
      }

      // 查找对应的 Markhub 书签
      const markhubBookmark = await this.findMarkhubBookmarkByChromeId(chromeBookmarkId);
      if (!markhubBookmark) {
        console.log('SyncManager: Markhub bookmark not found, nothing to delete');
        return { success: true }; // 认为删除成功
      }

      // 调用 API 删除书签
      await this.apiClient.deleteBookmark(markhubBookmark.id);
      console.log('SyncManager: Bookmark deleted successfully');

      return { success: true };

    } catch (error) {
      console.error('SyncManager: Error deleting bookmark:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : t('unknownError'),
      };
    }
  }

  /**
   * 触发 AI 标签推荐
   */
  private async triggerAITagRecommendation(markhubBookmarkId: string): Promise<void> {
    try {
      console.log('SyncManager: Triggering AI tag recommendation for bookmark:', markhubBookmarkId);
      
      const response = await this.apiClient.triggerAITagSuggestion(markhubBookmarkId);
      
      if (response.success) {
        console.log(`SyncManager: AI tags successfully suggested and set for bookmark ${markhubBookmarkId}.`, {
          message: response.message,
          aiUsed: response.aiUsed,
          tags: response.bookmark.tags
        });
      } else {
        console.warn('SyncManager: AI tag recommendation returned unsuccessful response:', response);
      }
      
    } catch (error) {
      // 处理各种可能的错误情况
      console.error('SyncManager: AI tag recommendation failed:', error);
      
      if (error instanceof Error) {
        // 根据错误信息提供更具体的日志
        if (error.message.includes('404')) {
          console.warn('SyncManager: Bookmark not found for AI tag recommendation (404 error)');
        } else if (error.message.includes('401') || error.message.includes('403')) {
          console.warn('SyncManager: Authentication/authorization error for AI tag recommendation');
        } else if (error.message.includes('500')) {
          console.warn('SyncManager: Server error during AI tag recommendation (backend AI service may have failed)');
        } else {
          console.warn('SyncManager: Unexpected error during AI tag recommendation:', error.message);
        }
      }
      
      // 不抛出错误，因为书签同步已经成功，标签推荐失败不应该影响主流程
    }
  }

  /**
   * 根据 Chrome 书签 ID 查找对应的 Markhub 书签
   */
  private async findMarkhubBookmarkByChromeId(chromeBookmarkId: string): Promise<Bookmark | null> {
    try {
      const bookmarks = await this.apiClient.getBookmarks();
      return bookmarks.find(b => b.chromeBookmarkId === chromeBookmarkId) || null;
    } catch (error) {
      console.error('SyncManager: Error finding Markhub bookmark:', error);
      return null;
    }
  }

  /**
   * 检查同步是否可用
   */
  public isSyncAvailable(): boolean {
    const config = this.configManager.getConfigSync();
    return config.syncEnabled && this.apiClient.isAuthenticated();
  }

  /**
   * 批量同步书签（用于首次同步）
   */
  public async batchSyncBookmarks(chromeBookmarks: ChromeBookmarkInfo[]): Promise<{
    successful: number;
    failed: number;
    errors: string[];
  }> {
    console.log('SyncManager: Starting batch sync for', chromeBookmarks.length, 'bookmarks');
    
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const bookmark of chromeBookmarks) {
      try {
        const result = await this.syncNewBookmark(bookmark);
        if (result.success) {
          successful++;
        } else {
          failed++;
          if (result.error) {
            errors.push(`${bookmark.title}: ${result.error}`);
          }
        }
      } catch (error) {
        failed++;
        errors.push(`${bookmark.title}: ${error instanceof Error ? error.message : t('unknownError')}`);
      }

      // 添加小延迟避免 API 限制
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('SyncManager: Batch sync completed', { successful, failed, errors: errors.length });
    
    return { successful, failed, errors };
  }

  /**
   * 执行首次全量数据同步
   */
  public async performInitialSync(): Promise<{
    success: boolean;
    foldersCreated: number;
    bookmarksCreated: number;
    errors: string[];
  }> {
    console.log('SyncManager: Starting initial sync');
    
    const result = {
      success: false,
      foldersCreated: 0,
      bookmarksCreated: 0,
      errors: [] as string[]
    };

    try {
      // 检查同步功能是否启用
      const config = await this.configManager.getConfig();
      if (!config.syncEnabled) {
        result.errors.push(t('syncNotEnabled'));
        return result;
      }

      // 检查用户是否已认证
      if (!this.apiClient.isAuthenticated()) {
        result.errors.push(t('userNotAuthenticated'));
        return result;
      }

      // 获取 Chrome 书签树
      const bookmarkTree = await chrome.bookmarks.getTree();
      console.log('SyncManager: Got Chrome bookmark tree');

      // 收集所有文件夹和书签
      const chromeFolders: Array<{
        id: string;
        title: string;
        parentId?: string;
        path: string[];
      }> = [];
      
      const chromeBookmarks: Array<{
        id: string;
        title: string;
        url: string;
        parentId?: string;
        folderPath: string[];
      }> = [];

      // 递归遍历书签树
      const traverseTree = (nodes: chrome.bookmarks.BookmarkTreeNode[], parentPath: string[] = []) => {
        for (const node of nodes) {
          if (!node.url) {
            // 这是一个文件夹
            // 跳过根节点和系统文件夹
            if (node.id !== '0' && node.title &&
                !['Other bookmarks', '其他书签', 'Bookmarks bar', '书签栏'].includes(node.title)) {
              const currentPath = [...parentPath, node.title];
              chromeFolders.push({
                id: node.id,
                title: node.title,
                parentId: node.parentId,
                path: currentPath
              });
              
              // 递归处理子节点
              if (node.children) {
                traverseTree(node.children, currentPath);
              }
            } else if (node.children) {
              // 对于根节点和系统文件夹，直接处理子节点但不改变路径
              traverseTree(node.children, parentPath);
            }
          } else {
            // 这是一个书签
            chromeBookmarks.push({
              id: node.id,
              title: node.title || '',
              url: node.url,
              parentId: node.parentId,
              folderPath: parentPath
            });
          }
        }
      };

      traverseTree(bookmarkTree);
      
      console.log(`SyncManager: Found ${chromeFolders.length} folders and ${chromeBookmarks.length} bookmarks`);

      // 创建文件夹缓存以避免重复创建
      const folderCache = new Map();
      
      // 维护 Chrome 文件夹 ID 到 Markhub 文件夹 ID 的映射
      const folderIdMap = new Map<string, string>();

      // 按层级排序文件夹（确保父文件夹先创建）
      chromeFolders.sort((a, b) => a.path.length - b.path.length);

      // 同步文件夹
      for (const folder of chromeFolders) {
        try {
          // 确保文件夹路径在 Markhub 中存在，使用缓存避免重复创建
          const markhubFolderId = await this.apiClient.ensureFolderPath(folder.path, folderCache);
          if (markhubFolderId) {
            folderIdMap.set(folder.id, markhubFolderId);
            result.foldersCreated++;
          }
          
          // 添加小延迟避免 API 限制
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          const errorMsg = t('createFolderFailed', { folderName: folder.title, error: error instanceof Error ? error.message : t('unknownError') });
          console.error('SyncManager:', errorMsg);
          result.errors.push(errorMsg);
        }
      }

      // 获取现有书签列表，用于冲突检测
      const existingBookmarks = await this.apiClient.getBookmarks();
      console.log(`SyncManager: Found ${existingBookmarks.length} existing bookmarks in Markhub`);

      // 同步书签
      for (const bookmark of chromeBookmarks) {
        try {
          // 确定书签的 Markhub 文件夹 ID
          let markhubFolderId: string | null = null;
          if (bookmark.folderPath.length > 0) {
            markhubFolderId = await this.apiClient.ensureFolderPath(bookmark.folderPath, folderCache);
          }

          // 检查是否已存在相同 URL 的书签（冲突处理）
          const existingBookmark = existingBookmarks.find(b => b.url === bookmark.url);

          if (existingBookmark) {
            // 覆盖现有书签的数据（根据 Chrome 端的数据更新）
            await this.apiClient.updateBookmark(existingBookmark.id, {
              title: bookmark.title,
              folderId: markhubFolderId,
              chromeBookmarkId: bookmark.id
            });
            console.log(`SyncManager: Updated existing bookmark: ${bookmark.title} (URL: ${bookmark.url})`);
          } else {
            // 创建新书签
            const bookmarkData = {
              title: bookmark.title,
              url: bookmark.url,
              folderId: markhubFolderId,
              chromeBookmarkId: bookmark.id
            };

            const newBookmark = await this.apiClient.createBookmark(bookmarkData);
            console.log(`SyncManager: Created new bookmark: ${bookmark.title} (URL: ${bookmark.url})`);
            
            // 触发 AI 标签推荐
            await this.triggerAITagRecommendation(newBookmark.id);
          }
          
          result.bookmarksCreated++;
          
          // 添加小延迟避免 API 限制
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          const errorMsg = t('syncBookmarkFailed', { bookmarkTitle: bookmark.title, error: error instanceof Error ? error.message : t('unknownError') });
          console.error('SyncManager:', errorMsg);
          result.errors.push(errorMsg);
        }
      }

      result.success = true;
      console.log('SyncManager: Initial sync completed', result);
      
    } catch (error) {
      const errorMsg = t('initialSyncFailed') + ': ' + (error instanceof Error ? error.message : t('unknownError'));
      console.error('SyncManager:', errorMsg);
      result.errors.push(errorMsg);
    }

    return result;
  }
}

/**
 * 工厂函数
 */
export function getSyncManager(): SyncManager {
  return SyncManager.getInstance();
}