/**
 * Service Worker 调试工具
 * 
 * 用于监控和调试 Service Worker 的状态和生命周期
 */

export class ServiceWorkerDebugger {
  private static instance: ServiceWorkerDebugger
  private debugLog: Array<{ timestamp: number; message: string; type: 'info' | 'warn' | 'error' }> = []
  private maxLogEntries = 100

  static getInstance(): ServiceWorkerDebugger {
    if (!ServiceWorkerDebugger.instance) {
      ServiceWorkerDebugger.instance = new ServiceWorkerDebugger()
    }
    return ServiceWorkerDebugger.instance
  }

  /**
   * 记录调试信息
   */
  log(message: string, type: 'info' | 'warn' | 'error' = 'info'): void {
    const entry = {
      timestamp: Date.now(),
      message,
      type
    }
    
    this.debugLog.push(entry)
    
    // 保持日志条目数量在限制内
    if (this.debugLog.length > this.maxLogEntries) {
      this.debugLog.shift()
    }
    
    // 同时输出到控制台
    const timeStr = new Date(entry.timestamp).toISOString()
    const prefix = `[SW Debug ${timeStr}]`
    
    switch (type) {
      case 'error':
        console.error(prefix, message)
        break
      case 'warn':
        console.warn(prefix, message)
        break
      default:
        console.log(prefix, message)
    }
  }

  /**
   * 测试 Service Worker 连接
   */
  async testServiceWorkerConnection(): Promise<{
    isActive: boolean
    responseTime: number
    status?: any
    error?: string
  }> {
    const startTime = Date.now()
    
    try {
      this.log('Testing Service Worker connection...')
      
      const response = await chrome.runtime.sendMessage({ type: 'PING' })
      const responseTime = Date.now() - startTime
      
      if (response?.success) {
        this.log(`Service Worker responded in ${responseTime}ms`, 'info')
        return {
          isActive: true,
          responseTime,
          status: response.status
        }
      } else {
        this.log(`Service Worker responded but with error: ${response?.error}`, 'warn')
        return {
          isActive: false,
          responseTime,
          error: response?.error
        }
      }
    } catch (error) {
      const responseTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.log(`Service Worker connection failed: ${errorMessage}`, 'error')
      
      return {
        isActive: false,
        responseTime,
        error: errorMessage
      }
    }
  }

  /**
   * 监控书签事件
   */
  async monitorBookmarkEvents(): Promise<void> {
    this.log('Starting bookmark event monitoring...')
    
    // 监听书签创建
    chrome.bookmarks.onCreated.addListener((id, bookmark) => {
      this.log(`Bookmark created: ${bookmark.title} (${id})`)
    })
    
    // 监听书签变更
    chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
      this.log(`Bookmark changed: ${id} - ${JSON.stringify(changeInfo)}`)
    })
    
    // 监听书签移动
    chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
      this.log(`Bookmark moved: ${id} - from ${moveInfo.oldParentId} to ${moveInfo.parentId}`)
    })
    
    // 监听书签删除
    chrome.bookmarks.onRemoved.addListener((id, _removeInfo) => {
      this.log(`Bookmark removed: ${id}`)
    })
  }

  /**
   * 获取调试日志
   */
  getDebugLog(): Array<{ timestamp: number; message: string; type: 'info' | 'warn' | 'error' }> {
    return [...this.debugLog]
  }

  /**
   * 清空调试日志
   */
  clearDebugLog(): void {
    this.debugLog = []
    this.log('Debug log cleared')
  }

  /**
   * 导出调试报告
   */
  exportDebugReport(): string {
    const report = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      extensionVersion: chrome.runtime.getManifest().version,
      debugLog: this.debugLog
    }
    
    return JSON.stringify(report, null, 2)
  }

  /**
   * 运行完整的诊断测试
   */
  async runDiagnostics(): Promise<{
    serviceWorkerTest: any
    bookmarkPermissions: boolean
    storagePermissions: boolean
    manifestVersion: number
    recommendations: string[]
  }> {
    this.log('Running diagnostics...')
    
    // 测试 Service Worker
    const serviceWorkerTest = await this.testServiceWorkerConnection()
    
    // 检查权限
    const bookmarkPermissions = await this.checkPermission('bookmarks')
    const storagePermissions = await this.checkPermission('storage')
    
    // 获取 manifest 版本
    const manifestVersion = chrome.runtime.getManifest().manifest_version
    
    // 生成建议
    const recommendations: string[] = []
    
    if (!serviceWorkerTest.isActive) {
      recommendations.push('Service Worker 未响应，可能需要重新加载扩展')
    }
    
    if (serviceWorkerTest.responseTime > 1000) {
      recommendations.push('Service Worker 响应时间较长，可能存在性能问题')
    }
    
    if (!bookmarkPermissions) {
      recommendations.push('缺少书签权限，请检查 manifest.json')
    }
    
    if (!storagePermissions) {
      recommendations.push('缺少存储权限，请检查 manifest.json')
    }
    
    if (manifestVersion !== 3) {
      recommendations.push('建议使用 Manifest V3 以获得更好的性能')
    }
    
    const result = {
      serviceWorkerTest,
      bookmarkPermissions,
      storagePermissions,
      manifestVersion,
      recommendations
    }
    
    this.log(`Diagnostics completed: ${JSON.stringify(result)}`)
    
    return result
  }

  /**
   * 检查权限
   */
  private async checkPermission(permission: string): Promise<boolean> {
    try {
      return await chrome.permissions.contains({ permissions: [permission] })
    } catch (error) {
      this.log(`Failed to check permission ${permission}: ${error}`, 'error')
      return false
    }
  }
}

/**
 * 工厂函数
 */
export function getServiceWorkerDebugger(): ServiceWorkerDebugger {
  return ServiceWorkerDebugger.getInstance()
}

/**
 * 全局调试函数（可在控制台中使用）
 */
if (typeof window !== 'undefined') {
  (window as any).markhubDebugger = {
    test: () => getServiceWorkerDebugger().testServiceWorkerConnection(),
    diagnose: () => getServiceWorkerDebugger().runDiagnostics(),
    logs: () => getServiceWorkerDebugger().getDebugLog(),
    clear: () => getServiceWorkerDebugger().clearDebugLog(),
    export: () => getServiceWorkerDebugger().exportDebugReport()
  }
}