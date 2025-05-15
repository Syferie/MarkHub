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
  suggestedFolder?: string
  
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
  
  // 访问书签上下文以获取文件夹列表
  const { folders, settings, addBookmark } = useBookmarks()
  
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
  
  // 批量添加任务
  const addTasks = (bookmarksData: BookmarkData[]) => {
    const newTasks: AIClassificationTask[] = []
    
    for (const bookmarkData of bookmarksData) {
      // 生成任务的唯一标识符，结合URL和添加时间
      const bookmarkKey = `${bookmarkData.url}_${bookmarkData.addedAt}`
      
      // 检查是否已经在处理中或已处理过，避免重复任务
      if (processedBookmarks.current.has(bookmarkKey)) {
        console.log(`任务已存在，跳过: ${bookmarkKey}`)
        continue
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
      
      newTasks.push(newTask)
    }
    
    // 批量添加到队列
    if (newTasks.length > 0) {
      setTaskQueue(prevQueue => [...prevQueue, ...newTasks])
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

  // 生成标签的函数
  const generateTagsForBookmark = async (task: AIClassificationTask) => {
    // 更新状态为正在生成标签
    setTaskQueue(prevQueue =>
      prevQueue.map(t => 
        t.id === task.id ? { ...t, tagStatus: 'generating_tags' } : t
      )
    )
    
    try {
      // 调用API生成标签
      const generatedTags = await generateTags(
        {
          url: task.url,
        },
        undefined,
        // 使用环境设置
        {
          apiKey: settings?.tagApiKey,
          apiBaseUrl: settings?.tagApiUrl
        }
      )
      
      // 更新标签状态为成功
      setTaskQueue(prevQueue =>
        prevQueue.map(t => 
          t.id === task.id ? { 
            ...t, 
            tagStatus: 'tags_generated',
            generatedTags
          } : t
        )
      )
      
      return generatedTags
    } catch (error) {
      console.error(`为书签 ${task.title} 生成标签失败:`, error)
      
      // 更新标签状态为失败
      setTaskQueue(prevQueue =>
        prevQueue.map(t => 
          t.id === task.id ? { 
            ...t, 
            tagStatus: 'tags_failed',
            tagError: error instanceof Error ? error.message : '生成标签失败'
          } : t
        )
      )
      
      throw error
    }
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
        },
        undefined,
        // 使用环境设置
        {
          apiKey: settings?.tagApiKey,
          apiBaseUrl: settings?.tagApiUrl
        }
      )
      
      // 更新文件夹状态为成功
      setTaskQueue(prevQueue =>
        prevQueue.map(t => 
          t.id === task.id ? { 
            ...t, 
            folderStatus: 'folder_suggested',
            suggestedFolder
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
            folderError: error instanceof Error ? error.message : '建议文件夹失败'
          } : t
        )
      )
      
      throw error
    }
  }

  // 将任务分类结果持久化到书签数据库的函数
  const persistClassificationResult = async (task: AIClassificationTask, status: TaskStatus) => {
    // 首先检查任务ID是否已在持久化集合中
    if (persistingTaskIdsRef.current.has(task.id)) {
      console.log(`任务 ${task.id} 已经在持久化过程中，跳过重复保存。`);
      return;
    }
    
    try {
      // 将任务ID添加到持久化集合中
      persistingTaskIdsRef.current.add(task.id);
      
      // 检查任务是否正在保存中，如果是，则跳过（保留原有检查）
      if (task.isPersisting) {
        console.log(`书签 ${task.title} (ID: ${task.id}) 已经在保存过程中，跳过重复保存`);
        return;
      }
      
      console.log(`正在保存书签: ${task.title} (ID: ${task.id})`);
      
      // 检查任务是否已经保存过，通过在processedBookmarks中查找
      // 我们通过检查Map中存储的任务ID是否与当前任务的ID相同来判断
      const bookmarkKey = `${task.url}_${task.addedAt}`;
      const storedTaskId = processedBookmarks.current.get(bookmarkKey);
      
      // 如果这个任务已经保存过（已处理的任务ID与当前任务ID不同），则跳过保存
      if (storedTaskId && storedTaskId !== task.id) {
        console.log(`书签 ${task.title} 已经被其他任务处理过 (原任务ID: ${storedTaskId})，跳过保存`);
        return;
      }
      
      // 设置任务为正在保存状态
      setTaskQueue(prevQueue =>
        prevQueue.map(t =>
          t.id === task.id ? { ...t, isPersisting: true } : t
        )
      );
      
      // 1. 从任务中提取核心信息
      const { url, title, description, tags: originalTags, addedAt } = task;
      
      // 2. 处理标签
      // 如果标签生成成功，使用生成的标签；如果失败，使用原始标签或空数组
      const tags = task.tagStatus === 'tags_generated' && task.generatedTags
        ? task.generatedTags
        : (originalTags || []);
      
      // 3. 处理文件夹
      let folderId: string | null = null;
      
      if (task.folderStatus === 'folder_suggested' && task.suggestedFolder) {
        // 查找建议的文件夹是否存在
        const suggestedFolderName = task.suggestedFolder.trim();
        const matchingFolder = folders.find(f => f.name.toLowerCase() === suggestedFolderName.toLowerCase());
        
        if (matchingFolder) {
          // 如果文件夹存在，使用它的ID
          folderId = matchingFolder.id;
          console.log(`找到匹配的文件夹 "${suggestedFolderName}", ID: ${folderId}`);
        } else {
          // 方案A: 使用默认文件夹（根目录，folderId = null）
          folderId = null;
          console.log(`未找到文件夹 "${suggestedFolderName}", 使用默认文件夹`);
          
          // 方案B (不实现): 创建新文件夹并使用它
          // 如果将来需要实现方案B，可以调用 addFolder 创建新文件夹
        }
      }
      
      // 4. 构建符合 Bookmark 类型的对象
      const bookmarkData: Bookmark = {
        id: `bookmark-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        title: title,
        url: url,
        folderId: folderId,
        tags: tags,
        createdAt: addedAt || new Date().toISOString(),
        favicon: "",  // 默认空字符串，favicon会在addBookmark函数中自动获取
        isFavorite: false  // 默认不是收藏
      };
      
      // 5. 调用 BookmarkContext 的 addBookmark 方法保存书签
      await addBookmark(bookmarkData);
      
      console.log(`书签 "${title}" 已成功保存到数据库`);
      
      // 注意: 由于已经使用了 BookmarkContext 的 addBookmark，
      // BookmarkContext 会自动通知依赖它的组件更新，不需要额外通知
      
      // 更新任务的 isPersisted 状态为 true
      setTaskQueue(prevQueue =>
        prevQueue.map(t =>
          t.id === task.id ? { ...t, isPersisted: true } : t
        )
      );
      
      // 6. 处理已完成的任务 (可选，根据需要)
      // 在这个示例中，我们不从队列中移除任务，而是保持其最终状态
      // 这样用户可以看到处理历史，但可以通过clearCompletedTasks手动清除
      
    } catch (error) {
      console.error(`保存书签数据失败:`, error);
      throw error; // 重新抛出错误，让调用方处理
    } finally {
      // 无论成功还是失败，都将任务的isPersisting状态重置为false
      // 这是为了防止任务状态卡在isPersisting=true，从而永远无法再次保存
      setTaskQueue(prevQueue =>
        prevQueue.map(t =>
          t.id === task.id ? { ...t, isPersisting: false } : t
        )
      );
      
      // 从持久化中任务ID集合中移除当前任务ID
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