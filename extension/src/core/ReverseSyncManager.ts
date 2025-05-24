/**
 * Markhub Chrome Extension - 反向同步管理器
 * 
 * 该模块负责:
 * 1. 从 Markhub 拉取书签和文件夹数据
 * 2. 同步到 Chrome 书签系统
 * 3. 处理数据结构差异和冲突
 * 4. 提供手动同步功能
 */

import { getConfigManager } from './ConfigManager';
import { getMarkhubAPIClient } from './MarkhubAPIClient';
import { t } from '../utils/coreI18n';

/**
 * 反向同步结果接口
 */
export interface ReverseSyncResult {
  success: boolean;
  foldersCreated: number;
  bookmarksCreated: number;
  bookmarksUpdated: number;
  errors: string[];
  skipped: number;
}

/**
 * Chrome 文件夹映射接口
 */
interface ChromeFolderMapping {
  markhubFolderId: string;
  chromeFolderId: string;
  folderPath: string[];
}

/**
 * 反向同步管理器类
 */
export class ReverseSyncManager {
  private static instance: ReverseSyncManager;
  private configManager = getConfigManager();
  private apiClient = getMarkhubAPIClient();

  private constructor() {}

  /**
   * 获取反向同步管理器单例
   */
  public static getInstance(): ReverseSyncManager {
    if (!ReverseSyncManager.instance) {
      ReverseSyncManager.instance = new ReverseSyncManager();
    }
    return ReverseSyncManager.instance;
  }

