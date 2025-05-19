"use client"

import { useEffect, useRef } from 'react'
import { useAIClassification, type BookmarkData, type AIClassificationTask } from '@/context/ai-classification-context'
import { useBookmarks } from '@/context/bookmark-context'
import { db, type Bookmark, type Folder } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'
import { generateTags } from '@/lib/tag-api'

// 从Chrome扩展接收的书签数据接口
interface SyncedBookmarkPayload {
  url: string
  title: string
  chromeBookmarkId: string
  chromeParentId: string
  folderName: string
  createdAt: string // ISO字符串
}

// Chrome扩展消息类型
const MESSAGE_TYPE_FOLDER_CLASSIFIED_BOOKMARK = 'MARKHUB_CHROME_SYNC_FOLDER_CLASSIFIED_BOOKMARK'
const MESSAGE_TYPE_REQUEST_PENDING_BOOKMARKS = 'REQUEST_PENDING_BOOKMARKS_FROM_EXTENSION'

export default function ExtensionMessageListener() {
  const { addTask, addTasks } = useAIClassification()
  const { folders, addBookmark, tags: allTags } = useBookmarks()
  
  // MarkHub应用启动时请求Chrome扩展中的暂存书签数据
  useEffect(() => {
    // 向Chrome扩展发送请求暂存书签的消息
    const requestPendingBookmarks = () => {
      console.log('向Chrome扩展请求暂存的书签数据')
      window.postMessage({
        source: 'markhub-app',
        type: MESSAGE_TYPE_REQUEST_PENDING_BOOKMARKS
      }, '*')
    }
    
    // 延迟2秒后发送请求，确保页面完全加载和Chrome扩展有足够时间连接
    const timeoutId = setTimeout(requestPendingBookmarks, 2000)
    
    return () => {
      clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    // 定义消息处理函数 - 针对实际使用场景优化（小批量书签）
    const handleMessage = async (event: MessageEvent) => {
      // 安全检查：确保消息来源是可信的
      if (event.source !== window) return
      
      // 处理来自extension发送的消息
      if (event.data && (
          event.data.source === 'markhub-extension' ||
          event.data.type === MESSAGE_TYPE_FOLDER_CLASSIFIED_BOOKMARK
      )) {
        
        // 使用 requestAnimationFrame 将消息处理推迟到下一次绘制之前
        // 这样可以保证UI操作（如动画）优先执行，提高用户体验
        window.requestAnimationFrame(async () => {
          switch (event.data.type) {
            // 扩展已加载的通知 - 立即处理
            case 'MARKHUB_EXTENSION_LOADED': {
              console.log('MarkHub 扩展已连接')
              // 向发送方返回确认消息
              if (event.source && 'postMessage' in event.source) {
                (event.source as Window).postMessage({ 
                  success: true, 
                  message: "MarkHub 应用收到连接通知" 
                }, { targetOrigin: '*' })
              }
              break
            }
            
            // 处理单个书签
            case 'NEW_BOOKMARK_FOR_AI_CLASSIFICATION': {
              if (event.data.payload) {
                console.log('收到单个书签数据:', event.data.payload)
                // 添加到任务队列
                addTask(event.data.payload as BookmarkData)
                // 向发送方返回确认消息
                if (event.source && 'postMessage' in event.source) {
                  (event.source as Window).postMessage({ success: true }, { targetOrigin: '*' })
                }
              }
              break
            }
            
            // 处理批量书签 - 根据实际场景简化处理
            // 由于用户一般只添加2-6个书签，不需要复杂的分块处理
            case 'NEW_BOOKMARK_FOR_AI_CLASSIFICATION_BATCH': {
              if (Array.isArray(event.data.payload) && event.data.payload.length > 0) {
                const batchData = event.data.payload as BookmarkData[]
                console.log(`收到批量书签数据: ${batchData.length} 条记录`)
                
                // 直接添加到任务队列，不需要分块处理
                // 因为根据实际使用场景，批量的书签数量很少
                addTasks(batchData)
                // 向发送方返回确认消息
                if (event.source && 'postMessage' in event.source) {
                  (event.source as Window).postMessage({ success: true }, { targetOrigin: '*' })
                }
              }
              break
            }
            
            // 处理来自Chrome扩展的文件夹分类后的书签
            case MESSAGE_TYPE_FOLDER_CLASSIFIED_BOOKMARK: {
              if (event.data.payload) {
                const bookmarkData = event.data.payload as SyncedBookmarkPayload
                console.log('收到Chrome同步的分类书签数据:', bookmarkData)
                
                try {
                  // 处理此书签
                  await handleChromeClassifiedBookmark(bookmarkData)
                  
                  // 向Chrome扩展发送成功响应
                  if (event.source && 'postMessage' in event.source) {
                    (event.source as Window).postMessage({ success: true }, { targetOrigin: '*' })
                  }
                } catch (error) {
                  console.error('处理Chrome同步书签失败:', error)
                  
                  // 向Chrome扩展发送失败响应
                  if (event.source && 'postMessage' in event.source) {
                    (event.source as Window).postMessage({ 
                      success: false, 
                      error: error instanceof Error ? error.message : '处理书签时出错' 
                    }, { targetOrigin: '*' })
                  }
                }
              }
              break
            }
          }
        })
      }
    }
    
    // 添加事件监听器
    window.addEventListener('message', handleMessage)
    
    // 当组件卸载时移除事件监听器
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [addTask, addTasks, folders])
  
  // 处理Chrome扩展发送的分类书签数据
  const handleChromeClassifiedBookmark = async (bookmarkData: SyncedBookmarkPayload) => {
    try {
      // 1. 直接用文件夹名查找/创建MarkHub文件夹
      const markhubFolderId = await findOrCreateFolderByName(bookmarkData.folderName)

      // 2. 根据URL查找是否已存在书签
      const existingBookmark = await findBookmarkByUrl(bookmarkData.url)

      let processedBookmark: Bookmark
      if (existingBookmark) {
        existingBookmark.title = bookmarkData.title
        existingBookmark.folderId = markhubFolderId
        existingBookmark.tags = []
        await db.saveBookmark(existingBookmark)
        processedBookmark = existingBookmark
      } else {
        const newBookmark: Bookmark = {
          id: `bookmark-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          title: bookmarkData.title,
          url: bookmarkData.url,
          folderId: markhubFolderId,
          tags: [],
          createdAt: bookmarkData.createdAt || new Date().toISOString(),
          favicon: "",
          isFavorite: false
        }
        await db.saveBookmark(newBookmark)
        processedBookmark = newBookmark
      }
      // 3. 触发AI标签推荐
      await triggerAITagRecommendation(processedBookmark)
      return true
    } catch (error) {
      console.error('处理Chrome分类书签失败:', error)
      throw error
    }
  }
  
  // 根据URL查找书签
  const findBookmarkByUrl = async (url: string): Promise<Bookmark | null> => {
    try {
      // 获取所有书签
      const allBookmarks = await db.getAllBookmarks()
      
      // 查找匹配URL的书签
      return allBookmarks.find(bookmark => bookmark.url === url) || null
    } catch (error) {
      console.error('根据URL查找书签失败:', error)
      throw error
    }
  }
  
  // 根据文件夹名称查找或创建Markhub文件夹
  const findOrCreateFolderByName = async (folderName: string): Promise<string> => {
    try {
      // 查找是否已存在同名文件夹（不区分大小写）
      const existingFolder = folders.find(
        folder => folder.name.toLowerCase() === folderName.toLowerCase()
      )
      
      if (existingFolder) {
        return existingFolder.id
      }
      
      // 创建新文件夹
      const newFolder: Folder = {
        id: `folder-${uuidv4()}`,
        name: folderName,
        parentId: null
      }
      
      // 保存新文件夹
      await db.saveFolder(newFolder)
      
      return newFolder.id
    } catch (error) {
      console.error('查找或创建文件夹失败:', error)
      throw error
    }
  }
  
  /**
   * 触发AI标签推荐并更新书签标签
   *
   * @param bookmark - 需要推荐标签的书签对象
   */
  const triggerAITagRecommendation = async (bookmark: Bookmark) => {
    try {
      console.log(`开始为书签(${bookmark.title})生成AI标签推荐`)
      
      // 方法1: 通过AIClassificationContext的任务系统处理
      // 创建BookmarkData对象
      const bookmarkData: BookmarkData = {
        url: bookmark.url,
        title: bookmark.title,
        addedAt: bookmark.createdAt || new Date().toISOString()
      }
      
      // 添加到AI分类任务队列
      addTask(bookmarkData)
      console.log(`已将书签(${bookmark.title})添加到AI标签推荐任务队列`)

      // 方法2: 直接调用generateTags API (作为备选方法)
      // 直接获取标签的实现，如果需要更高优先级处理
      try {
        // 直接调用标签生成API
        const generatedTags = await generateTags({
          url: bookmark.url,
          filter_tags: allTags // 传递现有标签作为过滤/参考
        })
        
        // 更新书签对象的标签
        if (generatedTags && generatedTags.length > 0) {
          bookmark.tags = generatedTags
          await db.saveBookmark(bookmark)
          console.log(`已直接为书签(${bookmark.title})生成并保存AI标签:`, generatedTags)
        }
      } catch (directTagError) {
        console.error(`直接生成书签(${bookmark.title})的AI标签失败:`, directTagError)
        // 直接方法失败时不抛出错误，因为我们已经将任务添加到队列中
      }
    } catch (error) {
      console.error(`为书签(${bookmark.title})触发AI标签推荐失败:`, error)
      // 这里选择不抛出错误，允许书签处理继续，即使标签生成失败
    }
  }
  
  // 这个组件不需要渲染任何内容
  return null
}