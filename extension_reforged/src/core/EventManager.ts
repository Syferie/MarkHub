/**
 * Markhub Chrome Extension - 事件管理器
 *
 * 该模块负责:
 * 1. 监听 Chrome 书签事件
 * 2. 协调 AI 文件夹推荐流程
 * 3. 管理与内容脚本的通信
 * 4. 处理用户交互响应
 */

import { getConfigManager } from './ConfigManager'
import { AIServiceClient, BookmarkInfo, ChromeFolder, FolderRecommendation, createAIServiceClient } from './AIServiceClient'
import { getSyncManager, ChromeBookmarkInfo } from './SyncManager'
import { t } from '../utils/coreI18n'

/**
 * 推荐状态
 */
interface RecommendationState {
  bookmarkId: string
  recommendation: FolderRecommendation
  originalParentId: string
}

/**
 * 事件管理器类
 */
export class EventManager {
  private static instance: EventManager
  private aiServiceClient: AIServiceClient | null = null
  private pendingRecommendations: Map<string, RecommendationState> = new Map()
  private listenersSetup: boolean = false
  private syncedBookmarks: Set<string> = new Set() // 防止重复同步

  private constructor() {
    // 异步初始化 AI 服务客户端
    this.initializeAIServiceClient().catch(error => {
      console.error('EventManager: Error in constructor initializing AI service client:', error)
    })
  }

