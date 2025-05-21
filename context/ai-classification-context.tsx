"use client"

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react"
import { useBookmarks } from "@/context/bookmark-context"
import { generateTags } from "@/lib/tag-api"
import { suggestFolder } from "@/lib/folder-api"
import type { Bookmark } from "@/lib/db"

// AI分类任务状态类型
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partially_failed'

// 单个AI分类任务类型
export interface AIClassificationTask {
  id: string
  url: string
  title: string
  addedAt: string
  tags?: string[]
  description?: string

  // AI处理相关状态
  tagStatus: 'pending' | 'generating_tags' | 'tags_generated' | 'tags_failed'
  folderStatus: 'pending' | 'suggesting_folder' | 'folder_suggested' | 'folder_failed'
  overallStatus: TaskStatus

  // 生成的结果
  generatedTags?: string[]
  suggestedFolder?: string | undefined

  // 错误信息
  tagError?: string
  folderError?: string

  // 状态锁，防止重复保存
  isPersisting?: boolean

  // 标记任务是否已持久化到数据库
  isPersisted?: boolean
}

// 上下文类型定义
interface AIClassificationContextType {
  taskQueue: AIClassificationTask[]
  addTask: (bookmarkData: BookmarkData) => void
  addTasks: (bookmarksData: BookmarkData[]) => void
  hasActiveTasks: boolean
  processingCount: number
  completedCount: number
  failedCount: number
  clearCompletedTasks: () => void
  clearAllTasks: () => void
}

// 从插件接收的书签数据类型
export interface BookmarkData {
  url: string
  title: string
  addedAt: string
  tags?: string[]
  description?: string
}

// 创建上下文
const AIClassificationContext = createContext<AIClassificationContextType | undefined>(undefined)

