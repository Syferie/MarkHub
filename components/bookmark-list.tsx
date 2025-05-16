"use client"

import React, { type ReactNode, useState, MouseEvent, useEffect, useRef } from "react"
import { ActionIcon, Badge, Text, Tooltip, Checkbox, Button, Group, Select, Progress, Popover, Drawer } from "@mantine/core"
import { useRouter } from "next/navigation"
import {
  IconPencil,
  IconTrash,
  IconExternalLink,
  IconFolder,
  IconTag,
  IconStar,
  IconStarFilled,
  IconClock,
  IconCheck,
  IconSortAscending,
  IconX,
  IconRefresh,
  IconSparkles,
  IconLoader2,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconInfoCircle,
} from "@tabler/icons-react"
import { useBookmarks } from "@/context/bookmark-context"
import EditBookmarkModal from "./edit-bookmark-modal"
import type { Bookmark } from "@/types"
import { generateTags } from "@/lib/tag-api"
import { suggestFolder } from "@/lib/folder-api"

// 添加 isFavorite 属性到 Bookmark 接口
interface ExtendedBookmark extends Bookmark {
  isFavorite?: boolean;
}
// @ts-ignore - 忽略类型检查，因为我们无法安装类型声明包
import { VariableSizeList as List } from "react-window"
// @ts-ignore - 忽略类型检查，因为我们无法安装类型声明包
import AutoSizer from "react-virtualized-auto-sizer"

// 标签生成状态类型
interface TagGenerationStatus {
  status: "waiting" | "processing" | "completed" | "failed";
  message?: string;
  tags?: string[];
  errorMessage?: string;
}

// 批量标签生成的整体状态
interface BulkTagGeneration {
  total: number;
  completed: number;
  failed: number;
  inProgress: boolean;
  isCancelled?: boolean; // 新增：标记任务是否被取消
  currentBookmarkIds: string[]; // 存储当前正在处理的多个书签ID
  timestamp?: number; // 添加时间戳，用于任务恢复时的参考
  concurrencyLimit?: number; // 并发处理的数量限制
}

// 文件夹生成状态类型
interface FolderGenerationStatus {
  status: "waiting" | "processing" | "completed" | "failed";
  message?: string;
  suggestedFolder?: string;
  errorMessage?: string;
}

// 批量文件夹生成的整体状态
interface BulkFolderGeneration {
  total: number;
  completed: number;
  failed: number;
  inProgress: boolean;
  isCancelled?: boolean;
  currentBookmarkIds: string[];
  timestamp?: number;
  concurrencyLimit?: number;
}

interface BookmarkListProps {
  bookmarks: ExtendedBookmark[]
  searchQuery?: string
  sortOptions?: { value: string; label: string }[]
  currentSortOption?: string
  setCurrentSortOption?: (option: string) => void
}