  /**
   * 获取事件管理器单例
   */
  public static getInstance(): EventManager {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager()
    }
    return EventManager.instance
  }

  /**
   * 初始化事件管理器
   */
  public async initialize(): Promise<void> {
    console.log('EventManager: Initializing...')
    
    // 监听配置变更
    const configManager = getConfigManager()
    configManager.addListener((_config) => {
      this.initializeAIServiceClient().catch(error => {
        console.error('EventManager: Error reinitializing AI service client:', error)
      })
    })

    // 设置消息监听器
    this.setupMessageListeners()
    
    // 设置 Chrome 书签事件监听器
    this.setupBookmarkEventListeners()
    
    console.log('EventManager: Initialized successfully')
  }

  /**
   * 处理书签创建事件
   */
  public async handleBookmarkCreated(id: string, bookmark: chrome.bookmarks.BookmarkTreeNode): Promise<void> {
    try {
      console.log('EventManager: Handling bookmark created', { id, bookmark })

      // 检查是否是书签（而不是文件夹）
      if (!bookmark.url) {
        console.log('EventManager: Skipping folder creation')
        return
      }

      // 检查 AI 服务是否配置
      const configManager = getConfigManager()
      const config = await configManager.getConfig()
      
      if (!config.aiServiceConfig?.folderRec?.apiUrl || !config.aiServiceConfig?.folderRec?.apiKey) {
        console.log('EventManager: AI service not configured, skipping folder recommendation')
        return
      }

      // 立即显示"AI 分类中"气泡
      await this.showAIProcessingToast()

      // 获取 Chrome 文件夹列表
      const chromeFolders = await this.getChromeFolders()
      if (chromeFolders.length === 0) {
        console.log('EventManager: No folders found, skipping recommendation')
        await this.showAIErrorToast(t('noFoldersFound'))
        return
      }

      // 构建书签信息
      const bookmarkInfo: BookmarkInfo = {
        id: id,
        title: bookmark.title || '',
        url: bookmark.url,
        parentId: bookmark.parentId || ''
      }

      // 获取 AI 推荐
      if (!this.aiServiceClient) {
        console.error('EventManager: AI service client not initialized')
        await this.showAIErrorToast(t('aiServiceNotInitialized'))
        return
      }

      const recommendation = await this.aiServiceClient.getFolderRecommendation(bookmarkInfo, chromeFolders)
      
      if (!recommendation) {
        console.log('EventManager: No recommendation received')
        await this.showAIErrorToast(t('noValidRecommendation'))
        return
      }

      // 检查推荐的文件夹是否与当前文件夹相同
      const isAlreadyInRecommendedFolder = recommendation.recommendedFolderId === bookmark.parentId
      
      if (isAlreadyInRecommendedFolder) {
        console.log('EventManager: Bookmark already in recommended folder')
        // 即使书签已在推荐文件夹，也显示确认气泡
        await this.showRecommendationToast(bookmarkInfo, recommendation, true)
        
        // 如果同步功能开启，直接同步书签（不移动文件夹）
        const syncManager = getSyncManager()
        if (syncManager.isSyncAvailable()) {
          console.log('EventManager: Bookmark already in recommended folder, syncing directly')
          await this.triggerBookmarkSync(id)
        }
        return
      }

      // 保存推荐状态（仅当需要移动时）
      this.pendingRecommendations.set(id, {
        bookmarkId: id,
        recommendation: recommendation,
        originalParentId: bookmark.parentId || ''
      })

      // 显示推荐气泡
      await this.showRecommendationToast(bookmarkInfo, recommendation, false)

    } catch (error) {
      console.error('EventManager: Error handling bookmark creation:', error)
      
      // 显示错误气泡
      await this.showAIErrorToast(t('aiRecommendationError'))
      
      // 如果 AI 推荐失败，但同步功能开启，仍然尝试同步原始书签
      const syncManager = getSyncManager()
      if (syncManager.isSyncAvailable()) {
        console.log('EventManager: AI recommendation failed, but attempting direct sync')
        await this.triggerBookmarkSync(id)
      }
    }
  }

  /**
   * 处理用户接受推荐
   */
  public async handleAcceptRecommendation(bookmarkId: string): Promise<void> {
    try {
      console.log('EventManager: Handling accept recommendation', bookmarkId)

      const state = this.pendingRecommendations.get(bookmarkId)
      if (!state) {
        console.error('EventManager: No pending recommendation found for bookmark:', bookmarkId)
        return
      }

      // 移动书签到推荐的文件夹
      await chrome.bookmarks.move(bookmarkId, {
        parentId: state.recommendation.recommendedFolderId
      })

      console.log('EventManager: Bookmark moved successfully', {
        bookmarkId,
        newParentId: state.recommendation.recommendedFolderId
      })

      // 清理状态
      this.pendingRecommendations.delete(bookmarkId)
      
      // 注意：不需要手动触发同步，因为移动书签会触发 onMoved 事件，
      // 该事件会自动调用 syncBookmarkUpdate 来更新书签位置

      // 不再显示额外的系统通知，悬浮气泡本身就是反馈

    } catch (error) {
      console.error('EventManager: Error accepting recommendation:', error)
      // 只在出错时显示通知
      this.showNotification(t('moveBookmarkFailed'), 'error')
    }
  }

  /**
   * 处理用户拒绝推荐
   */
  public async handleDismissRecommendation(bookmarkId: string): Promise<void> {
    console.log('EventManager: Handling dismiss recommendation', bookmarkId)
    
    // 如果同步功能开启，仍然同步原始书签（不移动文件夹）
    const syncManager = getSyncManager()
    if (syncManager.isSyncAvailable() && !this.syncedBookmarks.has(bookmarkId)) {
      console.log('EventManager: User dismissed recommendation, but syncing original bookmark')
      await this.triggerBookmarkSync(bookmarkId)
    }
    
    // 清理状态
    this.pendingRecommendations.delete(bookmarkId)
  }

  /**
   * 获取 Chrome 文件夹列表
   */
  private async getChromeFolders(): Promise<ChromeFolder[]> {
    try {
      const bookmarkTree = await chrome.bookmarks.getTree()
      const folders: ChromeFolder[] = []

      const traverseTree = (nodes: chrome.bookmarks.BookmarkTreeNode[], parentPath: string = '') => {
        for (const node of nodes) {
          if (!node.url) { // 文件夹
            const currentPath = parentPath ? `${parentPath}/${node.title}` : node.title
            
            // 跳过根节点和一些系统文件夹
            if (node.id !== '0' && node.title && !['Other bookmarks', '其他书签'].includes(node.title)) {
              folders.push({
                id: node.id,
                title: node.title,
                parentId: node.parentId,
                path: currentPath
              })
            }

            // 递归处理子节点
            if (node.children) {
              traverseTree(node.children, currentPath)
            }
          }
        }
      }

      traverseTree(bookmarkTree)
      
      console.log('EventManager: Found Chrome folders:', folders.length)
      return folders

    } catch (error) {
      console.error('EventManager: Error getting Chrome folders:', error)
      return []
    }
  }

  /**
   * 显示 AI 处理中气泡
   */
  private async showAIProcessingToast(): Promise<void> {
    try {
      // 获取当前活动标签页
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tabs.length === 0) {
        console.log('EventManager: No active tab found')
        return
      }

      const activeTab = tabs[0]
      if (!activeTab.id) {
        console.log('EventManager: Active tab has no ID')
        return
      }

      // 向内容脚本发送消息
      try {
        console.log('EventManager: Sending AI processing toast to tab:', activeTab.id, activeTab.url)
        const response = await chrome.tabs.sendMessage(activeTab.id, {
          type: 'SHOW_AI_PROCESSING'
        })
        console.log('EventManager: AI processing toast response:', response)
      } catch (error) {
        console.log('EventManager: Content script not ready, injecting...', error)
        // 尝试注入内容脚本
        try {
          console.log('EventManager: Injecting content script to tab:', activeTab.id)
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content.js']
          })
          // 等待一下让内容脚本初始化
          await new Promise(resolve => setTimeout(resolve, 500))
          // 重新发送消息
          console.log('EventManager: Retrying message after injection')
          const retryResponse = await chrome.tabs.sendMessage(activeTab.id, {
            type: 'SHOW_AI_PROCESSING'
          })
          console.log('EventManager: AI processing toast sent after injection, response:', retryResponse)
        } catch (injectionError) {
          console.error('EventManager: Failed to inject content script:', injectionError)
        }
      }

    } catch (error) {
      console.error('EventManager: Error showing AI processing toast:', error)
    }
  }

  /**
   * 显示 AI 错误气泡
   */
  private async showAIErrorToast(message: string): Promise<void> {
    try {
      // 获取当前活动标签页
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tabs.length === 0) {
        console.log('EventManager: No active tab found')
        return
      }

      const activeTab = tabs[0]
      if (!activeTab.id) {
        console.log('EventManager: Active tab has no ID')
        return
      }

      // 向内容脚本发送消息
      try {
        console.log('EventManager: Sending AI error toast to tab:', activeTab.id, activeTab.url)
        const response = await chrome.tabs.sendMessage(activeTab.id, {
          type: 'SHOW_AI_ERROR',
          data: { message }
        })
        console.log('EventManager: AI error toast response:', response)
      } catch (error) {
        console.log('EventManager: Content script not ready for error, injecting...', error)
        // 尝试注入内容脚本
        try {
          console.log('EventManager: Injecting content script for error to tab:', activeTab.id)
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content.js']
          })
          // 等待一下让内容脚本初始化
          await new Promise(resolve => setTimeout(resolve, 500))
          // 重新发送消息
          console.log('EventManager: Retrying error message after injection')
          const retryResponse = await chrome.tabs.sendMessage(activeTab.id, {
            type: 'SHOW_AI_ERROR',
            data: { message }
          })
          console.log('EventManager: AI error toast sent after injection, response:', retryResponse)
        } catch (injectionError) {
          console.error('EventManager: Failed to inject content script for error:', injectionError)
        }
      }

    } catch (error) {
      console.error('EventManager: Error showing AI error toast:', error)
    }
  }

  /**
   * 显示推荐气泡
   */
  private async showRecommendationToast(bookmark: BookmarkInfo, recommendation: FolderRecommendation, isAlreadyInFolder: boolean = false): Promise<void> {
    try {
      // 获取当前活动标签页
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tabs.length === 0) {
        console.log('EventManager: No active tab found')
        return
      }

      const activeTab = tabs[0]
      if (!activeTab.id) {
        console.log('EventManager: Active tab has no ID')
        return
      }

      // 向内容脚本发送消息
      try {
        console.log('EventManager: Sending recommendation toast to tab:', activeTab.id, activeTab.url)
        const response = await chrome.tabs.sendMessage(activeTab.id, {
          type: 'SHOW_FOLDER_RECOMMENDATION',
          data: {
            bookmarkTitle: bookmark.title,
            recommendedFolder: recommendation.recommendedFolderName,
            bookmarkId: bookmark.id,
            confidence: recommendation.confidence,
            reason: recommendation.reason,
            isAlreadyInFolder: isAlreadyInFolder
          }
        })
        console.log('EventManager: Recommendation toast response:', response)
      } catch (error) {
        console.log('EventManager: Content script not ready for recommendation, injecting...', error)
        // 尝试注入内容脚本
        try {
          console.log('EventManager: Injecting content script for recommendation to tab:', activeTab.id)
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content.js']
          })
          // 等待一下让内容脚本初始化
          await new Promise(resolve => setTimeout(resolve, 500))
          // 重新发送消息
          console.log('EventManager: Retrying recommendation message after injection')
          const retryResponse = await chrome.tabs.sendMessage(activeTab.id, {
            type: 'SHOW_FOLDER_RECOMMENDATION',
            data: {
              bookmarkTitle: bookmark.title,
              recommendedFolder: recommendation.recommendedFolderName,
              bookmarkId: bookmark.id,
              confidence: recommendation.confidence,
              reason: recommendation.reason,
              isAlreadyInFolder: isAlreadyInFolder
            }
          })
          console.log('EventManager: Recommendation toast sent after injection, response:', retryResponse)
        } catch (injectionError) {
          console.error('EventManager: Failed to inject content script for recommendation:', injectionError)
        }
      }

    } catch (error) {
      console.error('EventManager: Error showing recommendation toast:', error)
      
      // 如果无法显示气泡，根据配置决定是否自动移动
      const configManager = getConfigManager()
      const config = await configManager.getConfig()
      
      if (config.autoMoveToRecommendedFolder && recommendation.confidence > 0.7) {
        console.log('EventManager: Auto-moving bookmark due to high confidence')
        await this.handleAcceptRecommendation(bookmark.id)
      }
    }
  }

  /**
   * 显示通知（仅在错误时使用）
   */
  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    // 只在错误情况下显示系统通知
    if (type !== 'error') {
      return
    }

    const configManager = getConfigManager()
    const config = configManager.getConfigSync()
    
    if (!config.showNotifications) {
      return
    }

    // 使用 Chrome 通知 API
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: 'Markhub',
      message: message
    })
  }

  /**
   * 初始化 AI 服务客户端
   */
  private async initializeAIServiceClient(): Promise<void> {
    const configManager = getConfigManager()
    
    try {
      const config = await configManager.getConfig()
      
      if (config.aiServiceConfig?.folderRec?.apiUrl && config.aiServiceConfig?.folderRec?.apiKey) {
        this.aiServiceClient = createAIServiceClient(config.aiServiceConfig.folderRec)
        console.log('EventManager: AI service client initialized')
      } else {
        this.aiServiceClient = null
        console.log('EventManager: AI service client not configured')
      }
    } catch (error) {
      console.error('EventManager: Error initializing AI service client:', error)
      this.aiServiceClient = null
    }
  }

  /**
   * 设置消息监听器
   */
  private setupMessageListeners(): void {
    chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      console.log('EventManager: Message received', { message, sender })

      switch (message.type) {
        case 'ACCEPT_FOLDER_RECOMMENDATION':
          this.handleAcceptRecommendation(message.data.bookmarkId)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }))
          return true // 保持消息通道开放

        case 'DISMISS_FOLDER_RECOMMENDATION':
          this.handleDismissRecommendation(message.data.bookmarkId)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }))
          return true

        default:
          // 不处理其他消息类型
          break
      }
    })
  }

  /**
   * 触发书签同步到 Markhub
   */
  private async triggerBookmarkSync(chromeBookmarkId: string): Promise<void> {
    try {
      // 防止重复同步
      if (this.syncedBookmarks.has(chromeBookmarkId)) {
        console.log('EventManager: Bookmark already synced, skipping:', chromeBookmarkId)
        return
      }

      const syncManager = getSyncManager()
      
      // 检查同步是否可用
      if (!syncManager.isSyncAvailable()) {
        console.log('EventManager: Sync not available, skipping')
        return
      }

      // 获取书签信息
      const bookmarks = await chrome.bookmarks.get(chromeBookmarkId)
      if (bookmarks.length === 0) {
        console.error('EventManager: Bookmark not found:', chromeBookmarkId)
        return
      }

      const bookmark = bookmarks[0]
      if (!bookmark.url) {
        console.log('EventManager: Skipping folder sync')
        return
      }

      // 标记为已同步
      this.syncedBookmarks.add(chromeBookmarkId)

      // 构建同步数据
      const chromeBookmarkInfo: ChromeBookmarkInfo = {
        id: chromeBookmarkId,
        title: bookmark.title || '',
        url: bookmark.url,
        parentId: bookmark.parentId,
      }

      // 执行同步
      console.log('EventManager: Triggering bookmark sync', chromeBookmarkInfo)
      const result = await syncManager.syncNewBookmark(chromeBookmarkInfo)
      
      if (result.success) {
        console.log('EventManager: Bookmark sync successful', result.markhubBookmarkId)
        // 不再显示成功同步的通知，减少干扰
      } else {
        console.error('EventManager: Bookmark sync failed:', result.error)
        this.showNotification('同步到 Markhub 失败', 'error')
        // 同步失败时移除标记，允许重试
        this.syncedBookmarks.delete(chromeBookmarkId)
      }

    } catch (error) {
      console.error('EventManager: Error triggering bookmark sync:', error)
      this.showNotification('同步到 Markhub 失败', 'error')
      // 出错时移除标记，允许重试
      this.syncedBookmarks.delete(chromeBookmarkId)
    }
  }

  /**
   * 设置 Chrome 书签事件监听器
   */
  private setupBookmarkEventListeners(): void {
    // 防止重复设置监听器
    if (this.listenersSetup) {
      console.log('EventManager: Bookmark event listeners already setup, skipping')
      return
    }
    
    // 监听书签创建事件
    chrome.bookmarks.onCreated.addListener(async (id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => {
      try {
        console.log('EventManager: Bookmark created', { id, bookmark })
        await this.handleBookmarkCreated(id, bookmark)
      } catch (error) {
        console.error('EventManager: Error handling bookmark creation:', error)
      }
    })

    // 监听书签变更事件（标题、URL 修改）
    chrome.bookmarks.onChanged.addListener(async (id: string, changeInfo: chrome.bookmarks.BookmarkChangeInfo) => {
      try {
        console.log('EventManager: Bookmark changed', { id, changeInfo })
        
        const syncManager = getSyncManager()
        if (!syncManager.isSyncAvailable()) {
          return
        }

        // 获取更新后的书签信息
        const bookmarks = await chrome.bookmarks.get(id)
        if (bookmarks.length === 0 || !bookmarks[0].url) {
          return
        }

        const bookmark = bookmarks[0]
        const chromeBookmarkInfo: ChromeBookmarkInfo = {
          id: id,
          title: bookmark.title || '',
          url: bookmark.url || '',
          parentId: bookmark.parentId,
        }

        // 执行更新同步
        const result = await syncManager.syncBookmarkUpdate(chromeBookmarkInfo)
        if (result.success) {
          console.log('EventManager: Bookmark update sync successful')
        } else {
          console.error('EventManager: Bookmark update sync failed:', result.error)
        }

      } catch (error) {
        console.error('EventManager: Error handling bookmark change:', error)
      }
    })

    // 监听书签移动事件
    chrome.bookmarks.onMoved.addListener(async (id: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo) => {
      try {
        console.log('EventManager: Bookmark moved', { id, moveInfo })
        
        const syncManager = getSyncManager()
        if (!syncManager.isSyncAvailable()) {
          return
        }

        // 获取移动后的书签信息
        const bookmarks = await chrome.bookmarks.get(id)
        if (bookmarks.length === 0 || !bookmarks[0].url) {
          return
        }

        const bookmark = bookmarks[0]
        const chromeBookmarkInfo: ChromeBookmarkInfo = {
          id: id,
          title: bookmark.title || '',
          url: bookmark.url || '',
          parentId: bookmark.parentId,
        }

        // 执行更新同步
        const result = await syncManager.syncBookmarkUpdate(chromeBookmarkInfo)
        if (result.success) {
          console.log('EventManager: Bookmark move sync successful')
        } else {
          console.error('EventManager: Bookmark move sync failed:', result.error)
        }

      } catch (error) {
        console.error('EventManager: Error handling bookmark move:', error)
      }
    })

    // 监听书签删除事件
    chrome.bookmarks.onRemoved.addListener(async (id: string, removeInfo: chrome.bookmarks.BookmarkRemoveInfo) => {
      try {
        console.log('EventManager: Bookmark removed', { id, removeInfo })
        
        const syncManager = getSyncManager()
        if (!syncManager.isSyncAvailable()) {
          return
        }

        // 执行删除同步
        const result = await syncManager.syncBookmarkDeletion(id)
        if (result.success) {
          console.log('EventManager: Bookmark deletion sync successful')
        } else {
          console.error('EventManager: Bookmark deletion sync failed:', result.error)
        }

      } catch (error) {
        console.error('EventManager: Error handling bookmark removal:', error)
      }
    })

    this.listenersSetup = true
    console.log('EventManager: Bookmark event listeners setup complete')
  }
}

/**
 * 工厂函数
 */
export function getEventManager(): EventManager {
  return EventManager.getInstance()
}