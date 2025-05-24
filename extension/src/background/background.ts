/**
 * Markhub Chrome Extension - 背景脚本 (Manifest V3 优化版)
 *
 * 该脚本负责:
 * 1. 监听 Chrome 书签事件
 * 2. 初始化配置管理器
 * 3. 处理插件生命周期事件
 * 4. 管理 Service Worker 生命周期
 */

import { getConfigManager } from '../core/ConfigManager'
import { getEventManager } from '../core/EventManager'

// Service Worker 状态管理
class ServiceWorkerManager {
  private static instance: ServiceWorkerManager
  private isInitialized = false
  private keepAlivePort: chrome.runtime.Port | null = null
  private lastActivity = Date.now()

  static getInstance(): ServiceWorkerManager {
    if (!ServiceWorkerManager.instance) {
      ServiceWorkerManager.instance = new ServiceWorkerManager()
    }
    return ServiceWorkerManager.instance
  }

  async initialize() {
    if (this.isInitialized) {
      console.log('ServiceWorkerManager: Already initialized')
      return
    }

    console.log('ServiceWorkerManager: Initializing...')
    
    // 设置多重保活机制
    this.setupKeepAlive()
    this.setupEventListeners()
    this.setupPortConnections()
    
    // 初始化核心组件
    await this.initializeCore()
    
    this.isInitialized = true
    console.log('ServiceWorkerManager: Initialized successfully')
  }

  private setupKeepAlive() {
    // 方法1: 使用 alarms API (最可靠)
    chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 }) // 24秒间隔
    
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'keepAlive') {
        this.updateActivity()
        console.log('ServiceWorkerManager: Keep alive via alarm')
      }
    })

    // 方法2: 使用 storage API 作为备用
    setInterval(() => {
      chrome.storage.local.set({
        lastKeepAlive: Date.now(),
        serviceWorkerActive: true
      })
      this.updateActivity()
    }, 20000) // 20秒间隔
  }

  private setupEventListeners() {
    // 监听所有可能重新激活 Service Worker 的事件
    
    // 书签事件 - 这些是我们最关心的
    chrome.bookmarks.onCreated.addListener(() => this.ensureActive())
    chrome.bookmarks.onChanged.addListener(() => this.ensureActive())
    chrome.bookmarks.onMoved.addListener(() => this.ensureActive())
    chrome.bookmarks.onRemoved.addListener(() => this.ensureActive())
    
    // 标签页事件
    chrome.tabs.onActivated.addListener(() => this.ensureActive())
    chrome.tabs.onUpdated.addListener(() => this.ensureActive())
    
    // 运行时事件
    chrome.runtime.onMessage.addListener(() => this.ensureActive())
    chrome.runtime.onConnect.addListener(() => this.ensureActive())
  }

  private setupPortConnections() {
    // 监听来自 popup 和 content script 的连接
    chrome.runtime.onConnect.addListener((port) => {
      console.log('ServiceWorkerManager: Port connected:', port.name)
      
      if (port.name === 'keepAlive') {
        this.keepAlivePort = port
        
        port.onDisconnect.addListener(() => {
          console.log('ServiceWorkerManager: Keep alive port disconnected')
          this.keepAlivePort = null
        })
        
        port.onMessage.addListener((message) => {
          if (message.type === 'ping') {
            this.updateActivity()
            port.postMessage({ type: 'pong', timestamp: Date.now() })
          }
        })
      }
      
      this.ensureActive()
    })
  }

  private async initializeCore() {
    try {
      console.log('ServiceWorkerManager: Initializing core components...')
      
      // 初始化配置管理器
      const configManager = getConfigManager()
      await configManager.initialize()
      
      // 初始化事件管理器
      const eventManager = getEventManager()
      await eventManager.initialize()
      
      console.log('ServiceWorkerManager: Core components initialized')
    } catch (error) {
      console.error('ServiceWorkerManager: Failed to initialize core:', error)
      throw error
    }
  }

  public ensureActive() {
    this.updateActivity()
    
    // 如果核心组件未初始化，重新初始化
    if (!this.isInitialized) {
      console.log('ServiceWorkerManager: Re-initializing due to activity')
      this.initialize().catch(error => {
        console.error('ServiceWorkerManager: Re-initialization failed:', error)
      })
    }
  }

  private updateActivity() {
    this.lastActivity = Date.now()
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      lastActivity: this.lastActivity,
      hasKeepAlivePort: !!this.keepAlivePort,
      timeSinceLastActivity: Date.now() - this.lastActivity
    }
  }
}

// 全局 Service Worker 管理器实例
const swManager = ServiceWorkerManager.getInstance()

// 监听插件安装/启动事件
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Markhub Extension: onInstalled', details.reason)
  
  if (details.reason === 'install') {
    console.log('Markhub Extension: First time installation')
    // 设置初始配置
    await chrome.storage.local.set({
      extensionInstalled: true,
      installTime: Date.now()
    })
  } else if (details.reason === 'update') {
    console.log('Markhub Extension: Updated to version', chrome.runtime.getManifest().version)
  }
  
  await swManager.initialize()
})

// 监听插件启动事件
chrome.runtime.onStartup.addListener(async () => {
  console.log('Markhub Extension: onStartup')
  await swManager.initialize()
})

// 监听来自弹出窗口或内容脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Markhub Extension: Message received', { message, sender })
  
  // 确保 Service Worker 处于活跃状态
  swManager.ensureActive()
  
  // 处理不同类型的消息
  switch (message.type) {
    case 'GET_CONFIG':
      getConfigManager().getConfig()
        .then(config => sendResponse({ success: true, data: config }))
        .catch((error: any) => sendResponse({ success: false, error: error.message }))
      return true
      
    case 'UPDATE_CONFIG':
      getConfigManager().updateConfig(message.data)
        .then(() => sendResponse({ success: true }))
        .catch((error: any) => sendResponse({ success: false, error: error.message }))
      return true
      
    case 'PING':
      // 健康检查
      sendResponse({
        success: true,
        timestamp: Date.now(),
        status: swManager.getStatus()
      })
      return true
      
    case 'WAKE_UP':
      // 强制唤醒
      swManager.initialize()
        .then(() => sendResponse({ success: true, message: 'Service Worker awakened' }))
        .catch((error: any) => sendResponse({ success: false, error: error.message }))
      return true
      
    case 'DISMISS_FOLDER_RECOMMENDATION':
      // EventManager 处理这个消息
      console.log('Markhub Extension: Received DISMISS_FOLDER_RECOMMENDATION')
      break
      
    default:
      console.log('Markhub Extension: Unknown message type:', message.type)
      sendResponse({ success: false, error: 'Unknown message type' })
  }
})

// 立即初始化（用于 Service Worker 重新激活时）
swManager.initialize().catch(error => {
  console.error('Markhub Extension: Initial initialization failed:', error)
})

// 导出用于测试的函数
export { ServiceWorkerManager }