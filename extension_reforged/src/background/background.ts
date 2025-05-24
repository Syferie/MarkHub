/**
 * Markhub Chrome Extension - 背景脚本
 * 
 * 该脚本负责:
 * 1. 监听 Chrome 书签事件
 * 2. 初始化配置管理器
 * 3. 处理插件生命周期事件
 */

import { getConfigManager } from '../core/ConfigManager'
import { getEventManager } from '../core/EventManager'

// 初始化插件
async function initializeExtension() {
  try {
    console.log('Markhub Extension: Initializing...')
    
    // 初始化配置管理器
    const configManager = getConfigManager()
    await configManager.initialize()
    
    // 初始化事件管理器
    const eventManager = getEventManager()
    await eventManager.initialize()
    
    console.log('Markhub Extension: Initialized successfully')
  } catch (error) {
    console.error('Markhub Extension: Failed to initialize:', error)
  }
}

// 使用更轻量级的方式保持 Service Worker 活跃
// 通过定期的轻量级操作来防止休眠
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 }) // 每30秒

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // 执行一个轻量级操作来保持活跃
    console.log('Markhub Extension: Keep alive ping')
  }
})

// 监听插件安装/启动事件
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Markhub Extension: onInstalled', details.reason)
  
  if (details.reason === 'install') {
    // 首次安装
    console.log('Markhub Extension: First time installation')
  } else if (details.reason === 'update') {
    // 更新
    console.log('Markhub Extension: Updated to version', chrome.runtime.getManifest().version)
  }
  
  await initializeExtension()
})

// 监听插件启动事件
chrome.runtime.onStartup.addListener(async () => {
  console.log('Markhub Extension: onStartup')
  await initializeExtension()
})

// 注意：所有书签事件（创建、变更、移动和删除）现在由 EventManager 统一处理
// EventManager 在初始化时会设置这些监听器，避免重复监听导致的冲突

// 监听来自弹出窗口或内容脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Markhub Extension: Message received', { message, sender })
  
  // 处理不同类型的消息
  switch (message.type) {
    case 'GET_CONFIG':
      // 获取配置
      getConfigManager().getConfig()
        .then(config => sendResponse({ success: true, data: config }))
        .catch((error: any) => sendResponse({ success: false, error: error.message }))
      return true
      
    case 'UPDATE_CONFIG':
      // 更新配置
      getConfigManager().updateConfig(message.data)
        .then(() => sendResponse({ success: true }))
        .catch((error: any) => sendResponse({ success: false, error: error.message }))
      return true
      
    case 'DISMISS_FOLDER_RECOMMENDATION':
      // EventManager 应该已经处理了这个消息
      // 这个 case 主要是为了防止它落入 default 并打印 "Unknown message type"
      console.log('Markhub Extension (background.ts): Received DISMISS_FOLDER_RECOMMENDATION, assuming EventManager handled it.')
      // 不调用 sendResponse() 或 return true，避免与 EventManager 的响应冲突
      break
      
    default:
      console.log('Markhub Extension: Unknown message type:', message.type)
      sendResponse({ success: false, error: 'Unknown message type' })
  }
})

// 导出用于测试的函数
export { initializeExtension }