// 提供者组件
export function AIClassificationProvider({ children }: { children: ReactNode }) {
  // 任务队列状态
  const [taskQueue, setTaskQueue] = useState<AIClassificationTask[]>([])

  // 用于防止任务重复处理的集合
  // 使用 Map 存储 URL 和添加时间组合的去重键值对，值为任务ID
  const processedBookmarks = useRef<Map<string, string>>(new Map())

  // 正在进行的任务计数
  const processingTasksRef = useRef<number>(0)

  // 使用 useRef 存储当前正在被持久化的任务ID集合
  const persistingTaskIdsRef = useRef<Set<string>>(new Set())

  // 访问书签上下文以获取文件夹列表和标签
  const { folders, settings, addBookmark, tags } = useBookmarks()

  // 添加单个任务
  const addTask = (bookmarkData: BookmarkData) => {
    // 生成任务的唯一标识符，结合URL和添加时间
    // 这样即使同一个URL在不同时间添加也可以区分
    const bookmarkKey = `${bookmarkData.url}_${bookmarkData.addedAt}`

    // 检查是否已经在处理中或已处理过，避免重复任务
    if (processedBookmarks.current.has(bookmarkKey)) {
      console.log(`任务已存在，跳过: ${bookmarkKey}`)
      return
    }

    // 生成任务ID
    const taskId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    // 添加到已处理集合，值为任务ID
    processedBookmarks.current.set(bookmarkKey, taskId)

    // 创建新任务，使用前面生成的唯一ID
    const newTask: AIClassificationTask = {
      id: taskId,
      url: bookmarkData.url,
      title: bookmarkData.title,
      addedAt: bookmarkData.addedAt,
      tags: bookmarkData.tags || [],
      description: bookmarkData.description || "",

      tagStatus: 'pending',
      folderStatus: 'pending',
      overallStatus: 'pending'
    }

    // 添加到队列
    setTaskQueue(prevQueue => [...prevQueue, newTask])
  }

  // 批量添加任务 - 针对小批量书签优化版本
  const addTasks = (bookmarksData: BookmarkData[]) => {
    
    if (!bookmarksData.length) return;
    
    // 创建一个新任务数组
    const newTasks: AIClassificationTask[] = [];
    const timestamp = Date.now(); // 使用单一时间戳，避免多次调用Date.now()
    
    // 处理每个书签数据
    for (let i = 0; i < bookmarksData.length; i++) {
      const bookmarkData = bookmarksData[i];
      const bookmarkKey = `${bookmarkData.url}_${bookmarkData.addedAt}`;
      
      // 检查任务是否已存在
      if (processedBookmarks.current.has(bookmarkKey)) {
        continue;
      }
      
      // 创建唯一ID (使用索引作为区分，减少随机数生成开销)
      const taskId = `${timestamp}-${i}-${Math.random().toString(36).substring(2, 5)}`;
      
      // 添加到已处理集合
      processedBookmarks.current.set(bookmarkKey, taskId);
      
      // 创建新任务
      newTasks.push({
        id: taskId,
        url: bookmarkData.url,
        title: bookmarkData.title,
        addedAt: bookmarkData.addedAt,
        tags: bookmarkData.tags || [],
        description: bookmarkData.description || "",
        
        tagStatus: 'pending',
        folderStatus: 'pending',
        overallStatus: 'pending'
      });
    }
    
    // 如果有新任务，一次性更新状态
    if (newTasks.length > 0) {
      setTaskQueue(prevQueue => [...prevQueue, ...newTasks]);
    }
  }

  // 清除已完成任务
  const clearCompletedTasks = () => {
    setTaskQueue(prevQueue =>
      prevQueue.filter(task =>
        task.overallStatus !== 'completed' && task.overallStatus !== 'partially_failed'
      )
    )
  }

  // 清除所有任务
  const clearAllTasks = () => {
    setTaskQueue([])
    processedBookmarks.current.clear()
  }

  // 计算统计数据
  const hasActiveTasks = taskQueue.some(task =>
    task.overallStatus === 'pending' || task.overallStatus === 'processing'
  )

  const processingCount = taskQueue.filter(
    task => task.overallStatus === 'processing'
  ).length

  const completedCount = taskQueue.filter(
    task => task.overallStatus === 'completed' || task.overallStatus === 'partially_failed'
  ).length

  const failedCount = taskQueue.filter(
    task => task.overallStatus === 'failed'
  ).length

  // 处理任务队列的效果
  useEffect(() => {
    // 如果没有待处理任务，直接返回
    if (!Array.isArray(taskQueue) || taskQueue.length === 0) {
      return
    }

    // 查找待处理任务
    const pendingTasks = taskQueue.filter(task => task.overallStatus === 'pending')
    if (pendingTasks.length === 0) {
      return
    }

    // 获取并发限制
    const concurrencyLimit = (settings?.tagConcurrencyLimit && settings.tagConcurrencyLimit > 0) ?
      settings.tagConcurrencyLimit : 5

    // 如果正在处理的任务数已经达到上限，则等待
    if (processingTasksRef.current >= concurrencyLimit) {
      return
    }

    // 处理单个任务
    const processTask = async (task: AIClassificationTask) => {
      // 标记为正在处理
      processingTasksRef.current += 1

      try {
        // 更新任务状态为处理中
        setTaskQueue(prevQueue =>
          prevQueue.map(t =>
            t.id === task.id ? { ...t, overallStatus: 'processing' } : t
          )
        )

        // 获取当前文件夹名称列表
        const folderNames = Array.isArray(folders)
          ? folders.map(folder => folder.name)
          : []

        // 并行发起标签生成和文件夹建议请求
        const tagPromise = generateTagsForBookmark(task)
        const folderPromise = suggestFolderForBookmark(task, folderNames)

        // 等待所有请求完成
        await Promise.allSettled([tagPromise, folderPromise])

        // 检查标签和文件夹状态，更新整体状态
        setTaskQueue(prevQueue =>
          prevQueue.map(t => {
            if (t.id !== task.id) return t

            let overallStatus: TaskStatus = 'completed'

            // 如果有任何一项失败
            if (t.tagStatus === 'tags_failed' && t.folderStatus === 'folder_failed') {
              overallStatus = 'failed'
            }
            // 如果部分失败
            else if (t.tagStatus === 'tags_failed' || t.folderStatus === 'folder_failed') {
              overallStatus = 'partially_failed'
            }

            // 任务最终状态确定后，我们需要保存这个结果
            // 这个函数将立即创建一个闭包并直接执行
            (async () => {
              try {
                // 当任务完成或部分完成或失败时，且没有正在保存中，且未被持久化时，才尝试保存书签
                if (['completed', 'partially_failed', 'failed'].includes(overallStatus) &&
                    !t.isPersisting && !t.isPersisted) {
                  await persistClassificationResult(t, overallStatus);
                }
              } catch (error) {
                console.error(`保存书签 ${t.title} 到数据库失败:`, error);
              }
            })();

            return { ...t, overallStatus }
          })
        )
      } finally {
        // 减少处理中的任务计数
        processingTasksRef.current -= 1
      }
    }

    // 同时启动多个任务，但不超过并发限制
    const tasksToProcess = pendingTasks.slice(0, concurrencyLimit - processingTasksRef.current)
    tasksToProcess.forEach(processTask)

  }, [taskQueue, folders, settings])

  // 生成标签的函数 - 已弃用，标签生成已移至后端
  const generateTagsForBookmark = async (task: AIClassificationTask) => {
    console.log(`标签生成已移至后端，任务 ${task.id} 的标签将在书签保存时自动生成`);
    
    // 更新状态为跳过标签生成（因为已移至后端）
    setTaskQueue(prevQueue =>
      prevQueue.map(t =>
        t.id === task.id ? {
          ...t,
          tagStatus: 'tags_generated',  // 假装成功以不阻止流程
          generatedTags: [],  // 空标签数组
        } : t
      )
    )

    return [];  // 返回空数组
  }

  // 建议文件夹的函数
  const suggestFolderForBookmark = async (task: AIClassificationTask, folderNames: string[]) => {
    // 更新状态为正在建议文件夹
    setTaskQueue(prevQueue =>
      prevQueue.map(t =>
        t.id === task.id ? { ...t, folderStatus: 'suggesting_folder' } : t
      )
    )

    try {
      // 调用API建议文件夹
      const suggestedFolder = await suggestFolder(
        {
          url: task.url,
          folders: folderNames
        }
      )

      // 更新文件夹状态为成功
      setTaskQueue(prevQueue =>
        prevQueue.map(t =>
          t.id === task.id ? {
            ...t,
            folderStatus: 'folder_suggested',
            suggestedFolder: suggestedFolder || undefined // 确保类型兼容
          } : t
        )
      )

      return suggestedFolder
    } catch (error) {
      console.error(`为书签 ${task.title} 建议文件夹失败:`, error)

      // 更新文件夹状态为失败
      setTaskQueue(prevQueue =>
        prevQueue.map(t =>
          t.id === task.id ? {
            ...t,
            folderStatus: 'folder_failed',
            folderError: error instanceof Error ? error.message : 'Failed to suggest folder'
          } : t
        )
      )

      throw error
    }
  }

  // 将任务分类结果持久化到书签数据库的函数 - 优化版本
  const persistClassificationResult = async (task: AIClassificationTask, status: TaskStatus) => {
    // 防止重复保存
    if (persistingTaskIdsRef.current.has(task.id) || task.isPersisting || task.isPersisted) {
      return;
    }

    try {
      // 标记为正在持久化
      persistingTaskIdsRef.current.add(task.id);
      
      // 使用 requestIdleCallback 在浏览器空闲时执行持久化操作
      // 这样可以避免阻塞主线程，优化性能
      const saveTask = () => {
        // 设置任务为正在保存状态（使用单一状态更新）
        setTaskQueue(prevQueue =>
          prevQueue.map(t => t.id === task.id ? { ...t, isPersisting: true } : t)
        );
        
        // 异步执行保存操作
        (async () => {
          try {
            // 从任务中提取核心信息
            const { url, title, description, tags: originalTags, addedAt } = task;
            
            // 不需要处理标签，后端会自动生成
            // 我们只传递原始标签，后端会忽略它们并重新生成
            const tags = originalTags || [];
            
            // 处理文件夹
            let folderId: string | null = null;
            
            if (task.folderStatus === 'folder_suggested' && task.suggestedFolder) {
              const suggestedFolderName = task.suggestedFolder.trim();
              const matchingFolder = folders.find(f =>
                f.name.toLowerCase() === suggestedFolderName.toLowerCase()
              );
              
              if (matchingFolder) {
                folderId = matchingFolder.id;
              } else {
                folderId = null;
              }
            }
            
            // 构建书签数据对象
            const bookmarkData: Bookmark = {
              id: `bookmark-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
              title: title,
              url: url,
              folderId: folderId,
              tags: tags,
              createdAt: addedAt || new Date().toISOString(),
              favicon: "",
              isFavorite: false
            };
            
            // 调用 BookmarkContext 的 addBookmark 方法保存书签
            await addBookmark(bookmarkData);
            
            // 完成后更新任务状态（使用单一状态更新，避免多次更新）
            setTaskQueue(prevQueue =>
              prevQueue.map(t => t.id === task.id ? {
                ...t,
                isPersisting: false,
                isPersisted: true
              } : t)
            );
          } catch (error) {
            console.error(`保存书签数据失败:`, error);
            
            // 出错时恢复任务状态
            setTaskQueue(prevQueue =>
              prevQueue.map(t => t.id === task.id ? { ...t, isPersisting: false } : t)
            );
          } finally {
            // 清理持久化集合
            persistingTaskIdsRef.current.delete(task.id);
          }
        })();
      };
      
      // 使用 requestIdleCallback 或降级到 setTimeout
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(saveTask);
      } else {
        setTimeout(saveTask, 10);
      }
    } catch (error) {
      console.error(`安排保存任务失败:`, error);
      persistingTaskIdsRef.current.delete(task.id);
    }
  };

  return (
    <AIClassificationContext.Provider
      value={{
        taskQueue,
        addTask,
        addTasks,
        hasActiveTasks,
        processingCount,
        completedCount,
        failedCount,
        clearCompletedTasks,
        clearAllTasks
      }}
    >
      {children}
    </AIClassificationContext.Provider>
  )
}

// 自定义hook以使用上下文
export function useAIClassification() {
  const context = useContext(AIClassificationContext)
  if (context === undefined) {
    throw new Error("useAIClassification must be used within an AIClassificationProvider")
  }
  return context
}