export default function BookmarkList({
  bookmarks,
  searchQuery = "",
  sortOptions = [],
  currentSortOption = "newest",
  setCurrentSortOption,
}: BookmarkListProps) {
  const { deleteBookmark, updateBookmark, folders, tags, setSelectedFolderId, setSelectedTags, toggleFavoriteBookmark, settings } =
    useBookmarks()
  const [editingBookmark, setEditingBookmark] = useState<ExtendedBookmark | null>(null)
  const [selectedBookmarks, setSelectedBookmarks] = useState<string[]>([])
  const [bulkMode, setBulkMode] = useState(false)
  const [showBulkActions, setShowBulkActions] = useState(false)

  // 批量 AI 生成标签相关状态
  const [bulkTagGeneration, setBulkTagGeneration] = useState<BulkTagGeneration | null>(null)
  const [tagGenerationDetails, setTagGenerationDetails] = useState<Record<string, TagGenerationStatus>>({})
  const [showTagGenerationStatus, setShowTagGenerationStatus] = useState(false)
  const [remainingBookmarkIds, setRemainingBookmarkIds] = useState<string[]>([])

  // 批量 AI 生成文件夹相关状态
  const [bulkFolderGeneration, setBulkFolderGeneration] = useState<BulkFolderGeneration | null>(null)
  const [folderGenerationDetails, setFolderGenerationDetails] = useState<Record<string, FolderGenerationStatus>>({})
  const [showFolderGenerationStatus, setShowFolderGenerationStatus] = useState(false)
  const [remainingFolderBookmarkIds, setRemainingFolderBookmarkIds] = useState<string[]>([])
  const router = useRouter()

  // 使用 useRef 存储关键运行时状态，确保在异步回调中可以访问最新值
  const needsRestartRef = useRef<boolean>(false)
  const bulkTagGenerationRef = useRef<BulkTagGeneration | null>(null)
  const tagGenerationDetailsRef = useRef<Record<string, TagGenerationStatus>>({})
  const remainingIdsRef = useRef<string[]>([])
  const activePromisesCountRef = useRef<number>(0)

  // 文件夹生成的ref
  const needsFolderRestartRef = useRef<boolean>(false)
  const bulkFolderGenerationRef = useRef<BulkFolderGeneration | null>(null)
  const folderGenerationDetailsRef = useRef<Record<string, FolderGenerationStatus>>({})
  const remainingFolderIdsRef = useRef<string[]>([])
  const activeFolderPromisesCountRef = useRef<number>(0)

  // 本地存储的键名
  const STORAGE_KEYS = {
    BULK_GENERATION: "markHub_bulk_tag_generation",
    TAG_DETAILS: "markHub_tag_generation_details",
    REMAINING_IDS: "markHub_remaining_bookmark_ids",
    BULK_FOLDER_GENERATION: "markHub_bulk_folder_generation",
    FOLDER_DETAILS: "markHub_folder_generation_details",
    REMAINING_FOLDER_IDS: "markHub_remaining_folder_bookmark_ids"
  }

  const getFolderName = (folderId: string | null) => {
    if (!folderId || !Array.isArray(folders)) return null
    const folder = folders.find((f) => f && f.id === folderId)
    return folder ? folder.name : null
  }

  const handleTagClick = (tag: string, e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedTags && setSelectedTags([tag])
  }

  const handleFolderClick = (folderId: string | null, e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (folderId) {
      setSelectedFolderId && setSelectedFolderId(folderId)
    }
  }

  const handleDeleteBookmark = (id: string, e: MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    deleteBookmark && deleteBookmark(id)
  }

  const handleToggleFavorite = (id: string, e: MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    toggleFavoriteBookmark && toggleFavoriteBookmark(id)
  }

  const toggleBookmarkSelection = (id: string) => {
    setSelectedBookmarks((prev) => (prev.includes(id) ? prev.filter((bookmarkId) => bookmarkId !== id) : [...prev, id]))
  }

  const toggleAllBookmarks = () => {
    if (selectedBookmarks.length === bookmarks.length) {
      setSelectedBookmarks([])
    } else {
      setSelectedBookmarks(bookmarks.map((b) => b.id))
    }
  }

  const handleBulkDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedBookmarks.length} bookmarks?`)) {
      selectedBookmarks.forEach((id) => {
        deleteBookmark && deleteBookmark(id)
      })
      setSelectedBookmarks([])
      setBulkMode(false)
      setShowBulkActions(false)
    }
  }

  const handleBulkFavorite = (favorite: boolean) => {
    selectedBookmarks.forEach((id) => {
      const bookmark = bookmarks.find((b) => b.id === id)
      if (bookmark && bookmark.isFavorite !== favorite) {
        toggleFavoriteBookmark && toggleFavoriteBookmark(id)
      }
    })
    setSelectedBookmarks([])
    setBulkMode(false)
    setShowBulkActions(false)
  }

  // 批量生成标签函数
  const handleBulkGenerateTags = async () => {
    // 获取并发限制
    const concurrencyLimit = getConcurrencyLimit();

    // 初始化批量标签生成状态
    const selectedBookmarkIds = [...selectedBookmarks]
    const total = selectedBookmarkIds.length

    // 保存剩余要处理的书签ID
    setRemainingBookmarkIds(selectedBookmarkIds)
    remainingIdsRef.current = [...selectedBookmarkIds]

    // 重置ref状态
    needsRestartRef.current = false
    activePromisesCountRef.current = 0

    // 创建一个新的生成状态对象，以便我们可以立即使用它，而不依赖异步状态更新
    const newGeneration = {
      total,
      completed: 0,
      failed: 0,
      inProgress: true,
      isCancelled: false,
      currentBookmarkIds: [],
      timestamp: Date.now(), // 添加时间戳
      concurrencyLimit, // 添加并发限制
    }

    // 同时更新状态和ref
    setBulkTagGeneration(newGeneration)
    bulkTagGenerationRef.current = newGeneration

    // 初始化每个书签的处理状态
    const initialStatus: Record<string, TagGenerationStatus> = {}
    selectedBookmarkIds.forEach(id => {
      initialStatus[id] = { status: "waiting" as const }
    })
    setTagGenerationDetails(initialStatus)
    tagGenerationDetailsRef.current = initialStatus

    // 显示状态面板
    setShowTagGenerationStatus(true)

    // 将初始状态保存到 localStorage
    saveStateToLocalStorage(newGeneration, initialStatus, selectedBookmarkIds)

    // 并行处理选中的书签，传入刚创建的生成状态对象
    await processBookmarks(selectedBookmarkIds, newGeneration)

    // 批量操作完成后关闭批量操作面板
    setShowBulkActions(false)
  }

  // 保存状态到 localStorage 的函数
  const saveStateToLocalStorage = (
    generation: BulkTagGeneration | null,
    details: Record<string, TagGenerationStatus> = {},
    remainingIds: string[] = []
  ) => {
    // 确保只在浏览器环境中运行
    if (typeof window === 'undefined') return;

    try {
      if (generation) {
        localStorage.setItem(STORAGE_KEYS.BULK_GENERATION, JSON.stringify(generation))
        localStorage.setItem(STORAGE_KEYS.TAG_DETAILS, JSON.stringify(details))
        localStorage.setItem(STORAGE_KEYS.REMAINING_IDS, JSON.stringify(remainingIds))
      } else {
        // 如果 generation 为 null，则清除所有相关存储
        localStorage.removeItem(STORAGE_KEYS.BULK_GENERATION)
        localStorage.removeItem(STORAGE_KEYS.TAG_DETAILS)
        localStorage.removeItem(STORAGE_KEYS.REMAINING_IDS)

        // 同时重置ref值
        needsRestartRef.current = false;
      }
    } catch (error) {
      console.error("Failed to save task state to localStorage:", error)
    }
  }

  // 获取并发处理的限制数
  const getConcurrencyLimit = (): number => {
    // 从设置中获取并发数量，默认为5
    return (settings?.tagConcurrencyLimit && settings.tagConcurrencyLimit > 0) ? settings.tagConcurrencyLimit : 5;
  }

  // 处理书签列表的函数 - 支持并行处理和取消
  const processBookmarks = async (bookmarkIds: string[], initialGeneration?: BulkTagGeneration) => {
    // 获取并发限制
    const concurrencyLimit = getConcurrencyLimit();

    // 重新初始化关键ref
    remainingIdsRef.current = [...bookmarkIds];
    activePromisesCountRef.current = 0;

    // 当前处理中的书签ID集合
    let processingIds: string[] = [];

    // 使用最新的生成状态（通过函数获取当前状态或使用传入的初始状态）
    const initialGen = initialGeneration || bulkTagGenerationRef.current;
    if (!initialGen) return;

    // 初始化批量生成状态
    const generation = {
      ...initialGen,
      concurrencyLimit,
      currentBookmarkIds: [] // 清空，将在处理过程中填充
    };

    // 同步更新ref
    bulkTagGenerationRef.current = generation;

    // 检查是否所有工作都已完成的辅助函数
    const isAllWorkDone = (): boolean => {
      return remainingIdsRef.current.length === 0 && activePromisesCountRef.current === 0;
    };

    // 处理单个书签的函数
    const processBookmark = async (bookmarkId: string): Promise<void> => {
      // 调试日志: 开始处理书签
      console.log(`[DEBUG] processBookmark: Starting to process bookmarkId=${bookmarkId}`);

      // 重要: 在处理前检查该书签是否已经被处理过
      const currentStatus = tagGenerationDetailsRef.current[bookmarkId]?.status;
      if (currentStatus === "completed" || currentStatus === "failed") {
        console.log(`[DEBUG] 跳过已处理过的书签: ${bookmarkId}, 状态: ${currentStatus}`);
        return;
      }

      // 获取当前书签
      const bookmark = bookmarks.find(b => b.id === bookmarkId);
      if (!bookmark) {
        console.log(`[DEBUG] 没有找到对应的书签: ${bookmarkId}`);
        return;
      }

      // 增加活跃任务计数
      activePromisesCountRef.current += 1;
      console.log(`[DEBUG] 增加活跃任务数: ${activePromisesCountRef.current}`);

      // 添加到当前处理列表
      processingIds.push(bookmarkId);

      // 更新全局状态，展示当前正在处理的书签
      setBulkTagGeneration(prev => {
        if (!prev) return null;
        const updatedGeneration = {
          ...prev,
          currentBookmarkIds: [...processingIds] // 更新当前处理中的书签ID列表
        };
        // 同步更新ref
        bulkTagGenerationRef.current = updatedGeneration;
        // 保存到 localStorage
        localStorage.setItem(STORAGE_KEYS.BULK_GENERATION, JSON.stringify(updatedGeneration));
        return updatedGeneration;
      });

      try {
        // 更新书签状态为处理中
        setTagGenerationDetails(prev => {
          const updatedDetails = {
            ...prev,
            [bookmarkId]: { status: "processing" as const }
          };
          // 同步更新ref
          tagGenerationDetailsRef.current = updatedDetails;
          // 保存到 localStorage
          localStorage.setItem(STORAGE_KEYS.TAG_DETAILS, JSON.stringify(updatedDetails));
          return updatedDetails;
        });

        // 调用 API 生成标签，传递API配置
        const generatedTags = await generateTags(
          {
            url: bookmark.url,
            filter_tags: tags
          },
          {
            onProgressUpdate: (status) => {
              // 更新进度状态
              setTagGenerationDetails(prev => {
                const updatedDetails = {
                  ...prev,
                  [bookmarkId]: {
                    status: "processing" as const,
                    message: status.status === 'processing' ? status.message : undefined
                  }
                };
                // 同步更新ref
                tagGenerationDetailsRef.current = updatedDetails;
                // 保存到 localStorage
                localStorage.setItem(STORAGE_KEYS.TAG_DETAILS, JSON.stringify(updatedDetails));
                return updatedDetails;
              });
            }
          },
          // 从 settings 中获取 API 配置并传递给 generateTags
          {
            apiKey: settings?.tagApiKey,
            apiBaseUrl: settings?.tagApiUrl
          }
        );

        // API调用结束，记录结果
        console.log(`[DEBUG] API call completed successfully for ${bookmarkId}`);

        // 合并新标签和现有标签
        const existingTags = bookmark.tags || [];
        const mergedTags = [...new Set([...existingTags, ...generatedTags])];

        // 更新书签对象
        const updatedBookmark = {
          ...bookmark,
          tags: mergedTags
        };

        // 更新全局状态
        updateBookmark(updatedBookmark);

        // 更新成功状态
        setTagGenerationDetails(prev => {
          const updatedDetails = {
            ...prev,
            [bookmarkId]: {
              status: "completed" as const,
              tags: generatedTags
            }
          };
          // 同步更新ref
          tagGenerationDetailsRef.current = updatedDetails;
          // 保存到 localStorage
          localStorage.setItem(STORAGE_KEYS.TAG_DETAILS, JSON.stringify(updatedDetails));
          return updatedDetails;
        });

        // 更新总进度
        setBulkTagGeneration(prev => {
          if (!prev) return null;
          const updatedGeneration = {
            ...prev,
            completed: prev.completed + 1
          };
          // 同步更新ref
          bulkTagGenerationRef.current = updatedGeneration;
          // 保存到 localStorage
          localStorage.setItem(STORAGE_KEYS.BULK_GENERATION, JSON.stringify(updatedGeneration));
          return updatedGeneration;
        });

      } catch (error) {
        console.error(`为书签 ${bookmark.title} 生成标签失败:`, error);

        // 更新失败状态
        setTagGenerationDetails(prev => {
          const updatedDetails = {
            ...prev,
            [bookmarkId]: {
              status: "failed" as const,
              errorMessage: error instanceof Error ? error.message : "Unknown error"
            }
          };
          // 同步更新ref
          tagGenerationDetailsRef.current = updatedDetails;
          // 保存到 localStorage
          localStorage.setItem(STORAGE_KEYS.TAG_DETAILS, JSON.stringify(updatedDetails));
          return updatedDetails;
        });

        // 更新总进度
        setBulkTagGeneration(prev => {
          if (!prev) return null;
          const updatedGeneration = {
            ...prev,
            failed: prev.failed + 1,
            completed: prev.completed + 1
          };
          // 同步更新ref
          bulkTagGenerationRef.current = updatedGeneration;
          // 保存到 localStorage
          localStorage.setItem(STORAGE_KEYS.BULK_GENERATION, JSON.stringify(updatedGeneration));
          return updatedGeneration;
        });
      } finally {
        // 从处理中列表移除
        processingIds = processingIds.filter(id => id !== bookmarkId);

        // 减少活跃任务计数
        activePromisesCountRef.current -= 1;
        console.log(`[DEBUG] 减少活跃任务数: ${activePromisesCountRef.current}`);

        // 更新当前处理中的书签ID列表
        setBulkTagGeneration(prev => {
          if (!prev) return null;
          const updatedGeneration = {
            ...prev,
            currentBookmarkIds: [...processingIds]
          };
          // 同步更新ref
          bulkTagGenerationRef.current = updatedGeneration;
          // 保存到 localStorage
          localStorage.setItem(STORAGE_KEYS.BULK_GENERATION, JSON.stringify(updatedGeneration));
          return updatedGeneration;
        });

        // 检查是否所有工作都已完成
        if (isAllWorkDone() && bulkTagGenerationRef.current?.inProgress) {
          console.log("[DEBUG] 所有任务已完成，标记为结束状态");
          // 所有任务完成，标记为已完成
          setBulkTagGeneration(prev => {
            if (!prev) return null;
            const updatedGeneration = {
              ...prev,
              inProgress: false,
              isCancelled: false,
              currentBookmarkIds: []
            };
            // 同步更新ref
            bulkTagGenerationRef.current = updatedGeneration;
            // 清理 localStorage
            saveStateToLocalStorage(null);
            return updatedGeneration;
          });
          return;
        }

        // 如果有剩余任务且仍在进行中，继续处理
        if (remainingIdsRef.current.length > 0 &&
            activePromisesCountRef.current < concurrencyLimit &&
            bulkTagGenerationRef.current?.inProgress) {
          console.log("[DEBUG] 仍有任务待处理，启动下一批");
          // 使用setTimeout确保当前执行栈清空后再处理下一个任务
          setTimeout(() => {
            startTasks();
          }, 0);
        }
      }
    };

    // 启动并行处理
    const startTasks = () => {
      // 调试日志: 开始任务处理
      console.log(`[DEBUG] startTasks: Running with ${remainingIdsRef.current.length} tasks pending, activePromises: ${activePromisesCountRef.current}`);

      // 如果不再处理，则结束
      if (!bulkTagGenerationRef.current?.inProgress) {
        console.log("[DEBUG] 任务已标记为不再进行，退出处理");
        return;
      }

      // 取出最多 (concurrencyLimit - 当前活跃数量) 个任务进行处理
      const availableSlots = concurrencyLimit - activePromisesCountRef.current;

      if (availableSlots <= 0) {
        console.log("[DEBUG] 没有可用的并发槽位，等待现有任务完成");
        return;
      }

      // 计算需要处理的任务数量
      const tasksToProcess = Math.min(availableSlots, remainingIdsRef.current.length);
      console.log(`[DEBUG] 准备处理 ${tasksToProcess} 个任务`);

      if (tasksToProcess <= 0) {
        // 如果没有任务要处理且活跃任务为0，检查是否所有工作完成
        if (activePromisesCountRef.current === 0) {
          console.log("[DEBUG] 没有更多任务且活跃任务为0，检查是否所有工作完成");
          if (isAllWorkDone() && bulkTagGenerationRef.current?.inProgress) {
            console.log("[DEBUG] 所有任务确认完成，标记为结束状态");
            setBulkTagGeneration(prev => {
              if (!prev) return null;
              const updatedGeneration = {
                ...prev,
                inProgress: false,
                isCancelled: false,
                currentBookmarkIds: []
              };
              // 同步更新ref
              bulkTagGenerationRef.current = updatedGeneration;
              // 清理 localStorage
              saveStateToLocalStorage(null);
              return updatedGeneration;
            });
          }
        }
        return;
      }

      // 从剩余任务中取出要处理的任务
      for (let i = 0; i < tasksToProcess; i++) {
        if (remainingIdsRef.current.length === 0) break;

        const bookmarkId = remainingIdsRef.current.shift();
        if (!bookmarkId) continue;

        // 再次确认这个书签没有被处理过
        const status = tagGenerationDetailsRef.current[bookmarkId]?.status;
        if (status === "completed" || status === "failed") {
          console.log(`[DEBUG] 在startTasks中跳过已处理书签: ${bookmarkId}, 状态: ${status}`);
          // 不增加活跃计数，直接检查下一个
          i--; // 减少计数，确保我们处理足够数量的任务
          continue;
        }

        console.log(`[DEBUG] 启动处理任务: bookmarkId=${bookmarkId}`);
        // 处理书签，不需要等待它完成
        processBookmark(bookmarkId);
      }
    };

    // 立即开始处理任务
    console.log("[DEBUG] Starting task processing");
    startTasks();
  };

  // 批量生成文件夹建议函数
  const handleBulkSuggestFolders = async () => {
    // 获取并发限制
    const concurrencyLimit = getConcurrencyLimit();

    // 初始化批量文件夹生成状态
    const selectedBookmarkIds = [...selectedBookmarks]
    const total = selectedBookmarkIds.length

    // 保存剩余要处理的书签ID
    setRemainingFolderBookmarkIds(selectedBookmarkIds)
    remainingFolderIdsRef.current = [...selectedBookmarkIds]

    // 重置ref状态
    needsFolderRestartRef.current = false
    activeFolderPromisesCountRef.current = 0

    // 获取所有文件夹名称列表
    const folderNames = Array.isArray(folders)
      ? folders.map(folder => folder.name)
      : []

    // 创建一个新的生成状态对象
    const newGeneration = {
      total,
      completed: 0,
      failed: 0,
      inProgress: true,
      isCancelled: false,
      currentBookmarkIds: [],
      timestamp: Date.now(),
      concurrencyLimit,
    }

    // 同时更新状态和ref
    setBulkFolderGeneration(newGeneration)
    bulkFolderGenerationRef.current = newGeneration

    // 初始化每个书签的处理状态
    const initialStatus: Record<string, FolderGenerationStatus> = {}
    selectedBookmarkIds.forEach(id => {
      initialStatus[id] = { status: "waiting" as const }
    })
    setFolderGenerationDetails(initialStatus)
    folderGenerationDetailsRef.current = initialStatus

    // 显示状态面板
    setShowFolderGenerationStatus(true)

    // 将初始状态保存到 localStorage
    saveFolderStateToLocalStorage(newGeneration, initialStatus, selectedBookmarkIds)

    // 并行处理选中的书签，传入刚创建的生成状态对象
    await processFolderBookmarks(selectedBookmarkIds, newGeneration)

    // 批量操作完成后关闭批量操作面板
    setShowBulkActions(false)
  }

  // 保存文件夹状态到 localStorage 的函数
  const saveFolderStateToLocalStorage = (
    generation: BulkFolderGeneration | null,
    details: Record<string, FolderGenerationStatus> = {},
    remainingIds: string[] = []
  ) => {
    // 确保只在浏览器环境中运行
    if (typeof window === 'undefined') return;

    try {
      if (generation) {
        localStorage.setItem(STORAGE_KEYS.BULK_FOLDER_GENERATION, JSON.stringify(generation))
        localStorage.setItem(STORAGE_KEYS.FOLDER_DETAILS, JSON.stringify(details))
        localStorage.setItem(STORAGE_KEYS.REMAINING_FOLDER_IDS, JSON.stringify(remainingIds))
      } else {
        // 如果 generation 为 null，则清除所有相关存储
        localStorage.removeItem(STORAGE_KEYS.BULK_FOLDER_GENERATION)
        localStorage.removeItem(STORAGE_KEYS.FOLDER_DETAILS)
        localStorage.removeItem(STORAGE_KEYS.REMAINING_FOLDER_IDS)

        // 同时重置ref值
        needsFolderRestartRef.current = false;
      }
    } catch (error) {
      console.error("Failed to save folder task state to localStorage:", error)
    }
  }

  // 处理文件夹建议书签列表的函数 - 支持并行处理和取消
  const processFolderBookmarks = async (bookmarkIds: string[], initialGeneration?: BulkFolderGeneration) => {
    // 获取并发限制
    const concurrencyLimit = getConcurrencyLimit();

    // 重新初始化关键ref
    remainingFolderIdsRef.current = [...bookmarkIds];
    activeFolderPromisesCountRef.current = 0;

    // 当前处理中的书签ID集合
    let processingIds: string[] = [];

    // 获取所有文件夹名称列表
    const folderNames = Array.isArray(folders)
      ? folders.map(folder => folder.name)
      : []

    // 使用最新的生成状态（通过函数获取当前状态或使用传入的初始状态）
    const initialGen = initialGeneration || bulkFolderGenerationRef.current;
    if (!initialGen) return;

    // 初始化批量生成状态
    const generation = {
      ...initialGen,
      concurrencyLimit,
      currentBookmarkIds: [] // 清空，将在处理过程中填充
    };

    // 同步更新ref
    bulkFolderGenerationRef.current = generation;

    // 检查是否所有工作都已完成的辅助函数
    const isAllWorkDone = (): boolean => {
      return remainingFolderIdsRef.current.length === 0 && activeFolderPromisesCountRef.current === 0;
    };

    // 处理单个书签的函数
    const processBookmark = async (bookmarkId: string): Promise<void> => {
      // 调试日志: 开始处理书签
      console.log(`[DEBUG] processBookmark folder suggest: Starting to process bookmarkId=${bookmarkId}`);

      // 重要: 在处理前检查该书签是否已经被处理过
      const currentStatus = folderGenerationDetailsRef.current[bookmarkId]?.status;
      if (currentStatus === "completed" || currentStatus === "failed") {
        console.log(`[DEBUG] 跳过已处理过的书签: ${bookmarkId}, 状态: ${currentStatus}`);
        return;
      }

      // 获取当前书签
      const bookmark = bookmarks.find(b => b.id === bookmarkId);
      if (!bookmark) {
        console.log(`[DEBUG] 没有找到对应的书签: ${bookmarkId}`);
        return;
      }

      // 增加活跃任务计数
      activeFolderPromisesCountRef.current += 1;
      console.log(`[DEBUG] 增加活跃文件夹任务数: ${activeFolderPromisesCountRef.current}`);

      // 添加到当前处理列表
      processingIds.push(bookmarkId);

      // 更新全局状态，展示当前正在处理的书签
      setBulkFolderGeneration(prev => {
        if (!prev) return null;
        const updatedGeneration = {
          ...prev,
          currentBookmarkIds: [...processingIds] // 更新当前处理中的书签ID列表
        };
        // 同步更新ref
        bulkFolderGenerationRef.current = updatedGeneration;
        // 保存到 localStorage
        localStorage.setItem(STORAGE_KEYS.BULK_FOLDER_GENERATION, JSON.stringify(updatedGeneration));
        return updatedGeneration;
      });

      try {
        // 更新书签状态为处理中
        setFolderGenerationDetails(prev => {
          const updatedDetails = {
            ...prev,
            [bookmarkId]: { status: "processing" as const }
          };
          // 同步更新ref
          folderGenerationDetailsRef.current = updatedDetails;
          // 保存到 localStorage
          localStorage.setItem(STORAGE_KEYS.FOLDER_DETAILS, JSON.stringify(updatedDetails));
          return updatedDetails;
        });

        // 调用 API 生成文件夹建议，传递API配置
        const suggestedFolder = await suggestFolder(
          {
            url: bookmark.url,
            folders: folderNames
          },
          {
            onProgressUpdate: (status) => {
              // 更新进度状态
              setFolderGenerationDetails(prev => {
                const updatedDetails = {
                  ...prev,
                  [bookmarkId]: {
                    status: "processing" as const,
                    message: status.status === 'processing' ? status.message : undefined
                  }
                };
                // 同步更新ref
                folderGenerationDetailsRef.current = updatedDetails;
                // 保存到 localStorage
                localStorage.setItem(STORAGE_KEYS.FOLDER_DETAILS, JSON.stringify(updatedDetails));
                return updatedDetails;
              });
            }
          },
          // 从 settings 中获取 API 配置并传递给 suggestFolder
          {
            apiKey: settings?.tagApiKey,
            apiBaseUrl: settings?.tagApiUrl
          }
        );

        // API调用结束，记录结果
        console.log(`[DEBUG] Folder API call completed successfully for ${bookmarkId}`);

        // 确认文件夹存在
        if (suggestedFolder) {
          const matchedFolder = folders.find(folder => folder.name === suggestedFolder);
          if (matchedFolder) {
            // 更新书签对象
            const updatedBookmark = {
              ...bookmark,
              folderId: matchedFolder.id
            };

            // 更新全局状态
            updateBookmark(updatedBookmark);

            // 更新成功状态
            setFolderGenerationDetails(prev => {
              const updatedDetails = {
                ...prev,
                [bookmarkId]: {
                  status: "completed" as const,
                  suggestedFolder: suggestedFolder
                }
              };
              // 同步更新ref
              folderGenerationDetailsRef.current = updatedDetails;
              // 保存到 localStorage
              localStorage.setItem(STORAGE_KEYS.FOLDER_DETAILS, JSON.stringify(updatedDetails));
              return updatedDetails;
            });
          } else {
            // 文件夹不存在，标记为失败
            setFolderGenerationDetails(prev => {
              const updatedDetails = {
                ...prev,
                [bookmarkId]: {
                  status: "failed" as const,
                  errorMessage: `建议的文件夹 "${suggestedFolder}" 不存在`
                }
              };
              // 同步更新ref
              folderGenerationDetailsRef.current = updatedDetails;
              // 保存到 localStorage
              localStorage.setItem(STORAGE_KEYS.FOLDER_DETAILS, JSON.stringify(updatedDetails));
              return updatedDetails;
            });

            // 增加失败计数
            setBulkFolderGeneration(prev => {
              if (!prev) return null;
              const updatedGeneration = {
                ...prev,
                failed: prev.failed + 1
              };
              // 同步更新ref
              bulkFolderGenerationRef.current = updatedGeneration;
              // 保存到 localStorage
              localStorage.setItem(STORAGE_KEYS.BULK_FOLDER_GENERATION, JSON.stringify(updatedGeneration));
              return updatedGeneration;
            });
          }
        } else {
          // 没有建议的文件夹，标记为失败
          setFolderGenerationDetails(prev => {
            const updatedDetails = {
              ...prev,
              [bookmarkId]: {
                status: "failed" as const,
                errorMessage: "没有获取到建议的文件夹"
              }
            };
            // 同步更新ref
            folderGenerationDetailsRef.current = updatedDetails;
            // 保存到 localStorage
            localStorage.setItem(STORAGE_KEYS.FOLDER_DETAILS, JSON.stringify(updatedDetails));
            return updatedDetails;
          });

          // 增加失败计数
          setBulkFolderGeneration(prev => {
            if (!prev) return null;
            const updatedGeneration = {
              ...prev,
              failed: prev.failed + 1
            };
            // 同步更新ref
            bulkFolderGenerationRef.current = updatedGeneration;
            // 保存到 localStorage
            localStorage.setItem(STORAGE_KEYS.BULK_FOLDER_GENERATION, JSON.stringify(updatedGeneration));
            return updatedGeneration;
          });
        }

        // 更新总进度
        setBulkFolderGeneration(prev => {
          if (!prev) return null;
          const updatedGeneration = {
            ...prev,
            completed: prev.completed + 1
          };
          // 同步更新ref
          bulkFolderGenerationRef.current = updatedGeneration;
          // 保存到 localStorage
          localStorage.setItem(STORAGE_KEYS.BULK_FOLDER_GENERATION, JSON.stringify(updatedGeneration));
          return updatedGeneration;
        });

      } catch (error) {
        console.error(`为书签 ${bookmark.title} 生成文件夹建议失败:`, error);

        // 更新失败状态
        setFolderGenerationDetails(prev => {
          const updatedDetails = {
            ...prev,
            [bookmarkId]: {
              status: "failed" as const,
              errorMessage: error instanceof Error ? error.message : "Unknown error"
            }
          };
          // 同步更新ref
          folderGenerationDetailsRef.current = updatedDetails;
          // 保存到 localStorage
          localStorage.setItem(STORAGE_KEYS.FOLDER_DETAILS, JSON.stringify(updatedDetails));
          return updatedDetails;
        });

        // 更新总进度
        setBulkFolderGeneration(prev => {
          if (!prev) return null;
          const updatedGeneration = {
            ...prev,
            failed: prev.failed + 1,
            completed: prev.completed + 1
          };
          // 同步更新ref
          bulkFolderGenerationRef.current = updatedGeneration;
          // 保存到 localStorage
          localStorage.setItem(STORAGE_KEYS.BULK_FOLDER_GENERATION, JSON.stringify(updatedGeneration));
          return updatedGeneration;
        });
      } finally {
        // 从处理中列表移除
        processingIds = processingIds.filter(id => id !== bookmarkId);

        // 减少活跃任务计数
        activeFolderPromisesCountRef.current -= 1;
        console.log(`[DEBUG] 减少活跃文件夹任务数: ${activeFolderPromisesCountRef.current}`);

        // 更新当前处理中的书签ID列表
        setBulkFolderGeneration(prev => {
          if (!prev) return null;
          const updatedGeneration = {
            ...prev,
            currentBookmarkIds: [...processingIds]
          };
          // 同步更新ref
          bulkFolderGenerationRef.current = updatedGeneration;
          // 保存到 localStorage
          localStorage.setItem(STORAGE_KEYS.BULK_FOLDER_GENERATION, JSON.stringify(updatedGeneration));
          return updatedGeneration;
        });

        // 检查是否所有工作都已完成
        if (isAllWorkDone() && bulkFolderGenerationRef.current?.inProgress) {
          console.log("[DEBUG] 所有文件夹任务已完成，标记为结束状态");
          // 所有任务完成，标记为已完成
          setBulkFolderGeneration(prev => {
            if (!prev) return null;
            const updatedGeneration = {
              ...prev,
              inProgress: false,
              isCancelled: false,
              currentBookmarkIds: []
            };
            // 同步更新ref
            bulkFolderGenerationRef.current = updatedGeneration;
            // 清理 localStorage
            saveFolderStateToLocalStorage(null);
            return updatedGeneration;
          });
          return;
        }

        // 如果有剩余任务且仍在进行中，继续处理
        if (remainingFolderIdsRef.current.length > 0 &&
            activeFolderPromisesCountRef.current < concurrencyLimit &&
            bulkFolderGenerationRef.current?.inProgress) {
          console.log("[DEBUG] 仍有文件夹任务待处理，启动下一批");
          // 使用setTimeout确保当前执行栈清空后再处理下一个任务
          setTimeout(() => {
            startTasks();
          }, 0);
        }
      }
    };

    // 启动并行处理
    const startTasks = () => {
      // 调试日志: 开始任务处理
      console.log(`[DEBUG] startTasks folder: Running with ${remainingFolderIdsRef.current.length} tasks pending, activePromises: ${activeFolderPromisesCountRef.current}`);

      // 如果不再处理，则结束
      if (!bulkFolderGenerationRef.current?.inProgress) {
        console.log("[DEBUG] 文件夹任务已标记为不再进行，退出处理");
        return;
      }

      // 取出最多 (concurrencyLimit - 当前活跃数量) 个任务进行处理
      const availableSlots = concurrencyLimit - activeFolderPromisesCountRef.current;

      if (availableSlots <= 0) {
        console.log("[DEBUG] 没有可用的并发槽位，等待现有任务完成");
        return;
      }

      // 计算需要处理的任务数量
      const tasksToProcess = Math.min(availableSlots, remainingFolderIdsRef.current.length);
      console.log(`[DEBUG] 准备处理 ${tasksToProcess} 个文件夹任务`);

      if (tasksToProcess <= 0) {
        // 如果没有任务要处理且活跃任务为0，检查是否所有工作完成
        if (activeFolderPromisesCountRef.current === 0) {
          console.log("[DEBUG] 没有更多文件夹任务且活跃任务为0，检查是否所有工作完成");
          if (isAllWorkDone() && bulkFolderGenerationRef.current?.inProgress) {
            console.log("[DEBUG] 所有文件夹任务确认完成，标记为结束状态");
            setBulkFolderGeneration(prev => {
              if (!prev) return null;
              const updatedGeneration = {
                ...prev,
                inProgress: false,
                isCancelled: false,
                currentBookmarkIds: []
              };
              // 同步更新ref
              bulkFolderGenerationRef.current = updatedGeneration;
              // 清理 localStorage
              saveFolderStateToLocalStorage(null);
              return updatedGeneration;
            });
          }
        }
        return;
      }

      // 从剩余任务中取出要处理的任务
      for (let i = 0; i < tasksToProcess; i++) {
        if (remainingFolderIdsRef.current.length === 0) break;

        const bookmarkId = remainingFolderIdsRef.current.shift();
        if (!bookmarkId) continue;

        // 再次确认这个书签没有被处理过
        const status = folderGenerationDetailsRef.current[bookmarkId]?.status;
        if (status === "completed" || status === "failed") {
          console.log(`[DEBUG] 在startTasks中跳过已处理文件夹书签: ${bookmarkId}, 状态: ${status}`);
          // 不增加活跃计数，直接检查下一个
          i--; // 减少计数，确保我们处理足够数量的任务
          continue;
        }

        console.log(`[DEBUG] 启动处理文件夹任务: bookmarkId=${bookmarkId}`);
        // 处理书签，不需要等待它完成
        processBookmark(bookmarkId);
      }
    };

    // 立即开始处理任务
    console.log("[DEBUG] Starting folder task processing");
    startTasks();
  };

  // 取消文件夹生成
  const handleCancelFolderGeneration = () => {
    console.log("[DEBUG] handleCancelFolderGeneration: Canceling folder generation");

    // 重置ref值
    needsFolderRestartRef.current = false;

    // 将状态设置为已取消
    setBulkFolderGeneration(prev => {
      if (!prev) return null

      const updatedGeneration = {
        ...prev,
        inProgress: false,
        isCancelled: true,
        currentBookmarkIds: []
      }

      // 清理 localStorage
      saveFolderStateToLocalStorage(null)

      return updatedGeneration
    })

    // 清空剩余待处理书签
    setRemainingFolderBookmarkIds([])
  }

  // 取消标签生成
  const handleCancelGeneration = () => {
    console.log("[DEBUG] handleCancelGeneration: Canceling tag generation");

    // 重置ref值
    needsRestartRef.current = false;

    // 将状态设置为已取消
    setBulkTagGeneration(prev => {
      if (!prev) return null

      const updatedGeneration = {
        ...prev,
        inProgress: false,
        isCancelled: true,
        currentBookmarkIds: []
      }

      // 清理 localStorage
      saveStateToLocalStorage(null)

      return updatedGeneration
    })

    // 清空剩余待处理书签
    setRemainingBookmarkIds([])
  }

  // 在标签生成任务完成后一段时间自动隐藏状态面板
  // 当任务处理状态变化时监听
  useEffect(() => {
    console.log(`[DEBUG] BulkTagGeneration state changed: inProgress=${bulkTagGeneration?.inProgress}, completed=${bulkTagGeneration?.completed}/${bulkTagGeneration?.total}, isCancelled=${bulkTagGeneration?.isCancelled}`);

    // 同步状态到ref
    if (bulkTagGeneration !== bulkTagGenerationRef.current) {
      bulkTagGenerationRef.current = bulkTagGeneration;
    }

    // 当任务完成时自动隐藏状态面板
    if (bulkTagGeneration &&
        !bulkTagGeneration.inProgress &&
        bulkTagGeneration.completed === bulkTagGeneration.total) {
      const timer = setTimeout(() => {
        // 只有在全部处理完成且不再有失败的情况下，才自动隐藏
        if (bulkTagGeneration.failed === 0) {
          setShowTagGenerationStatus(false)
          setBulkTagGeneration(null)
          bulkTagGenerationRef.current = null

          // 清理 localStorage
          saveStateToLocalStorage(null)
        }
      }, 5000) // 5秒后自动隐藏

      return () => clearTimeout(timer)
    }
  }, [bulkTagGeneration])

  // 在文件夹生成任务完成后一段时间自动隐藏状态面板
  useEffect(() => {
    console.log(`[DEBUG] BulkFolderGeneration state changed: inProgress=${bulkFolderGeneration?.inProgress}, completed=${bulkFolderGeneration?.completed}/${bulkFolderGeneration?.total}, isCancelled=${bulkFolderGeneration?.isCancelled}`);

    // 同步状态到ref
    if (bulkFolderGeneration !== bulkFolderGenerationRef.current) {
      bulkFolderGenerationRef.current = bulkFolderGeneration;
    }

    // 当任务完成时自动隐藏状态面板
    if (bulkFolderGeneration &&
        !bulkFolderGeneration.inProgress &&
        bulkFolderGeneration.completed === bulkFolderGeneration.total) {
      const timer = setTimeout(() => {
        // 只有在全部处理完成且不再有失败的情况下，才自动隐藏
        if (bulkFolderGeneration.failed === 0) {
          setShowFolderGenerationStatus(false)
          setBulkFolderGeneration(null)
          bulkFolderGenerationRef.current = null

          // 清理 localStorage
          saveFolderStateToLocalStorage(null)
        }
      }, 5000) // 5秒后自动隐藏

      return () => clearTimeout(timer)
    }
  }, [bulkFolderGeneration])

  // 添加刷新/关闭前警告
  useEffect(() => {
    // 只在浏览器环境下运行
    if (typeof window === 'undefined') return;

    // 页面刷新/关闭前的处理函数
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // 仅在任务正在进行时显示警告
      if (bulkTagGeneration?.inProgress || bulkFolderGeneration?.inProgress) {
        // 提示消息（大多数现代浏览器只会显示默认消息，忽略自定义消息）
        const message = "Warning: Leaving or refreshing this page will cancel the current AI generation task.";
        event.preventDefault();
        event.returnValue = message;
        return message;
      }
    };

    // 添加事件监听器
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 组件卸载时移除事件监听器
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      needsRestartRef.current = false;
    };
  }, [bulkTagGeneration]);

  // 从 localStorage 恢复任务状态的单独 useEffect
  useEffect(() => {
    // 确保只在浏览器环境中运行
    if (typeof window === 'undefined') return;

    try {
      // 检查 localStorage 中是否有未完成的任务数据
      const storedGeneration = localStorage.getItem(STORAGE_KEYS.BULK_GENERATION)
      if (storedGeneration) {
        const parsedGeneration = JSON.parse(storedGeneration) as BulkTagGeneration

        // 如果存储的任务已经完成或太旧（超过12小时），则清理并不恢复
        const isTaskTooOld = parsedGeneration.timestamp &&
                            (Date.now() - parsedGeneration.timestamp > 12 * 60 * 60 * 1000)

        if (!parsedGeneration.inProgress || isTaskTooOld) {
          saveStateToLocalStorage(null)
          return
        }

        // 获取详细状态信息，用于日志记录
        const storedDetails = localStorage.getItem(STORAGE_KEYS.TAG_DETAILS)
        const storedRemainingIds = localStorage.getItem(STORAGE_KEYS.REMAINING_IDS)

        console.log("检测到页面刷新时有未完成任务，标记为已取消")

        // 创建新的状态对象，标记为已取消
        const newGeneration = {
          ...parsedGeneration,
          inProgress: false,
          isCancelled: true,
          currentBookmarkIds: []
        }

        // 设置已取消状态
        setBulkTagGeneration(newGeneration)
        bulkTagGenerationRef.current = newGeneration

        // 恢复其他引用状态
        if (storedDetails) {
          try {
            const parsedDetails = JSON.parse(storedDetails);
            tagGenerationDetailsRef.current = parsedDetails;
          } catch (e) {
            console.error("解析存储的任务详情失败:", e);
          }
        }

        // 显示状态面板
        setShowTagGenerationStatus(true)

        // 清理localStorage中的任务状态
        saveStateToLocalStorage(null)
      }
    } catch (error) {
      console.error("Failed to restore task state:", error)
      // 出错时清理存储，避免未来继续出错
      saveStateToLocalStorage(null)
    }
  }, [router])

  // 移除 handleRefreshFavicons 函数，不再需要

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diffTime = Math.abs(now.getTime() - date.getTime())
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

      if (diffDays === 0) {
        return "Today"
      } else if (diffDays === 1) {
        return "Yesterday"
      } else if (diffDays < 7) {
        return `${diffDays} days ago`
      } else {
        return date.toLocaleDateString()
      }
    } catch (e) {
      return "Unknown date"
    }
  }

  // Highlight search matches
  const highlightText = (text: string, query: string): ReactNode => {
    if (!query || !text) return text || ""

    try {
      const regex = new RegExp(`(${query})`, "gi")
      const parts = text.split(regex)

      return (
        <>
          {parts.map((part, i) =>
            regex.test(part) ? (
              <mark key={i} className="bg-yellow-200">
                {part}
              </mark>
            ) : (
              part
            ),
          )}
        </>
      )
    } catch (e) {
      // If regex fails (e.g., with special characters), return the original text
      return text
    }
  }

  // 使用React.memo优化BookmarkItem组件
  const BookmarkItem = React.memo(({
    bookmark,
    index,
    style,
  }: { bookmark: ExtendedBookmark; index: number; style: React.CSSProperties }) => {
    if (!bookmark) return null

    const folderName = getFolderName(bookmark.folderId)
    const isFavorite = bookmark.isFavorite
    const isSelected = selectedBookmarks.includes(bookmark.id)

    // 移除外层容器的固定高度，让内容决定高度
    return (
      <div
        style={{
          ...style,
          height: "auto", // 让内容决定高度
          padding: "4px 0", // 减少上下内边距
        }}
        className={`${index % 2 === 0 ? "bg-gray-50 dark:bg-gray-800" : ""}`}
      >
        <div
          className={`flex items-start justify-between p-3 pb-2 border border-gray-100 rounded-lg hover:bg-gray-50 transition-all duration-200 bookmark-item hover:shadow-sm ${
            isSelected ? "bg-blue-50 border-blue-200" : ""
          }`}
        >
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            {bulkMode && (
              <Checkbox checked={isSelected} onChange={() => toggleBookmarkSelection(bookmark.id)} className="mt-1 flex-shrink-0" />
            )}
            <div className="w-8 h-8 flex-shrink-0 bg-gray-100 rounded-md flex items-center justify-center overflow-hidden transition-all duration-200 hover:shadow-inner">
              {/* 简化为始终使用标题首字母作为图标 */}
              <div className="w-6 h-6 bg-blue-500 rounded-sm flex items-center justify-center text-white font-bold transition-transform duration-200 hover:scale-110">
                {bookmark.title?.charAt(0)?.toUpperCase() || "B"}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <a
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg font-medium text-gray-800 hover:text-blue-600 transition-colors duration-200 flex items-center"
              >
                <div className="truncate max-w-full">
                  {highlightText(bookmark.title || "", searchQuery)}
                </div>
                <IconExternalLink
                  size={16}
                  className="ml-1 text-gray-400 transition-transform duration-200 hover:translate-x-1 flex-shrink-0"
                />
              </a>

              <Text size="sm" className="text-gray-500 mt-1 truncate max-w-md">
                {highlightText(bookmark.url || "", searchQuery)}
              </Text>

              <div className="flex flex-wrap gap-2 mt-1">
                <Tooltip label="Added date" withArrow>
                  <Badge size="xs" color="gray" variant="outline" leftSection={<IconClock size={10} />}>
                    {formatDate(bookmark.createdAt)}
                  </Badge>
                </Tooltip>

                {folderName && (
                  <Tooltip label="Click to filter by this folder" withArrow>
                    <Badge
                      size="xs"
                      color="blue"
                      variant="outline"
                      leftSection={<IconFolder size={10} />}
                      className="cursor-pointer transition-all duration-200 hover:bg-blue-50 filter-badge"
                      onClick={(e) => handleFolderClick(bookmark.folderId, e)}
                    >
                      {folderName}
                    </Badge>
                  </Tooltip>
                )}

                {Array.isArray(bookmark.tags) &&
                  bookmark.tags.length > 0 &&
                  bookmark.tags.map((tag: string) => (
                    <Tooltip key={tag} label="Click to filter by this tag" withArrow>
                      <Badge
                        size="xs"
                        color="green"
                        variant="light"
                        leftSection={<IconTag size={10} />}
                        className="cursor-pointer transition-all duration-200 hover:bg-green-50 filter-badge"
                        onClick={(e) => handleTagClick(tag, e)}
                      >
                        {highlightText(tag, searchQuery)}
                      </Badge>
                    </Tooltip>
                  ))}
              </div>
            </div>
          </div>

          {!bulkMode && (
            <div className="flex space-x-1">
              <Tooltip label={isFavorite ? "Remove from favorites" : "Add to favorites"} withArrow>
                <ActionIcon
                  variant="subtle"
                  color={isFavorite ? "yellow" : "gray"}
                  className="transition-all duration-200 hover:bg-yellow-50"
                  onClick={(e) => handleToggleFavorite(bookmark.id, e)}
                >
                  {isFavorite ? <IconStarFilled size={18} /> : <IconStar size={18} />}
                </ActionIcon>
              </Tooltip>
              <ActionIcon
                variant="subtle"
                className="transition-all duration-200 hover:bg-blue-50"
                onClick={() => setEditingBookmark(bookmark)}
              >
                <IconPencil size={18} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                className="transition-all duration-200 hover:bg-red-50"
                onClick={(e) => handleDeleteBookmark(bookmark.id, e)}
              >
                <IconTrash size={18} />
              </ActionIcon>
            </div>
          )}
        </div>
      </div>
    )
  }, (prevProps, nextProps) => {
    // 优化重新渲染逻辑，只有在这些属性改变时才重新渲染
    return (
      prevProps.bookmark.id === nextProps.bookmark.id &&
      prevProps.bookmark.title === nextProps.bookmark.title &&
      prevProps.bookmark.url === nextProps.bookmark.url &&
      prevProps.bookmark.isFavorite === nextProps.bookmark.isFavorite &&
      prevProps.bookmark.folderId === nextProps.bookmark.folderId &&
      prevProps.style === nextProps.style &&
      selectedBookmarks.includes(prevProps.bookmark.id) ===
      selectedBookmarks.includes(nextProps.bookmark.id)
    );
  });

  // 创建虚拟列表的记忆化组件
  const MemoizedVirtualList = React.memo(({ bookmarks }: { bookmarks: ExtendedBookmark[] }) => {
    // 根据标签数量动态调整高度，但设置最小高度
    const getItemSize = (index: number) => {
      const bookmark = bookmarks[index];
      // 基础高度 + 根据标签数量调整高度
      const tagsCount = bookmark?.tags?.length || 0;
      // 如果有标签，给予更多空间；如果没有标签，使用较小的高度
      return tagsCount > 0 ? 110 : 90;
    };

    // 为虚拟列表组件定义类型
    interface ListChildComponentProps {
      index: number;
      style: React.CSSProperties;
    }

    // 使用变量渲染列表，减少嵌套组件数量
    return (
      // @ts-ignore - 忽略类型检查，因为我们无法安装类型声明包
      <AutoSizer>
        {({ height, width }: { height: number; width: number }) => (
          // @ts-ignore - 忽略类型检查，因为我们无法安装类型声明包
          <List
            className="bookmark-list"
            height={height}
            width={width}
            itemCount={bookmarks.length}
            // 使用动态计算的高度，VariableSizeList支持函数形式的itemSize
            itemSize={getItemSize}
            // 适当增加overscanCount以提高滚动体验
            overscanCount={5}
          >
            {({ index, style }: ListChildComponentProps) => (
              <BookmarkItem
                bookmark={bookmarks[index]}
                index={index}
                style={style}
              />
            )}
          </List>
        )}
      </AutoSizer>
    );
  }, (prevProps, nextProps) => {
    // 只在书签列表长度变化或书签ID列表变化时才重新渲染
    if (prevProps.bookmarks.length !== nextProps.bookmarks.length) {
      return false;
    }

    // 检查ID是否变化（简化比较逻辑，只比较ID，减少深度比较导致的性能问题）
    const prevIds = prevProps.bookmarks.map(b => b.id).join(',');
    const nextIds = nextProps.bookmarks.map(b => b.id).join(',');
    return prevIds === nextIds;
  });

  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return (
      <div className="text-center py-10 fade-in">
        <Text size="lg" className="text-gray-500">
          No bookmarks found
        </Text>
        <Text size="sm" className="text-gray-400 mt-2">
          Add some bookmarks or adjust your filters
        </Text>
      </div>
    )
  }

  // 文件夹生成状态按钮组件
  const FolderGenerationStatusButton = () => {
    if (!bulkFolderGeneration) return null;

    const { total, completed, failed, inProgress } = bulkFolderGeneration;
    const successCount = completed - failed;
    const progress = total > 0 ? (completed / total) * 100 : 0;

    // 确定按钮颜色
    let color = "blue";
    if (completed === total) {
      color = failed > 0 ? "yellow" : "green";
    }

    return (
      <Button
        size="xs"
        color={color}
        variant="light"
        leftSection={
          inProgress ? (
            <IconLoader2 size={16} className="animate-spin" />
          ) : failed > 0 ? (
            <IconCircleXFilled size={16} />
          ) : (
            <IconCircleCheckFilled size={16} />
          )
        }
        onClick={() => setShowFolderGenerationStatus(true)}
      >
        AI Folder Suggestion: {completed}/{total} completed
        {failed > 0 && ` (${failed} failed)`}
      </Button>
    );
  };

  // 详细的文件夹生成状态抽屉组件
  const FolderGenerationStatusDrawer = () => {
    if (!bulkFolderGeneration) return null;

    const { total, completed, failed, inProgress, isCancelled } = bulkFolderGeneration;
    const successCount = completed - failed;

    // 获取各种状态的书签
    const waitingBookmarks = Object.entries(folderGenerationDetails)
      .filter(([_, status]) => status.status === "waiting")
      .map(([id]) => bookmarks.find(b => b.id === id))
      .filter(Boolean);

    // 获取当前正在处理的书签
    const processingBookmarks = bulkFolderGeneration.currentBookmarkIds && bulkFolderGeneration.currentBookmarkIds.length > 0 ?
      bulkFolderGeneration.currentBookmarkIds.map(id => bookmarks.find(b => b.id === id)).filter(Boolean) : [];

    const successBookmarks = Object.entries(folderGenerationDetails)
      .filter(([_, status]) => status.status === "completed")
      .map(([id]) => ({
        bookmark: bookmarks.find(b => b.id === id),
        folder: folderGenerationDetails[id].suggestedFolder || ""
      }))
      .filter(item => item.bookmark);

    const failedBookmarks = Object.entries(folderGenerationDetails)
      .filter(([_, status]) => status.status === "failed")
      .map(([id]) => ({
        bookmark: bookmarks.find(b => b.id === id),
        error: folderGenerationDetails[id].errorMessage || "Unknown error"
      }))
      .filter(item => item.bookmark);

    return (
      <Drawer
        opened={showFolderGenerationStatus}
        onClose={() => setShowFolderGenerationStatus(false)}
        title="AI Folder Suggestion Status"
        position="right"
        size="md"
      >
        <div className="space-y-6">
          {/* 总体进度 */}
          <div>
            <div className="flex justify-between mb-2">
              <Text size="sm" fw={500}>Overall Progress: {completed}/{total}</Text>
              <Text size="sm" color={inProgress ? "blue" : (isCancelled ? "red" : (failed > 0 ? "orange" : "green"))}>
                {inProgress ? `Processing (${bulkFolderGeneration.concurrencyLimit || getConcurrencyLimit()} concurrent)...` :
                  (isCancelled ? "Canceled" : "Completed")}
              </Text>
            </div>
            <Progress
              value={(completed / total) * 100}
              color={failed > 0 ? "orange" : (isCancelled ? "red" : "green")}
              striped={inProgress}
              animated={inProgress}
            />
            <div className="mt-2 flex justify-between text-xs text-gray-500">
              <span>Succeeded: {successCount}</span>
              <span>Failed: {failed}</span>
              <span>Pending: {total - completed}</span>
            </div>

            {/* 警告提示文本 */}
            {inProgress && (
              <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                <div className="flex items-start">
                  <IconInfoCircle size={18} className="text-yellow-500 mt-0.5 mr-2 flex-shrink-0" />
                  <Text size="sm" color="dimmed">
                    Warning: Please do not refresh or close this page while tasks are in progress, as it will cancel the current operation.
                  </Text>
                </div>
              </div>
            )}

            {/* 控制按钮 */}
            <div className="mt-4 flex justify-end space-x-2">
              {inProgress && (
                <Button size="xs" color="red" onClick={handleCancelFolderGeneration}>
                  Cancel
                </Button>
              )}
            </div>
          </div>

          {/* 当前处理中的书签 */}
          {processingBookmarks.length > 0 && (
            <div className="border-l-4 border-blue-500 pl-3 py-2">
              <Text size="sm" fw={500}>Processing ({processingBookmarks.length}):</Text>
              <div className="mt-1 max-h-36 overflow-y-auto">
                {processingBookmarks.map(bookmark => bookmark && (
                  <div key={bookmark.id} className="bg-blue-50 p-2 rounded mb-2">
                    <Text size="sm">{bookmark.title}</Text>
                    <Text size="xs" color="dimmed" className="truncate">{bookmark.url}</Text>
                    <div className="mt-2">
                      <Progress
                        value={50}
                        color="blue"
                        striped
                        animated
                        size="xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 成功的书签 */}
          {successBookmarks.length > 0 && (
            <div className="border-l-4 border-green-500 pl-3 py-2">
              <Text size="sm" fw={500}>Succeeded ({successBookmarks.length}):</Text>
              <div className="mt-1 max-h-36 overflow-y-auto">
                {successBookmarks.map(({bookmark, folder}) => (
                  <div key={bookmark?.id} className="bg-green-50 p-2 rounded mb-2">
                    <Text size="sm">{bookmark?.title}</Text>
                    <Text size="xs" color="dimmed" className="truncate">{bookmark?.url}</Text>
                    <Text size="xs" className="mt-1" component="div">
                      <Badge size="xs" variant="light" color="blue" leftSection={<IconFolder size={12} />}>
                        {folder}
                      </Badge>
                    </Text>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 失败的书签 */}
          {failedBookmarks.length > 0 && (
            <div className="border-l-4 border-red-500 pl-3 py-2">
              <Text size="sm" fw={500}>Failed ({failedBookmarks.length}):</Text>
              <div className="mt-1 max-h-36 overflow-y-auto">
                {failedBookmarks.map(({bookmark, error}) => (
                  <div key={bookmark?.id} className="bg-red-50 p-2 rounded mb-2">
                    <Text size="sm">{bookmark?.title}</Text>
                    <Text size="xs" color="dimmed" className="truncate">{bookmark?.url}</Text>
                    <Text size="xs" color="red" className="mt-1">{error}</Text>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 等待中的书签 */}
          {waitingBookmarks.length > 0 && (
            <div className="border-l-4 border-gray-300 pl-3 py-2">
              <Text size="sm" fw={500}>Pending ({waitingBookmarks.length}):</Text>
              <div className="mt-1 max-h-36 overflow-y-auto">
                {waitingBookmarks.map(bookmark => bookmark && (
                  <div key={bookmark.id} className="bg-gray-50 p-2 rounded mb-2">
                    <Text size="sm">{bookmark.title}</Text>
                    <Text size="xs" color="dimmed" className="truncate">{bookmark.url}</Text>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Drawer>
    );
  };

  // 标签生成状态按钮组件
  const TagGenerationStatusButton = () => {
    if (!bulkTagGeneration) return null;

    const { total, completed, failed, inProgress } = bulkTagGeneration;
    const successCount = completed - failed;
    const progress = total > 0 ? (completed / total) * 100 : 0;

    // 确定按钮颜色
    let color = "blue";
    if (completed === total) {
      color = failed > 0 ? "yellow" : "green";
    }

    return (
      <Button
        size="xs"
        color={color}
        variant="light"
        leftSection={
          inProgress ? (
            <IconLoader2 size={16} className="animate-spin" />
          ) : failed > 0 ? (
            <IconCircleXFilled size={16} />
          ) : (
            <IconCircleCheckFilled size={16} />
          )
        }
        onClick={() => setShowTagGenerationStatus(true)}
      >
        AI Tag Generation: {completed}/{total} completed
        {failed > 0 && ` (${failed} failed)`}
      </Button>
    );
  };

  // 详细的标签生成状态抽屉组件
  const TagGenerationStatusDrawer = () => {
    if (!bulkTagGeneration) return null;

    const { total, completed, failed, inProgress, isCancelled } = bulkTagGeneration;
    const successCount = completed - failed;

    // 获取各种状态的书签
    const waitingBookmarks = Object.entries(tagGenerationDetails)
      .filter(([_, status]) => status.status === "waiting")
      .map(([id]) => bookmarks.find(b => b.id === id))
      .filter(Boolean);

    // 获取当前正在处理的书签
    const processingBookmarks = bulkTagGeneration.currentBookmarkIds && bulkTagGeneration.currentBookmarkIds.length > 0 ?
      bulkTagGeneration.currentBookmarkIds.map(id => bookmarks.find(b => b.id === id)).filter(Boolean) : [];

    const successBookmarks = Object.entries(tagGenerationDetails)
      .filter(([_, status]) => status.status === "completed")
      .map(([id]) => ({
        bookmark: bookmarks.find(b => b.id === id),
        tags: tagGenerationDetails[id].tags || []
      }))
      .filter(item => item.bookmark);

    const failedBookmarks = Object.entries(tagGenerationDetails)
      .filter(([_, status]) => status.status === "failed")
      .map(([id]) => ({
        bookmark: bookmarks.find(b => b.id === id),
        error: tagGenerationDetails[id].errorMessage || "Unknown error"
      }))
      .filter(item => item.bookmark);

    return (
      <Drawer
        opened={showTagGenerationStatus}
        onClose={() => setShowTagGenerationStatus(false)}
        title="AI Tag Generation Status"
        position="right"
        size="md"
      >
        <div className="space-y-6">
          {/* 总体进度 */}
          <div>
            <div className="flex justify-between mb-2">
              <Text size="sm" fw={500}>Overall Progress: {completed}/{total}</Text>
              <Text size="sm" color={inProgress ? "blue" : (isCancelled ? "red" : (failed > 0 ? "orange" : "green"))}>
                {inProgress ? `Processing (${bulkTagGeneration.concurrencyLimit || getConcurrencyLimit()} concurrent)...` :
                  (isCancelled ? "Canceled" : "Completed")}
              </Text>
            </div>
            <Progress
              value={(completed / total) * 100}
              color={failed > 0 ? "orange" : (isCancelled ? "red" : "green")}
              striped={inProgress}
              animated={inProgress}
            />
            <div className="mt-2 flex justify-between text-xs text-gray-500">
              <span>Succeeded: {successCount}</span>
              <span>Failed: {failed}</span>
              <span>Pending: {total - completed}</span>
            </div>

            {/* 警告提示文本 */}
            {inProgress && (
              <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                <div className="flex items-start">
                  <IconInfoCircle size={18} className="text-yellow-500 mt-0.5 mr-2 flex-shrink-0" />
                  <Text size="sm" color="dimmed">
                    Warning: Please do not refresh or close this page while tasks are in progress, as it will cancel the current operation.
                  </Text>
                </div>
              </div>
            )}

            {/* 控制按钮 */}
            <div className="mt-4 flex justify-end space-x-2">
              {inProgress && (
                <Button size="xs" color="red" onClick={handleCancelGeneration}>
                  Cancel
                </Button>
              )}
            </div>
          </div>

          {/* 当前处理中的书签 */}
          {processingBookmarks.length > 0 && (
            <div className="border-l-4 border-blue-500 pl-3 py-2">
              <Text size="sm" fw={500}>Processing ({processingBookmarks.length}):</Text>
              <div className="mt-1 max-h-36 overflow-y-auto">
                {processingBookmarks.map(bookmark => bookmark && (
                  <div key={bookmark.id} className="bg-blue-50 p-2 rounded mb-2">
                    <Text size="sm">{bookmark.title}</Text>
                    <Text size="xs" color="dimmed" className="truncate">{bookmark.url}</Text>
                    <div className="mt-2">
                      <Progress
                        value={50}
                        color="blue"
                        striped
                        animated
                        size="xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 成功的书签 */}
          {successBookmarks.length > 0 && (
            <div className="border-l-4 border-green-500 pl-3 py-2">
              <Text size="sm" fw={500}>Succeeded ({successBookmarks.length}):</Text>
              <div className="mt-1 max-h-36 overflow-y-auto">
                {successBookmarks.map(({bookmark, tags}) => (
                  <div key={bookmark?.id} className="bg-green-50 p-2 rounded mb-2">
                    <Text size="sm">{bookmark?.title}</Text>
                    <Text size="xs" color="dimmed" className="truncate">{bookmark?.url}</Text>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tags.map(tag => (
                        <Badge key={tag} size="xs" variant="light" color="green" leftSection={<IconTag size={12} />}>
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 失败的书签 */}
          {failedBookmarks.length > 0 && (
            <div className="border-l-4 border-red-500 pl-3 py-2">
              <Text size="sm" fw={500}>Failed ({failedBookmarks.length}):</Text>
              <div className="mt-1 max-h-36 overflow-y-auto">
                {failedBookmarks.map(({bookmark, error}) => (
                  <div key={bookmark?.id} className="bg-red-50 p-2 rounded mb-2">
                    <Text size="sm">{bookmark?.title}</Text>
                    <Text size="xs" color="dimmed" className="truncate">{bookmark?.url}</Text>
                    <Text size="xs" color="red" className="mt-1">{error}</Text>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 等待中的书签 */}
          {waitingBookmarks.length > 0 && (
            <div className="border-l-4 border-gray-300 pl-3 py-2">
              <Text size="sm" fw={500}>Pending ({waitingBookmarks.length}):</Text>
              <div className="mt-1 max-h-36 overflow-y-auto">
                {waitingBookmarks.map(bookmark => bookmark && (
                  <div key={bookmark.id} className="bg-gray-50 p-2 rounded mb-2">
                    <Text size="sm">{bookmark.title}</Text>
                    <Text size="xs" color="dimmed" className="truncate">{bookmark.url}</Text>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Drawer>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center space-x-2">
          {bulkTagGeneration && <TagGenerationStatusButton />}
          {bulkFolderGeneration && <FolderGenerationStatusButton />}
          {bulkMode && (
            <Text size="sm" className="text-gray-500">
              {selectedBookmarks.length} of {bookmarks.length} selected
            </Text>
          )}
        </div>
        <Group gap="xs">
          {bulkMode ? (
            <>
              <Button size="xs" variant="outline" onClick={toggleAllBookmarks} leftSection={<IconCheck size={14} />}>
                {selectedBookmarks.length === bookmarks.length ? "Deselect All" : "Select All"}
              </Button>

              <Button
                size="xs"
                color={showBulkActions ? "blue" : "gray"}
                variant={showBulkActions ? "filled" : "light"}
                onClick={() => setShowBulkActions(!showBulkActions)}
                disabled={selectedBookmarks.length === 0}
              >
                Actions
              </Button>

              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  setBulkMode(false)
                  setSelectedBookmarks([])
                  setShowBulkActions(false)
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="xs" variant="light" onClick={() => setBulkMode(true)}>
                Bulk Edit
              </Button>
              {Array.isArray(sortOptions) && sortOptions.length > 0 && setCurrentSortOption && (
                <Select
                  size="xs"
                  data={sortOptions}
                  value={currentSortOption}
                  onChange={(value) => setCurrentSortOption(value || "newest")}
                  leftSection={<IconSortAscending size={14} />}
                  placeholder="Sort by"
                />
              )}
            </>
          )}
        </Group>
      </div>

      {showBulkActions && selectedBookmarks.length > 0 && (
        <div className="mb-4 p-3 border border-gray-200 rounded-md bg-gray-50 slide-in">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium text-sm">Bulk Actions</span>
            <ActionIcon size="sm" onClick={() => setShowBulkActions(false)}>
              <IconX size={16} />
            </ActionIcon>
          </div>
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconSparkles size={14} />}
              onClick={handleBulkGenerateTags}
            >
              Generate Tags (AI)
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconFolder size={14} />}
              onClick={handleBulkSuggestFolders}
            >
              Suggest Folder (AI)
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconStarFilled size={14} />}
              onClick={() => handleBulkFavorite(true)}
            >
              Add to Favorites
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconStar size={14} />}
              onClick={() => handleBulkFavorite(false)}
            >
              Remove from Favorites
            </Button>
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={handleBulkDelete}
            >
              Delete Selected
            </Button>
          </Group>
        </div>
      )}

      <div className="h-[calc(100vh-300px)] w-full">
        {/* 使用React.memo优化组件渲染 */}
        <MemoizedVirtualList bookmarks={bookmarks} />
      </div>

      {editingBookmark && (
        <EditBookmarkModal
          bookmark={editingBookmark}
          isOpen={!!editingBookmark}
          onClose={() => setEditingBookmark(null)}
        />
      )}

      <TagGenerationStatusDrawer />
      <FolderGenerationStatusDrawer />
    </div>
  )
}
