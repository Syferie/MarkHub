/**
 * Service Worker 连接管理器
 * 
 * 用于确保 popup 和 content script 能够有效地与 Service Worker 通信
 * 并在需要时重新激活 Service Worker
 */

export class ServiceWorkerConnection {
  private static instance: ServiceWorkerConnection
  private port: chrome.runtime.Port | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 3
  private reconnectDelay = 1000

  static getInstance(): ServiceWorkerConnection {
    if (!ServiceWorkerConnection.instance) {
      ServiceWorkerConnection.instance = new ServiceWorkerConnection()
    }
    return ServiceWorkerConnection.instance
  }

  /**
   * 初始化连接
   */
  async initialize(): Promise<void> {
    console.log('ServiceWorkerConnection: Initializing...')
    
    // 首先尝试唤醒 Service Worker
    await this.wakeUpServiceWorker()
    
    // 建立持久连接
    this.connect()
    
    console.log('ServiceWorkerConnection: Initialized')
  }

  /**
   * 建立与 Service Worker 的连接
   */
  private connect(): void {
    try {
      this.port = chrome.runtime.connect({ name: 'keepAlive' })
      
      this.port.onDisconnect.addListener(() => {
        console.log('ServiceWorkerConnection: Port disconnected')
        this.port = null
        
        // 尝试重新连接
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++
          console.log(`ServiceWorkerConnection: Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`)
          
          setTimeout(() => {
            this.connect()
          }, this.reconnectDelay * this.reconnectAttempts)
        }
      })
      
      this.port.onMessage.addListener((message) => {
        if (message.type === 'pong') {
          console.log('ServiceWorkerConnection: Received pong from Service Worker')
        }
      })
      
      // 发送初始 ping
      this.sendPing()
      
      // 重置重连计数
      this.reconnectAttempts = 0
      
      console.log('ServiceWorkerConnection: Port connected successfully')
      
    } catch (error) {
      console.error('ServiceWorkerConnection: Failed to connect:', error)
    }
  }

  /**
   * 发送 ping 消息保持连接活跃
   */
  private sendPing(): void {
    if (this.port) {
      try {
        this.port.postMessage({ type: 'ping', timestamp: Date.now() })
      } catch (error) {
        console.error('ServiceWorkerConnection: Failed to send ping:', error)
      }
    }
  }

  /**
   * 唤醒 Service Worker
   */
  async wakeUpServiceWorker(): Promise<boolean> {
    try {
      console.log('ServiceWorkerConnection: Attempting to wake up Service Worker...')
      
      // 方法1: 发送 WAKE_UP 消息
      const response = await chrome.runtime.sendMessage({ type: 'WAKE_UP' })
      if (response?.success) {
        console.log('ServiceWorkerConnection: Service Worker awakened via WAKE_UP message')
        return true
      }
      
      // 方法2: 发送 PING 消息
      const pingResponse = await chrome.runtime.sendMessage({ type: 'PING' })
      if (pingResponse?.success) {
        console.log('ServiceWorkerConnection: Service Worker responding to PING')
        return true
      }
      
      console.log('ServiceWorkerConnection: Service Worker may be inactive, but connection established')
      return false
      
    } catch (error) {
      console.error('ServiceWorkerConnection: Failed to wake up Service Worker:', error)
      return false
    }
  }

  /**
   * 发送消息到 Service Worker
   */
  async sendMessage(message: any): Promise<any> {
    try {
      // 确保 Service Worker 处于活跃状态
      await this.wakeUpServiceWorker()
      
      // 发送消息
      return await chrome.runtime.sendMessage(message)
    } catch (error) {
      console.error('ServiceWorkerConnection: Failed to send message:', error)
      throw error
    }
  }

  /**
   * 获取 Service Worker 状态
   */
  async getServiceWorkerStatus(): Promise<any> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'PING' })
      return response?.status || null
    } catch (error) {
      console.error('ServiceWorkerConnection: Failed to get status:', error)
      return null
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.port) {
      this.port.disconnect()
      this.port = null
    }
    console.log('ServiceWorkerConnection: Disconnected')
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return !!this.port
  }
}

/**
 * 工厂函数
 */
export function getServiceWorkerConnection(): ServiceWorkerConnection {
  return ServiceWorkerConnection.getInstance()
}