  /**
   * 执行从 Markhub 到 Chrome 的手动同步
   */
  public async syncFromMarkhub(): Promise<ReverseSyncResult> {
    console.log('ReverseSyncManager: Starting sync from Markhub to Chrome');
    
    const result: ReverseSyncResult = {
      success: false,
      foldersCreated: 0,
      bookmarksCreated: 0,
      bookmarksUpdated: 0,
      errors: [],
      skipped: 0
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

      // 获取 Markhub 数据 - 使用新的导出 API
      console.log('ReverseSyncManager: Fetching data from Markhub');
      const syncData = await this.apiClient.getSyncExportData();
      
      console.log(`ReverseSyncManager: Found ${syncData.folders.length} folders and ${syncData.bookmarks.length} bookmarks in Markhub`);

      // 获取 Chrome 现有数据
      const chromeBookmarkTree = await chrome.bookmarks.getTree();
      const existingChromeData = this.extractChromeBookmarksAndFolders(chromeBookmarkTree);

      console.log(`ReverseSyncManager: Found ${existingChromeData.folders.length} folders and ${existingChromeData.bookmarks.length} bookmarks in Chrome`);

      // 创建文件夹映射
      const folderMappings = await this.createFolderMappings(syncData.folders, existingChromeData.folders);

      // 同步文件夹
      const folderSyncResult = await this.syncFolders(syncData.folders, folderMappings);
      result.foldersCreated += folderSyncResult.created;
      result.errors.push(...folderSyncResult.errors);

      // 同步书签
      const bookmarkSyncResult = await this.syncBookmarks(
        syncData.bookmarks,
        existingChromeData.bookmarks
      );
      result.bookmarksCreated += bookmarkSyncResult.created;
      result.bookmarksUpdated += bookmarkSyncResult.updated;
      result.skipped += bookmarkSyncResult.skipped;
      result.errors.push(...bookmarkSyncResult.errors);

      result.success = true;
      console.log('ReverseSyncManager: Sync completed successfully', result);

    } catch (error) {
      const errorMsg = t('reverseSyncFailed') + ': ' + (error instanceof Error ? error.message : t('unknownError'));
      console.error('ReverseSyncManager:', errorMsg);
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * 从 Chrome 书签树中提取书签和文件夹信息
   */
  private extractChromeBookmarksAndFolders(bookmarkTree: chrome.bookmarks.BookmarkTreeNode[]): {
    folders: Array<{
      id: string;
      title: string;
      parentId?: string;
      path: string[];
    }>;
    bookmarks: Array<{
      id: string;
      title: string;
      url: string;
      parentId?: string;
      folderPath: string[];
    }>;
  } {
    const folders: Array<{
      id: string;
      title: string;
      parentId?: string;
      path: string[];
    }> = [];
    
    const bookmarks: Array<{
      id: string;
      title: string;
      url: string;
      parentId?: string;
      folderPath: string[];
    }> = [];

    const traverseTree = (nodes: chrome.bookmarks.BookmarkTreeNode[], parentPath: string[] = []) => {
      for (const node of nodes) {
        if (!node.url) {
          // 这是一个文件夹
          // 跳过根节点和系统文件夹
          if (node.id !== '0' && node.title &&
              !['Other bookmarks', '其他书签', 'Bookmarks bar', '书签栏'].includes(node.title)) {
            const currentPath = [...parentPath, node.title];
            folders.push({
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
          bookmarks.push({
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
    return { folders, bookmarks };
  }

  /**
   * 创建 Markhub 文件夹到 Chrome 文件夹的映射
   */
  private async createFolderMappings(
    markhubFolders: Array<{ 
      id: string; 
      name: string; 
      parentId?: string; 
      path: string[]; 
      createdAt: string; 
      updatedAt: string; 
    }>, 
    chromeFolders: Array<{ id: string; title: string; parentId?: string; path: string[] }>
  ): Promise<ChromeFolderMapping[]> {
    const mappings: ChromeFolderMapping[] = [];

    for (const markhubFolder of markhubFolders) {
      // 查找对应的 Chrome 文件夹
      const chromeFolder = chromeFolders.find(cf => 
        this.arraysEqual(cf.path, markhubFolder.path)
      );

      if (chromeFolder) {
        mappings.push({
          markhubFolderId: markhubFolder.id,
          chromeFolderId: chromeFolder.id,
          folderPath: markhubFolder.path
        });
      }
    }

    return mappings;
  }

  /**
   * 同步文件夹
   */
  private async syncFolders(
    markhubFolders: Array<{ 
      id: string; 
      name: string; 
      parentId?: string; 
      path: string[]; 
      createdAt: string; 
      updatedAt: string; 
    }>, 
    existingMappings: ChromeFolderMapping[]
  ): Promise<{ created: number; errors: string[] }> {
    const result = { created: 0, errors: [] as string[] };

    // 按层级排序（确保父文件夹先创建）
    const sortedFolders = markhubFolders.sort((a, b) => a.path.length - b.path.length);

    for (const folder of sortedFolders) {
      try {
        // 检查是否已存在映射
        const existingMapping = existingMappings.find(m => m.markhubFolderId === folder.id);
        if (existingMapping) {
          console.log(`ReverseSyncManager: Folder "${folder.name}" already exists in Chrome`);
          continue;
        }

        // 创建文件夹路径
        await this.ensureChromeFolderPath(folder.path);
        result.created++;
        
        // 添加小延迟避免过快操作
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        const errorMsg = `创建文件夹 "${folder.name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`;
        console.error('ReverseSyncManager:', errorMsg);
        result.errors.push(errorMsg);
      }
    }

    return result;
  }

  /**
   * 确保 Chrome 中存在指定的文件夹路径
   */
  private async ensureChromeFolderPath(folderPath: string[]): Promise<string> {
    if (folderPath.length === 0) {
      // 返回书签栏的 ID
      const bookmarkBar = await chrome.bookmarks.getTree();
      return bookmarkBar[0].children?.find(child => 
        child.title === 'Bookmarks bar' || child.title === '书签栏'
      )?.id || '1';
    }

    // 从书签栏开始
    let currentParentId = '1'; // 书签栏的默认 ID

    for (const folderName of folderPath) {
      // 查找当前层级是否已存在该文件夹
      const children = await chrome.bookmarks.getChildren(currentParentId);
      const existingFolder = children.find(child => 
        !child.url && child.title === folderName
      );

      if (existingFolder) {
        currentParentId = existingFolder.id;
      } else {
        // 创建新文件夹
        const newFolder = await chrome.bookmarks.create({
          parentId: currentParentId,
          title: folderName
        });
        console.log(`ReverseSyncManager: Created Chrome folder "${folderName}" with ID: ${newFolder.id}`);
        currentParentId = newFolder.id;
      }
    }

    return currentParentId;
  }

  /**
   * 同步书签
   */
  private async syncBookmarks(
    markhubBookmarks: Array<{
      id: string;
      title: string;
      url: string;
      folderId?: string;
      folderPath: string[];
      tags: string[];
      isFavorite: boolean;
      chromeBookmarkId?: string;
      createdAt: string;
      updatedAt: string;
    }>,
    chromeBookmarks: Array<{ id: string; title: string; url: string; parentId?: string; folderPath: string[] }>
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

    for (const bookmark of markhubBookmarks) {
      try {
        // 检查是否已存在相同 URL 的书签
        const existingBookmark = chromeBookmarks.find(cb => cb.url === bookmark.url);

        if (existingBookmark) {
          // 检查是否需要更新
          if (existingBookmark.title !== bookmark.title) {
            await chrome.bookmarks.update(existingBookmark.id, {
              title: bookmark.title
            });
            console.log(`ReverseSyncManager: Updated bookmark "${bookmark.title}"`);
            result.updated++;
          } else {
            result.skipped++;
          }
          continue;
        }

        // 确定目标文件夹
        let targetFolderId = '1'; // 默认书签栏
        if (bookmark.folderPath.length > 0) {
          targetFolderId = await this.ensureChromeFolderPath(bookmark.folderPath);
        }

        // 创建新书签
        const newBookmark = await chrome.bookmarks.create({
          parentId: targetFolderId,
          title: bookmark.title,
          url: bookmark.url
        });

        console.log(`ReverseSyncManager: Created bookmark "${bookmark.title}" with ID: ${newBookmark.id}`);
        result.created++;

        // 添加小延迟避免过快操作
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        const errorMsg = `同步书签 "${bookmark.title}" 失败: ${error instanceof Error ? error.message : '未知错误'}`;
        console.error('ReverseSyncManager:', errorMsg);
        result.errors.push(errorMsg);
      }
    }

    return result;
  }

  /**
   * 检查反向同步是否可用
   */
  public isReverseSyncAvailable(): boolean {
    const config = this.configManager.getConfigSync();
    return config.syncEnabled && this.apiClient.isAuthenticated();
  }

  /**
   * 辅助方法：比较两个数组是否相等
   */
  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((val, index) => val === b[index]);
  }
}

/**
 * 工厂函数
 */
export function getReverseSyncManager(): ReverseSyncManager {
  return ReverseSyncManager.getInstance();
}