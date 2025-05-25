/**
 * Markhub Chrome Extension - 内容脚本 (Manifest V3 优化版)
 *
 * 该脚本负责:
 * 1. 在页面中注入 AI 文件夹推荐的悬浮气泡 UI
 * 2. 与背景脚本通信
 * 3. 处理用户在页面上的交互
 * 4. 提供现代化的 UI 和交互体验
 * 5. 帮助维持 Service Worker 活跃状态
 */

import { t } from '../utils/contentI18n'

// 检查是否已经注入过脚本，避免重复注入
if (!window.markhubExtensionInjected) {
  window.markhubExtensionInjected = true

  // 全局状态管理
  let currentToast: HTMLElement | null = null
  let isMouseOverToast = false
  let countdownAnimation: Animation | null = null
  let serviceWorkerConnection: chrome.runtime.Port | null = null

  // Service Worker 连接管理
  function initializeServiceWorkerConnection() {
    try {
      console.log('Content Script: Initializing Service Worker connection...')
      
      // 检查扩展上下文是否有效
      if (!chrome.runtime?.id) {
        console.log('Content Script: Extension context invalidated, skipping connection')
        return
      }
      
      // 建立与 Service Worker 的持久连接
      serviceWorkerConnection = chrome.runtime.connect({ name: 'keepAlive' })
      
      serviceWorkerConnection.onDisconnect.addListener(() => {
        console.log('Content Script: Service Worker connection lost, attempting reconnect...')
        serviceWorkerConnection = null
        
        // 检查是否是扩展上下文失效
        if (chrome.runtime.lastError?.message?.includes('Extension context invalidated')) {
          console.log('Content Script: Extension context invalidated, stopping reconnection attempts')
          return
        }
        
        // 延迟重连
        setTimeout(() => {
          if (chrome.runtime?.id) {
            initializeServiceWorkerConnection()
          }
        }, 2000)
      })
      
      serviceWorkerConnection.onMessage.addListener((message) => {
        if (message.type === 'pong') {
          console.log('Content Script: Received pong from Service Worker')
        }
      })
      
      // 定期发送 ping 保持连接
      setInterval(() => {
        if (serviceWorkerConnection && chrome.runtime?.id) {
          try {
            serviceWorkerConnection.postMessage({
              type: 'ping',
              timestamp: Date.now(),
              source: 'content-script'
            })
          } catch (error) {
            console.log('Content Script: Failed to send ping, connection may be lost')
          }
        }
      }, 25000) // 25秒间隔
      
      console.log('Content Script: Service Worker connection established')
      
    } catch (error) {
      console.error('Content Script: Failed to initialize Service Worker connection:', error)
    }
  }

  // 确保 Service Worker 处于活跃状态的辅助函数
  async function ensureServiceWorkerActive(): Promise<boolean> {
    try {
      // 检查扩展上下文是否有效
      if (!chrome.runtime?.id) {
        console.log('Content Script: Extension context invalidated')
        return false
      }
      
      // 尝试发送 ping 消息
      const response = await chrome.runtime.sendMessage({ type: 'PING' })
      return response?.success || false
    } catch (error) {
      if (error instanceof Error && error.message?.includes('Extension context invalidated')) {
        console.log('Content Script: Extension context invalidated during ping')
        return false
      }
      console.log('Content Script: Service Worker may be inactive:', error)
      return false
    }
  }

  // 增强的消息发送函数
  async function sendMessageToServiceWorker(message: any): Promise<any> {
    try {
      // 检查扩展上下文是否有效
      if (!chrome.runtime?.id) {
        console.log('Content Script: Extension context invalidated, cannot send message')
        return { success: false, error: 'Extension context invalidated' }
      }
      
      // 确保 Service Worker 活跃
      const isActive = await ensureServiceWorkerActive()
      if (!isActive) {
        console.log('Content Script: Service Worker is not active, message may fail')
      }
      
      // 发送消息
      return await chrome.runtime.sendMessage(message)
    } catch (error) {
      if (error instanceof Error && error.message?.includes('Extension context invalidated')) {
        console.log('Content Script: Extension context invalidated during message send')
        return { success: false, error: 'Extension context invalidated' }
      }
      console.error('Content Script: Failed to send message to Service Worker:', error)
      throw error
    }
  }

  // 立即初始化 Service Worker 连接
  initializeServiceWorkerConnection()

  // 监听来自背景脚本的消息
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      switch (message.type) {
        case 'SHOW_AI_PROCESSING':
          try {
            showAIProcessingToast()
          } catch (error) {
            console.error('Markhub Extension Content: Error in showAIProcessingToast:', error)
          }
          sendResponse({ success: true })
          return true

        case 'SHOW_FOLDER_RECOMMENDATION':
          try {
            showFolderRecommendationToast(message.data)
          } catch (error) {
            console.error('Markhub Extension Content: Error in showFolderRecommendationToast:', error)
          }
          sendResponse({ success: true })
          return true

        case 'SHOW_AI_ERROR':
          try {
            showAIErrorToast(message.data)
          } catch (error) {
            console.error('Markhub Extension Content: Error in showAIErrorToast:', error)
          }
          sendResponse({ success: true })
          return true

        case 'HIDE_FOLDER_RECOMMENDATION':
          try {
            hideToast()
          } catch (error) {
            console.error('Markhub Extension Content: Error in hideToast:', error)
          }
          sendResponse({ success: true })
          return true

        default:
          sendResponse({ success: false, error: 'Unknown message type' })
          return true
      }
    } catch (error) {
      console.error('Markhub Extension Content: Error handling message:', error)
      sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) })
      return true
    }
  })

  /**
   * 显示 AI 处理中悬浮气泡
   */
  function showAIProcessingToast() {
    // 移除已存在的气泡
    hideToast()

    // 创建气泡容器
    const toast = createToastContainer('processing')
    
    // 创建气泡内容
    toast.innerHTML = `
      <div class="markhub-toast-content">
        <div class="markhub-toast-icon markhub-processing">
          <div class="markhub-spinner">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
                <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
              </svg>
            </div>
        </div>
        <div class="markhub-toast-text">
          <div class="markhub-toast-title">${t('aiClassifying')}</div>
          <div class="markhub-toast-message">${t('aiClassifyingMessage')}</div>
        </div>
      </div>
    `

    // 添加到 Shadow DOM
    appendToastToShadowDOM(toast)

    // 触发入场动画
    requestAnimationFrame(() => {
      toast.classList.add('markhub-toast-show')
    })
  }

  /**
   * 生成错误Toast的HTML内容
   */
  function generateErrorToastHTML(data: { message?: string }): string {
    return `
      <div class="markhub-toast-content">
        <div class="markhub-toast-icon markhub-error">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <div class="markhub-toast-text">
          <div class="markhub-toast-title">${t('aiRecommendationFailed')}</div>
          <div class="markhub-toast-message">${data.message || t('aiRecommendationFailedMessage')}</div>
        </div>
        <button class="markhub-toast-close" onclick="window.markhubHideToast()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `
  }

  /**
   * 显示 AI 错误悬浮气泡
   */
  function showAIErrorToast(data: { message?: string }) {
    // 如果已有Toast，直接更新内容而不是重新创建
    if (currentToast) {
      // 更新Toast的类名为错误状态
      currentToast.className = 'markhub-toast markhub-toast-error markhub-toast-show'
      
      // 使用共享的HTML生成函数
      currentToast.innerHTML = generateErrorToastHTML(data)
      return
    }

    // 创建新的错误Toast
    const toast = createToastContainer('error')
    
    // 使用共享的HTML生成函数
    toast.innerHTML = generateErrorToastHTML(data)

    // 添加到 Shadow DOM（修复：之前错误地添加到 document.body）
    appendToastToShadowDOM(toast)

    // 触发入场动画
    requestAnimationFrame(() => {
      toast.classList.add('markhub-toast-show')
    })

    // 5秒后自动隐藏
    setTimeout(() => {
      hideToast()
    }, 5000)
  }

  /**
   * 为Toast添加事件监听器
   */
  function addToastEventListeners(toast: HTMLElement) {
    // 直接在现有元素上添加事件监听器，不替换节点
    // 这样避免触发 MutationObserver
    
    // 添加点击事件监听器
    toast.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const button = target.closest('[data-action]') as HTMLElement
      
      if (button) {
        const action = button.getAttribute('data-action')
        const bookmarkId = button.getAttribute('data-bookmark-id')
        
        if (action === 'accept') {
          // 用户确认推荐
          sendMessageToServiceWorker({
            type: 'ACCEPT_FOLDER_RECOMMENDATION',
            data: { bookmarkId }
          }).catch(error => {
            console.error('Content Script: Failed to send accept message:', error)
          })
          hideToast()
        } else if (action === 'dismiss') {
          // 用户取消推荐
          sendMessageToServiceWorker({
            type: 'DISMISS_FOLDER_RECOMMENDATION',
            data: { bookmarkId }
          }).catch(error => {
            console.error('Content Script: Failed to send dismiss message:', error)
          })
          hideToast()
        }
      }
    })

    // 移除鼠标悬停暂停机制，保持倒计时连续进行
    // 不再添加 mouseenter 和 mouseleave 事件监听器
  }

  /**
   * 生成推荐Toast的HTML内容
   */
  function generateRecommendationToastHTML(data: {
    bookmarkTitle: string
    recommendedFolder: string
    bookmarkId: string
    confidence?: number
    reason?: string
    isAlreadyInFolder?: boolean
  }): string {
    const isAlreadyInFolder = data.isAlreadyInFolder || false
    const toastType = isAlreadyInFolder ? 'success' : 'recommendation'
    
    const iconSvg = isAlreadyInFolder
      ? '<path d="M20 6L9 17l-5-5"/>' // 勾选图标
      : '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>' // 书签图标
    
    const title = isAlreadyInFolder ? t('aiRecommendationConfirm') : t('aiFolderRecommendation')
    const message = isAlreadyInFolder
      ? t('alreadyInRecommendedFolder', { title: data.bookmarkTitle, folder: data.recommendedFolder })
      : t('suggestMoveToFolder', { title: data.bookmarkTitle, folder: data.recommendedFolder })
    
    const confidenceText = data.confidence ? t('confidenceLevel', { confidence: Math.round(data.confidence * 100) }) : ''
    const messageWithConfidence = message + confidenceText
    
    return `
      <div class="markhub-toast-content">
        <div class="markhub-toast-header">
          <div class="markhub-toast-icon ${toastType}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${iconSvg}
            </svg>
          </div>
          <div class="markhub-toast-title">${title}</div>
        </div>
        <div class="markhub-toast-text">
          <div class="markhub-toast-message">${messageWithConfidence}</div>
          ${data.reason ? `<div class="markhub-toast-reason">${data.reason.length > 80 ? data.reason.substring(0, 80) + '...' : data.reason}</div>` : ''}
          ${!isAlreadyInFolder ? `<div class="markhub-toast-timeout">${t('autoAgreeIn5Seconds')}</div>` : ''}
        </div>
        <div class="markhub-toast-actions">
          ${isAlreadyInFolder ? `
            <button class="markhub-btn markhub-btn-primary" data-action="dismiss" data-bookmark-id="${data.bookmarkId}">
              ${t('gotIt')}
            </button>
          ` : `
            <button class="markhub-btn markhub-btn-primary" data-action="accept" data-bookmark-id="${data.bookmarkId}">
              ${t('agreeToMove')}
            </button>
            <button class="markhub-btn markhub-btn-secondary" data-action="dismiss" data-bookmark-id="${data.bookmarkId}">
              ${t('keepInPlace')}
            </button>
          `}
        </div>
        ${!isAlreadyInFolder ? '<div class="markhub-countdown-border"></div>' : ''}
      </div>
    `
  }

  /**
   * 更新现有Toast的内容
   */
  function updateToastContent(data: {
    bookmarkTitle: string
    recommendedFolder: string
    bookmarkId: string
    confidence?: number
    reason?: string
    isAlreadyInFolder?: boolean
  }) {
    if (!currentToast) {
      return
    }

    const isAlreadyInFolder = data.isAlreadyInFolder || false
    const toastType = isAlreadyInFolder ? 'success' : 'recommendation'
    
    // 更新Toast的类名
    currentToast.className = `markhub-toast markhub-toast-${toastType} markhub-toast-show`
    
    // 使用共享的HTML生成函数
    currentToast.innerHTML = generateRecommendationToastHTML(data)

    // 重新添加事件监听器
    addToastEventListeners(currentToast)

    // 如果不是已在文件夹中，启动倒计时
    if (!isAlreadyInFolder) {
      startAutoHideTimer(data.bookmarkId)
    }
  }

  /**
   * 显示文件夹推荐悬浮气泡
   */
  function showFolderRecommendationToast(data: {
    bookmarkTitle: string
    recommendedFolder: string
    bookmarkId: string
    confidence?: number
    reason?: string
    isAlreadyInFolder?: boolean
  }) {
    // 如果已有Toast，直接更新内容而不是重新创建
    if (currentToast) {
      updateToastContent(data)
      return
    }

    // 根据是否已在推荐文件夹显示不同的内容
    const isAlreadyInFolder = data.isAlreadyInFolder || false
    const toastType = isAlreadyInFolder ? 'success' : 'recommendation'
    
    // 创建气泡容器
    const toast = createToastContainer(toastType)
    
    // 使用共享的HTML生成函数
    toast.innerHTML = generateRecommendationToastHTML(data)

    // 添加事件监听器
    toast.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const button = target.closest('[data-action]') as HTMLElement
      
      if (button) {
        const action = button.getAttribute('data-action')
        const bookmarkId = button.getAttribute('data-bookmark-id')
        
        if (action === 'accept') {
          // 用户确认推荐
          sendMessageToServiceWorker({
            type: 'ACCEPT_FOLDER_RECOMMENDATION',
            data: { bookmarkId }
          }).catch(error => {
            console.error('Content Script: Failed to send accept message:', error)
          })
          hideToast()
        } else if (action === 'dismiss') {
          // 用户取消推荐
          sendMessageToServiceWorker({
            type: 'DISMISS_FOLDER_RECOMMENDATION',
            data: { bookmarkId }
          }).catch(error => {
            console.error('Content Script: Failed to send dismiss message:', error)
          })
          hideToast()
        }
      }
    })

    // 鼠标悬停事件
    toast.addEventListener('mouseenter', () => {
      isMouseOverToast = true
      if (countdownAnimation) {
        countdownAnimation.pause()
      }
    })

    toast.addEventListener('mouseleave', () => {
      isMouseOverToast = false
      if (!isAlreadyInFolder) {
        startAutoHideTimer(data.bookmarkId)
      }
    })

    // 创建一个使用 Shadow DOM 的超级稳定容器
    let hostElement = document.getElementById('markhub-shadow-host')
    let shadowRoot: ShadowRoot
    
    if (!hostElement) {
      hostElement = document.createElement('div')
      hostElement.id = 'markhub-shadow-host'
      hostElement.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
      `
      
      // 创建 Shadow DOM
      shadowRoot = hostElement.attachShadow({ mode: 'closed' })
      
      // 将样式注入到 Shadow DOM 中
      const shadowStyles = document.createElement('style')
      shadowStyles.textContent = getToastStylesContent()
      shadowRoot.appendChild(shadowStyles)
      
      // 将 host 元素添加到页面
      document.documentElement.appendChild(hostElement)
      
      // 保存 shadowRoot 引用
      ;(hostElement as any)._shadowRoot = shadowRoot
    } else {
      shadowRoot = (hostElement as any)._shadowRoot
    }
    
    // 添加到 Shadow DOM
    shadowRoot.appendChild(toast)
    currentToast = toast
    
    // 添加 MutationObserver 监控气泡是否被意外移除
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.removedNodes.forEach((node) => {
            if (node === toast || node === hostElement) {
              observer.disconnect()
            }
          })
        }
      })
    })
    
    // 监控 shadowRoot 和 documentElement
    observer.observe(shadowRoot, {
      childList: true,
      subtree: false
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: false
    })
    
    // 在气泡隐藏时断开观察器
    ;(window as any).markhubDisconnectObserver = () => {
      observer.disconnect()
    }

    // 触发入场动画 - 使用双重 requestAnimationFrame 确保元素完全渲染
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.add('markhub-toast-show')
      })
    })

    // 如果不是"已在文件夹"状态，启动自动隐藏计时器
    if (!isAlreadyInFolder) {
      startAutoHideTimer(data.bookmarkId)
    } else {
      // "已在文件夹"状态，5秒后自动隐藏
      setTimeout(() => {
        if (currentToast === toast) {
          hideToast()
        }
      }, 5000)
    }
  }

  /**
   * 启动自动隐藏计时器和倒计时动画
   */
  function startAutoHideTimer(bookmarkId: string) {
    const TIMEOUT_DURATION = 5000 // 5秒

    // 启动倒计时动画
    const countdownBorder = currentToast?.querySelector('.markhub-countdown-border') as HTMLElement
    if (countdownBorder) {
      countdownAnimation = countdownBorder.animate([
        { transform: 'scaleX(1)' },
        { transform: 'scaleX(0)' }
      ], {
        duration: TIMEOUT_DURATION,
        easing: 'linear',
        fill: 'forwards'
      })

      // 监听动画完成事件
      countdownAnimation.addEventListener('finish', () => {
        if (!isMouseOverToast && currentToast) {
          // 超时自动同意
          sendMessageToServiceWorker({
            type: 'ACCEPT_FOLDER_RECOMMENDATION',
            data: { bookmarkId }
          }).catch(error => {
            console.error('Content Script: Failed to send auto-accept message:', error)
          })
          hideToast()
        }
      })
    }

    // 移除备用计时器，完全依赖动画进度
  }

  /**
   * 创建气泡容器
   */
  function createToastContainer(type: 'processing' | 'recommendation' | 'success' | 'error'): HTMLElement {
    const toast = document.createElement('div')
    toast.className = `markhub-toast markhub-toast-${type}`
    toast.id = 'markhub-folder-recommendation-toast'
    
    return toast
  }

  /**
   * 隐藏悬浮气泡
   */
  function hideToast() {
    // 断开 MutationObserver
    if ((window as any).markhubDisconnectObserver) {
      (window as any).markhubDisconnectObserver()
    }
    
    if (currentToast) {
      // 清理动画
      if (countdownAnimation) {
        countdownAnimation.cancel()
        countdownAnimation = null
      }

      // 触发退场动画
      currentToast.classList.add('markhub-toast-hide')
      
      setTimeout(() => {
        if (currentToast) {
          currentToast.remove()
          currentToast = null
        }
        isMouseOverToast = false
      }, 300)
    }
  }

  /**
   * 将气泡添加到 Shadow DOM
   */
  function appendToastToShadowDOM(toast: HTMLElement) {
    // 创建一个使用 Shadow DOM 的超级稳定容器
    let hostElement = document.getElementById('markhub-shadow-host')
    let shadowRoot: ShadowRoot
    
    if (!hostElement) {
      hostElement = document.createElement('div')
      hostElement.id = 'markhub-shadow-host'
      hostElement.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
      `
      
      // 创建 Shadow DOM
      shadowRoot = hostElement.attachShadow({ mode: 'closed' })
      
      // 将样式注入到 Shadow DOM 中
      const shadowStyles = document.createElement('style')
      shadowStyles.textContent = getToastStylesContent()
      shadowRoot.appendChild(shadowStyles)
      
      // 将 host 元素添加到页面
      document.documentElement.appendChild(hostElement)
      
      // 保存 shadowRoot 引用
      ;(hostElement as any)._shadowRoot = shadowRoot
    } else {
      shadowRoot = (hostElement as any)._shadowRoot
    }
    
    // 添加到 Shadow DOM
    shadowRoot.appendChild(toast)
    currentToast = toast
    
    // 添加 MutationObserver 监控气泡是否被意外移除
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.removedNodes.forEach((node) => {
            if (node === toast || node === hostElement) {
              observer.disconnect()
            }
          })
        }
      })
    })
    
    // 监控 shadowRoot 和 documentElement
    observer.observe(shadowRoot, {
      childList: true,
      subtree: false
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: false
    })
    
    // 在气泡隐藏时断开观察器
    ;(window as any).markhubDisconnectObserver = () => {
      observer.disconnect()
    }
  }

  /**
   * 获取气泡样式内容
   */
  function getToastStylesContent(): string {
    return `
      /* 基础样式 - 更紧凑的设计 */
      .markhub-toast {
        position: fixed !important;
        top: 24px !important;
        right: 24px !important;
        left: auto !important;
        bottom: auto !important;
        z-index: 2147483647 !important;
        background: #1f2937 !important;
        border-radius: 12px !important;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2) !important;
        max-width: 360px !important;
        min-width: 300px !important;
        padding: 16px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 14px !important;
        line-height: 1.4 !important;
        color: #f9fafb !important;
        transform: translateX(100%) !important;
        opacity: 0 !important;
        transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease !important;
        pointer-events: none !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        backdrop-filter: blur(10px) !important;
        overflow: hidden !important;
        margin: 0 !important;
        display: block !important;
        visibility: visible !important;
        float: none !important;
        clear: none !important;
      }

      .markhub-toast.markhub-toast-show {
        transform: translateX(0) !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      .markhub-toast.markhub-toast-hide {
        transform: translateX(100%) !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      /* 气泡内容布局 - 更紧凑的设计 */
      .markhub-toast-content {
        display: flex !important;
        flex-direction: column !important;
        gap: 12px !important;
        position: relative !important;
      }

      /* 头部布局 - 图标和标题同行 */
      .markhub-toast-header {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
      }

      /* 图标样式 - 更小更紧凑 */
      .markhub-toast-icon {
        flex-shrink: 0 !important;
        width: 32px !important;
        height: 32px !important;
        border-radius: 50% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: white !important;
        font-weight: 600 !important;
      }

      .markhub-toast-icon.processing {
        background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
        animation: markhub-pulse 2s infinite !important;
      }

      .markhub-toast-icon.recommendation {
        background: linear-gradient(135deg, #10b981, #059669) !important;
      }

      .markhub-toast-icon.success {
        background: linear-gradient(135deg, #10b981, #059669) !important;
      }

      .markhub-toast-icon.error {
        background: linear-gradient(135deg, #ef4444, #dc2626) !important;
      }

      /* 标题样式 */
      .markhub-toast-title {
        font-weight: 600 !important;
        font-size: 15px !important;
        color: #f9fafb !important;
        margin: 0 !important;
        line-height: 1.3 !important;
        flex: 1 !important;
      }

      /* 文字内容区域 */
      .markhub-toast-text {
        display: flex !important;
        flex-direction: column !important;
        gap: 8px !important;
        text-align: left !important;
      }

      /* 消息文本样式 */
      .markhub-toast-message {
        color: #e5e7eb !important;
        margin: 0 !important;
        line-height: 1.4 !important;
        font-size: 14px !important;
      }

      /* 推荐原因样式 - 更亮的颜色 */
      .markhub-toast-reason {
        background: rgba(59, 130, 246, 0.15) !important;
        border: 1px solid rgba(59, 130, 246, 0.3) !important;
        border-radius: 6px !important;
        padding: 8px 10px !important;
        margin-top: 6px !important;
        font-style: italic !important;
        font-size: 12px !important;
        color: #93c5fd !important;
        max-width: 100% !important;
        word-wrap: break-word !important;
        line-height: 1.3 !important;
      }

      /* 超时提示样式 */
      .markhub-toast-timeout {
        font-size: 12px !important;
        color: #fbbf24 !important;
        margin: 4px 0 0 0 !important;
        line-height: 1.3 !important;
        font-weight: 500 !important;
      }

      /* 按钮样式 - 更紧凑 */
      .markhub-toast-actions {
        display: flex !important;
        gap: 8px !important;
        margin-top: 12px !important;
        justify-content: center !important;
        width: 100% !important;
      }

      .markhub-btn {
        padding: 6px 12px !important;
        border-radius: 6px !important;
        border: none !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        outline: none !important;
        text-decoration: none !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 70px !important;
        flex: 1 !important;
      }

      .markhub-btn-primary {
        background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
        color: white !important;
      }

      .markhub-btn-primary:hover {
        background: linear-gradient(135deg, #2563eb, #1e40af) !important;
        transform: translateY(-1px) !important;
      }

      .markhub-btn-secondary {
        background: rgba(75, 85, 99, 0.8) !important;
        color: #d1d5db !important;
        border: 1px solid rgba(107, 114, 128, 0.6) !important;
      }

      .markhub-btn-secondary:hover {
        background: rgba(107, 114, 128, 0.9) !important;
        color: #f9fafb !important;
      }

      /* 关闭按钮 */
      .markhub-toast-close {
        position: absolute !important;
        top: 12px !important;
        right: 12px !important;
        background: none !important;
        border: none !important;
        color: #9ca3af !important;
        cursor: pointer !important;
        padding: 4px !important;
        border-radius: 4px !important;
        transition: color 0.2s ease !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      .markhub-toast-close:hover {
        color: #f9fafb !important;
        background: rgba(75, 85, 99, 0.5) !important;
      }

      /* 倒计时边框 */
      .markhub-countdown-border {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: linear-gradient(90deg, #10b981, #059669);
        border-radius: 0 0 16px 16px;
        width: 100%;
        transform-origin: left;
      }

      /* 超时提示样式 */
      .markhub-timeout-hint {
        color: #f59e0b !important;
        font-weight: 500 !important;
      }

      /* 动画 */
      @keyframes markhub-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }

      @keyframes markhub-slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes markhub-slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }
    `
  }

  // 添加样式
  function injectStyles() {
    if (document.getElementById('markhub-toast-styles')) {
      return
    }

    const styles = document.createElement('style')
    styles.id = 'markhub-toast-styles'
    styles.textContent = `
      /* 基础样式 */
      .markhub-toast {
        position: fixed !important;
        top: 24px !important;
        right: 24px !important;
        left: auto !important;
        bottom: auto !important;
        z-index: 2147483647 !important;
        background: #1f2937 !important;
        border-radius: 16px !important;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2) !important;
        max-width: 380px !important;
        min-width: 320px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
        color: #f9fafb !important;
        transform: translateX(100%) !important;
        opacity: 0 !important;
        transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease !important;
        pointer-events: none !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        backdrop-filter: blur(10px) !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        display: block !important;
        visibility: visible !important;
        float: none !important;
        clear: none !important;
      }

      .markhub-toast.markhub-toast-show {
        transform: translateX(0) !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      .markhub-toast.markhub-toast-hide {
        transform: translateX(100%) !important;
        opacity: 0 !important;
      }

      /* 主题颜色 */
      .markhub-toast-processing {
        border-left: 4px solid #3b82f6;
      }

      .markhub-toast-recommendation {
        border-left: 4px solid #10b981;
      }

      .markhub-toast-success {
        border-left: 4px solid #10b981;
      }

      .markhub-toast-error {
        border-left: 4px solid #ef4444;
      }

      /* 内容布局 */
      .markhub-toast-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 16px;
        padding: 20px;
        position: relative;
      }

      /* 图标样式 */
      .markhub-toast-icon {
        flex-shrink: 0;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        margin-bottom: 4px;
      }

      .markhub-toast-icon.processing {
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      }

      .markhub-toast-icon.recommendation {
        background: linear-gradient(135deg, #10b981, #059669);
      }

      .markhub-toast-icon.success {
        background: linear-gradient(135deg, #10b981, #059669);
      }

      .markhub-toast-icon.error {
        background: linear-gradient(135deg, #ef4444, #dc2626);
      }

      /* 加载动画 */
      .markhub-spinner {
        animation: markhub-spin 1s linear infinite;
      }

      @keyframes markhub-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      /* 文本样式 */
      .markhub-toast-text {
        flex: 1;
        min-width: 0;
      }

      .markhub-toast-title {
        font-weight: 600;
        color: #f9fafb;
        margin-bottom: 4px;
        font-size: 15px;
      }

      .markhub-toast-message {
        color: #d1d5db;
        margin-bottom: 8px;
        line-height: 1.4;
      }

      .markhub-toast-meta {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 4px;
      }

      .markhub-toast-meta.markhub-reason {
        background: rgba(255, 255, 255, 0.05);
        padding: 8px 12px;
        border-radius: 8px;
        margin-top: 8px;
        border-left: 3px solid #3b82f6;
        line-height: 1.4;
        font-size: 11px;
      }

      /* 按钮样式 */
      .markhub-toast-actions {
        display: flex;
        gap: 12px;
        margin-top: 16px;
        justify-content: center;
        width: 100%;
      }

      .markhub-btn {
        border: none;
        border-radius: 8px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
      }

      .markhub-btn-primary {
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
        color: white;
      }

      .markhub-btn-primary:hover {
        background: linear-gradient(135deg, #1d4ed8, #1e40af);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      }

      .markhub-btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #d1d5db;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      .markhub-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #f9fafb;
        transform: translateY(-1px);
      }

      /* 关闭按钮 */
      .markhub-toast-close {
        position: absolute;
        top: 16px;
        right: 16px;
        background: none;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: all 0.2s ease;
      }

      .markhub-toast-close:hover {
        color: #6b7280;
        background: #f3f4f6;
      }

      /* 倒计时边框 */
      .markhub-countdown-border {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, #10b981, #059669);
        transform-origin: left;
        border-radius: 0 0 16px 16px;
      }

      /* 超时提示样式 */
      .markhub-timeout-hint {
        color: #f59e0b !important;
        font-weight: 500;
        font-size: 11px !important;
      }

      /* 响应式设计 */
      @media (max-width: 480px) {
        .markhub-toast {
          left: 16px;
          right: 16px;
          top: 16px;
          max-width: none;
          min-width: auto;
        }
      }

      /* 深色模式支持 */
      @media (prefers-color-scheme: dark) {
        .markhub-toast {
          background: #1f2937;
          border-color: rgba(255, 255, 255, 0.1);
          color: #f9fafb;
        }

        .markhub-toast-title {
          color: #f9fafb;
        }

        .markhub-toast-message {
          color: #d1d5db;
        }

        .markhub-toast-meta {
          color: #9ca3af;
        }

        .markhub-btn-secondary {
          background: #374151;
          color: #d1d5db;
          border-color: #4b5563;
        }

        .markhub-btn-secondary:hover {
          background: #4b5563;
          color: #f9fafb;
        }

        .markhub-toast-close:hover {
          background: #374151;
          color: #d1d5db;
        }
      }
    `
    document.head.appendChild(styles)
  }

  // 页面加载完成后的初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize)
  } else {
    initialize()
  }
function initialize() {
    
    // 注入样式
    injectStyles()
    
    // 暴露全局方法
    window.markhubHideToast = hideToast
  }
}

// 扩展 Window 接口以避免 TypeScript 错误
declare global {
  interface Window {
    markhubExtensionInjected?: boolean
    markhubHideToast?: () => void
  }
}

export {}