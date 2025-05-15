"use client"

import { useEffect } from 'react'
import { useAIClassification, type BookmarkData } from '@/context/ai-classification-context'

export default function ExtensionMessageListener() {
  const { addTask, addTasks } = useAIClassification()
  
  useEffect(() => {
    // 定义消息处理函数
    const handleMessage = (event: MessageEvent) => {
      // 安全检查：确保消息来源是可信的
      if (event.source !== window) return
      if (!event.data || event.data.source !== 'markhub-extension') return
      
      // 处理消息类型
      switch (event.data.type) {
        // 处理单个书签
        case 'NEW_BOOKMARK_FOR_AI_CLASSIFICATION': {
          if (event.data.payload) {
            console.log('收到单个书签数据:', event.data.payload)
            // 添加到任务队列
            addTask(event.data.payload as BookmarkData)
          }
          break
        }
        
        // 处理批量书签
        case 'NEW_BOOKMARK_FOR_AI_CLASSIFICATION_BATCH': {
          if (Array.isArray(event.data.payload) && event.data.payload.length > 0) {
            console.log(`收到批量书签数据: ${event.data.payload.length} 条记录`)
            // 批量添加到任务队列
            addTasks(event.data.payload as BookmarkData[])
          }
          break
        }
        
        // 扩展已加载的通知
        case 'MARKHUB_EXTENSION_LOADED': {
          console.log('MarkHub 扩展已连接')
          break
        }
      }
    }
    
    // 添加事件监听器
    window.addEventListener('message', handleMessage)
    
    // 当组件卸载时移除事件监听器
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [addTask, addTasks])
  
  // 这个组件不需要渲染任何内容
  return null
}