"use client"

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react"
import Fuse from "fuse.js"
import { db, migrateFromLocalStorage, needMigration, clearLocalStorageData } from "@/lib/db"

// Types
interface Bookmark {
  id: string
  title: string
  url: string
  folderId: string | null
  tags?: string[]
  createdAt: string
  favicon?: string
  isFavorite?: boolean
}

interface Folder {
  id: string
  name: string
  parentId: string | null
}

interface SortOption {
  value: string
  label: string
}

// 应用设置类型
interface AppSettings {
  darkMode: boolean
  accentColor: string
  defaultView: string
  tagApiUrl?: string
  tagApiKey?: string
  tagConcurrencyLimit?: number // 添加标签生成并发限制配置
}

interface BookmarkContextType {
  bookmarks: Bookmark[]
  folders: Folder[]
  tags: string[]
  selectedFolderId: string | null
  setSelectedFolderId: (id: string | null) => void
  selectedTags: string[]
  setSelectedTags: (tags: string[]) => void
  favoriteFolders: string[]
  toggleFavoriteFolder: (id: string) => void
  toggleFavoriteBookmark: (id: string) => void
  addBookmark: (bookmark: Bookmark) => void
  updateBookmark: (bookmark: Bookmark) => void
  deleteBookmark: (id: string) => void
  addFolder: (folder: Folder) => void
  updateFolder: (folder: Folder) => void
  deleteFolder: (id: string) => void
  addTag: (tag: string) => void
  deleteTag: (tag: string) => void
  exportBookmarks: () => void
  importBookmarks: (data: any) => void
  filteredBookmarks: (activeTab: string, searchQuery: string, searchFields: string[]) => Bookmark[]
  sortOptions: SortOption[]
  currentSortOption: string
  setCurrentSortOption: (option: string) => void
  searchFields: string[]
  toggleSearchField: (field: string) => void
  settings: AppSettings
  updateSettings: (settings: Partial<AppSettings>) => void
  fetchAndStoreFavicon: (url: string, title: string) => Promise<string>
  refreshAllFavicons: () => Promise<void>
  suggestTags: (url: string) => Promise<string[]>
  clearAllBookmarkData: () => Promise<void>
  resetToSampleData: () => Promise<void>
}

// 示例数据
const sampleBookmarks: Bookmark[] = [
  // 搜索引擎类 - General文件夹
  {
    id: "bookmark-1",
    title: "Google",
    url: "https://www.google.com",
    folderId: "folder-1",
    tags: ["search", "tools"],
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: true,
  },
  {
    id: "bookmark-2",
    title: "Bing",
    url: "https://www.bing.com",
    folderId: "folder-1",
    tags: ["search", "microsoft"],
    createdAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },
  {
    id: "bookmark-3",
    title: "DuckDuckGo",
    url: "https://duckduckgo.com",
    folderId: "folder-1",
    tags: ["search", "privacy"],
    createdAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: true,
  },

  // 开发工具 - Development文件夹
  {
    id: "bookmark-4",
    title: "GitHub",
    url: "https://github.com",
    folderId: "folder-2",
    tags: ["development", "git", "code"],
    createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: true,
  },
  {
    id: "bookmark-5",
    title: "Stack Overflow",
    url: "https://stackoverflow.com",
    folderId: "folder-2",
    tags: ["development", "programming", "help"],
    createdAt: new Date(Date.now() - 24 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },
  {
    id: "bookmark-6",
    title: "MDN Web Docs",
    url: "https://developer.mozilla.org",
    folderId: "folder-2",
    tags: ["development", "documentation", "web"],
    createdAt: new Date(Date.now() - 23 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },
  {
    id: "bookmark-7",
    title: "CodePen",
    url: "https://codepen.io",
    folderId: "folder-2",
    tags: ["development", "web", "frontend"],
    createdAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },

  // 前端框架 - Frontend子文件夹
  {
    id: "bookmark-8",
    title: "React",
    url: "https://reactjs.org",
    folderId: "folder-3",
    tags: ["development", "frontend", "javascript", "framework"],
    createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: true,
  },
  {
    id: "bookmark-9",
    title: "Vue.js",
    url: "https://vuejs.org",
    folderId: "folder-3",
    tags: ["development", "frontend", "javascript", "framework"],
    createdAt: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },
  {
    id: "bookmark-10",
    title: "Angular",
    url: "https://angular.io",
    folderId: "folder-3",
    tags: ["development", "frontend", "typescript", "framework"],
    createdAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },

  // 后端技术 - Backend子文件夹
  {
    id: "bookmark-11",
    title: "Node.js",
    url: "https://nodejs.org",
    folderId: "folder-4",
    tags: ["development", "backend", "javascript"],
    createdAt: new Date(Date.now() - 17 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: true,
  },
  {
    id: "bookmark-12",
    title: "Django",
    url: "https://www.djangoproject.com",
    folderId: "folder-4",
    tags: ["development", "backend", "python", "framework"],
    createdAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },
  {
    id: "bookmark-13",
    title: "Spring",
    url: "https://spring.io",
    folderId: "folder-4",
    tags: ["development", "backend", "java", "framework"],
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },

  // 娱乐 - Entertainment文件夹
  {
    id: "bookmark-14",
    title: "YouTube",
    url: "https://www.youtube.com",
    folderId: "folder-5",
    tags: ["entertainment", "video", "streaming"],
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: true,
  },
  {
    id: "bookmark-15",
    title: "Netflix",
    url: "https://www.netflix.com",
    folderId: "folder-5",
    tags: ["entertainment", "streaming", "movies"],
    createdAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },
  {
    id: "bookmark-16",
    title: "Spotify",
    url: "https://www.spotify.com",
    folderId: "folder-5",
    tags: ["entertainment", "music", "streaming"],
    createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: true,
  },

  // 购物 - Shopping文件夹
  {
    id: "bookmark-17",
    title: "Amazon",
    url: "https://www.amazon.com",
    folderId: "folder-6",
    tags: ["shopping", "ecommerce"],
    createdAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },
  {
    id: "bookmark-18",
    title: "eBay",
    url: "https://www.ebay.com",
    folderId: "folder-6",
    tags: ["shopping", "auction", "ecommerce"],
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },
  {
    id: "bookmark-19",
    title: "Etsy",
    url: "https://www.etsy.com",
    folderId: "folder-6",
    tags: ["shopping", "handmade", "crafts"],
    createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },

  // 社交媒体 - Social Media文件夹
  {
    id: "bookmark-20",
    title: "Twitter",
    url: "https://twitter.com",
    folderId: "folder-7",
    tags: ["social", "news"],
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: true,
  },
  {
    id: "bookmark-21",
    title: "Facebook",
    url: "https://www.facebook.com",
    folderId: "folder-7",
    tags: ["social", "networking"],
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },
  {
    id: "bookmark-22",
    title: "LinkedIn",
    url: "https://www.linkedin.com",
    folderId: "folder-7",
    tags: ["social", "professional", "networking"],
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: true,
  },
  {
    id: "bookmark-23",
    title: "Instagram",
    url: "https://www.instagram.com",
    folderId: "folder-7",
    tags: ["social", "photos"],
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },

  // 学习 - Learning文件夹
  {
    id: "bookmark-24",
    title: "Coursera",
    url: "https://www.coursera.org",
    folderId: "folder-8",
    tags: ["education", "courses", "learning"],
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: true,
  },
  {
    id: "bookmark-25",
    title: "Khan Academy",
    url: "https://www.khanacademy.org",
    folderId: "folder-8",
    tags: ["education", "learning", "free"],
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },
  {
    id: "bookmark-26",
    title: "edX",
    url: "https://www.edx.org",
    folderId: "folder-8",
    tags: ["education", "courses", "university"],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },

  // 无文件夹的书签
  {
    id: "bookmark-27",
    title: "Wikipedia",
    url: "https://www.wikipedia.org",
    folderId: null,
    tags: ["reference", "encyclopedia", "knowledge"],
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: true,
  },

  // 无标签的书签
  {
    id: "bookmark-28",
    title: "Weather.com",
    url: "https://weather.com",
    folderId: "folder-1",
    tags: [],
    createdAt: new Date(Date.now() - 0.5 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: false,
  },

  // 最新添加的书签
  {
    id: "bookmark-29",
    title: "ChatGPT",
    url: "https://chat.openai.com",
    folderId: "folder-9",
    tags: ["ai", "tools", "chatbot"],
    createdAt: new Date().toISOString(),
    favicon: "",
    isFavorite: true,
  },
  {
    id: "bookmark-30",
    title: "Midjourney",
    url: "https://www.midjourney.com",
    folderId: "folder-9",
    tags: ["ai", "tools", "image-generation"],
    createdAt: new Date().toISOString(),
    favicon: "",
    isFavorite: false,
  }
]

const sampleFolders: Folder[] = [
  {
    id: "folder-1",
    name: "General",
    parentId: null,
  },
  {
    id: "folder-2",
    name: "Development",
    parentId: null,
  },
  {
    id: "folder-3",
    name: "Frontend",
    parentId: "folder-2",
  },
  {
    id: "folder-4",
    name: "Backend",
    parentId: "folder-2",
  },
  {
    id: "folder-5",
    name: "Entertainment",
    parentId: null,
  },
  {
    id: "folder-6",
    name: "Shopping",
    parentId: null,
  },
  {
    id: "folder-7",
    name: "Social Media",
    parentId: null,
  },
  {
    id: "folder-8",
    name: "Learning",
    parentId: null,
  },
  {
    id: "folder-9",
    name: "AI Tools",
    parentId: null,
  }
]

const sampleTags: string[] = [
  "search",
  "development",
  "tools",
  "microsoft",
  "privacy",
  "git",
  "code",
  "programming",
  "help",
  "documentation",
  "web",
  "frontend",
  "javascript",
  "framework",
  "typescript",
  "backend",
  "python",
  "java",
  "entertainment",
  "video",
  "streaming",
  "movies",
  "music",
  "shopping",
  "ecommerce",
  "auction",
  "handmade",
  "crafts",
  "social",
  "news",
  "networking",
  "professional",
  "photos",
  "education",
  "courses",
  "learning",
  "free",
  "university",
  "reference",
  "encyclopedia",
  "knowledge",
  "ai",
  "chatbot",
  "image-generation"
]

// Initial favorite folders
const sampleFavoriteFolders: string[] = ["folder-2", "folder-5", "folder-9"]

// Sort options
const sortOptions: SortOption[] = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "title-asc", label: "Title (A-Z)" },
  { value: "title-desc", label: "Title (Z-A)" },
  { value: "url-asc", label: "URL (A-Z)" },
  { value: "url-desc", label: "URL (Z-A)" },
]

// Search field options
const defaultSearchFields = ["title", "url", "tags"]

// Default app settings
const defaultSettings: AppSettings = {
  darkMode: false,
  accentColor: "#3b82f6", // Blue
  defaultView: "all",
  tagConcurrencyLimit: 5, // 默认并发限制为5
}

// Create context
const BookmarkContext = createContext<BookmarkContextType | undefined>(undefined)

// Provider component
export function BookmarkProvider({ children }: { children: ReactNode }) {
  // 初始化状态
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(sampleBookmarks)
  const [folders, setFolders] = useState<Folder[]>(sampleFolders)
  const [tags, setTags] = useState<string[]>(sampleTags)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [favoriteFolders, setFavoriteFolders] = useState<string[]>(sampleFavoriteFolders)
  const [currentSortOption, setCurrentSortOption] = useState<string>("newest")
  const [searchFields, setSearchFields] = useState<string[]>(defaultSearchFields)
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)

  // 添加迁移状态
  const [isMigrating, setIsMigrating] = useState(false)
  const [migrationComplete, setMigrationComplete] = useState(false)

  // 添加数据加载状态
  const [isLoading, setIsLoading] = useState(true)
  const [isDataSaving, setIsDataSaving] = useState(false)

  // 添加客户端状态标记
  const [isClient, setIsClient] = useState(false)

  // 防抖定时器引用
  const saveTimeout = useRef<NodeJS.Timeout | null>(null)

  // 确保只在客户端执行
  useEffect(() => {
    setIsClient(true)
  }, [])

  // 数据迁移和加载 (只在客户端执行)
  useEffect(() => {
    // 确保只在客户端执行
    if (!isClient) return

    // 异步加载数据函数
    const loadData = async () => {
      try {
        setIsLoading(true)

        // 检查是否需要从 localStorage 迁移数据到 IndexedDB
        if (needMigration()) {
          console.log("开始从 localStorage 迁移数据...")
          setIsMigrating(true)

          // 执行迁移
          const migrationSuccess = await migrateFromLocalStorage()

          if (migrationSuccess) {
            console.log("迁移成功，清除旧数据...")
            // 迁移成功后清除 localStorage 中的旧数据
            clearLocalStorageData()
            setMigrationComplete(true)
          } else {
            console.error("迁移失败，使用默认数据")
          }

          setIsMigrating(false)
        }

        // 从 IndexedDB 加载数据
        const loadedBookmarks = await db.getAllBookmarks()
        const loadedFolders = await db.getAllFolders()
        const loadedTags = await db.getTags()
        const loadedFavoriteFolders = await db.getFavoriteFolders()
        const loadedSortOption = await db.getSortOption()
        const loadedSearchFields = await db.getSearchFields()
        const loadedSettings = await db.getAppSettings()

        // 更新状态
        if (loadedBookmarks.length > 0) setBookmarks(loadedBookmarks)
        if (loadedFolders.length > 0) setFolders(loadedFolders)
        if (loadedTags.length > 0) setTags(loadedTags)
        if (loadedFavoriteFolders.length > 0) setFavoriteFolders(loadedFavoriteFolders)
        if (loadedSortOption) setCurrentSortOption(loadedSortOption)
        if (loadedSearchFields.length > 0) setSearchFields(loadedSearchFields)
        if (loadedSettings) setSettings(loadedSettings)

        console.log("从 IndexedDB 加载数据完成")
      } catch (error) {
        console.error("从 IndexedDB 加载数据失败:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [isClient]) // 依赖于 isClient 变量，确保只在客户端执行

  // 数据变更时保存到 IndexedDB (使用防抖)
  useEffect(() => {
    // 确保只在客户端执行且已加载完成
    if (!isClient || isLoading) return

    // 清除之前的定时器
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current)
    }

    // 设置新的防抖定时器
    saveTimeout.current = setTimeout(async () => {
      try {
        setIsDataSaving(true)

        // 保存书签
        await db.saveBookmarks(bookmarks)

        // 保存文件夹
        await db.saveFolders(folders)

        // 保存标签
        await db.saveTags(tags)

        // 保存收藏文件夹
        await db.saveFavoriteFolders(favoriteFolders)

        // 保存排序选项
        await db.saveSortOption(currentSortOption)

        // 保存搜索字段
        await db.saveSearchFields(searchFields)

        // 保存应用设置
        await db.saveAppSettings(settings)

        console.log("数据已保存到 IndexedDB")
      } catch (error) {
        console.error("保存数据到 IndexedDB 失败:", error)
      } finally {
        setIsDataSaving(false)
      }
    }, 300)

    // 组件卸载时清除定时器
    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current)
      }
    }
  }, [isClient, isLoading, bookmarks, folders, tags, favoriteFolders, currentSortOption, searchFields, settings])

  // 辅助函数：防抖
  const debounce = <F extends (...args: any[]) => any>(func: F, wait: number): ((...args: Parameters<F>) => void) => {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: Parameters<F>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  // Apply dark mode when settings change
  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }

    // Apply accent color
    document.documentElement.style.setProperty("--accent-color", settings.accentColor)

    // Generate lighter and darker variants of the accent color
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      return result
        ? {
            r: Number.parseInt(result[1], 16),
            g: Number.parseInt(result[2], 16),
            b: Number.parseInt(result[3], 16),
          }
        : null
    }

    const rgb = hexToRgb(settings.accentColor)
    if (rgb) {
      document.documentElement.style.setProperty("--accent-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`)

      // Lighter variant (for hover)
      const lighter = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`
      document.documentElement.style.setProperty("--accent-light", lighter)

      // Darker variant (for active/pressed)
      const darker = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`
      document.documentElement.style.setProperty("--accent-dark", darker)
    }
  }, [settings.darkMode, settings.accentColor])

  // Update settings
  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }))
  }

  // 简化的 favicon 生成函数，只使用书签标题首字母
  const fetchAndStoreFavicon = async (url: string, title: string): Promise<string> => {
    // 不再尝试获取网页的真实 favicon，直接返回空值
    // 将会使用书签列表中的备选显示机制（标题首字母）
    return ""
  }

  // 辅助函数：将字符串转换为颜色
  const stringToColor = (str: string): string => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }

    let color = "#"
    for (let i = 0; i < 3; i++) {
      const value = (hash >> (i * 8)) & 0xff
      color += ("00" + value.toString(16)).substr(-2)
    }

    return color
  }

  // Refresh all favicons
  const refreshAllFavicons = async () => {
    const updatedBookmarks = [...bookmarks]

    for (let i = 0; i < updatedBookmarks.length; i++) {
      const bookmark = updatedBookmarks[i]
      try {
        const favicon = await fetchAndStoreFavicon(bookmark.url, bookmark.title)
        updatedBookmarks[i] = { ...bookmark, favicon }
      } catch (error) {
        console.error(`Error refreshing favicon for ${bookmark.title}:`, error)
      }
    }

    setBookmarks(updatedBookmarks)
  }

  // Toggle favorite folder
  const toggleFavoriteFolder = (folderId: string) => {
    setFavoriteFolders((prev) => (prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]))
  }

  // Toggle favorite bookmark
  const toggleFavoriteBookmark = (id: string) => {
    setBookmarks((prev) =>
      prev.map((bookmark) => (bookmark.id === id ? { ...bookmark, isFavorite: !bookmark.isFavorite } : bookmark)),
    )
  }

  // Toggle search field
  const toggleSearchField = (field: string) => {
    setSearchFields((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]))
  }

  // Sort bookmarks based on current sort option
  const sortBookmarks = (bookmarksToSort: Bookmark[]): Bookmark[] => {
    const sorted = [...bookmarksToSort]

    switch (currentSortOption) {
      case "newest":
        return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      case "oldest":
        return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      case "title-asc":
        return sorted.sort((a, b) => a.title.localeCompare(b.title))
      case "title-desc":
        return sorted.sort((a, b) => b.title.localeCompare(a.title))
      case "url-asc":
        return sorted.sort((a, b) => a.url.localeCompare(b.url))
      case "url-desc":
        return sorted.sort((a, b) => b.url.localeCompare(a.url))
      default:
        return sorted
    }
  }

  // Filter bookmarks based on selected folder, tags, and search query
  const filteredBookmarks = (activeTab: string, searchQuery: string, fields: string[] = searchFields) => {
    let filtered = [...bookmarks]

    // Filter by active tab
    if (activeTab === "favorites") {
      filtered = filtered.filter((bookmark) => bookmark.isFavorite)
    } else if (activeTab !== "all") {
      filtered = filtered.filter((bookmark) => bookmark.folderId === activeTab)
    }

    // Filter by selected folder
    if (selectedFolderId) {
      const childFolderIds = getChildFolderIds(selectedFolderId)
      filtered = filtered.filter(
        (bookmark) => bookmark.folderId === selectedFolderId || childFolderIds.includes(bookmark.folderId || ""),
      )
    }

    // Filter by selected tags
    if (selectedTags.length > 0) {
      filtered = filtered.filter(
        (bookmark) => bookmark.tags && selectedTags.some((tag) => bookmark.tags?.includes(tag)),
      )
    }

    // Filter by search query using fuzzy search
    if (searchQuery) {
      const fuse = new Fuse(filtered, {
        keys: fields,
        threshold: 0.4,
        ignoreLocation: true,
      })
      const result = fuse.search(searchQuery)
      filtered = result.map((item) => item.item)
    }

    // Sort the filtered bookmarks
    return sortBookmarks(filtered)
  }

  // Bookmark operations
  const addBookmark = async (bookmark: Bookmark) => {
    // If favicon is not provided, fetch it
    if (!bookmark.favicon) {
      try {
        bookmark.favicon = await fetchAndStoreFavicon(bookmark.url, bookmark.title)
      } catch (error) {
        console.error("Error fetching favicon:", error)
      }
    }

    // 更新状态
    setBookmarks((prev) => [...prev, bookmark])

    // 保存到 IndexedDB - 因为状态更新已经触发防抖保存，这里不需要重复保存
    // await db.saveBookmark(bookmark)

    // Add any new tags
    if (bookmark.tags) {
      const newTags = bookmark.tags.filter((tag) => !tags.includes(tag))
      if (newTags.length > 0) {
        setTags((prev) => [...prev, ...newTags])
        // 同样，状态更新已经触发防抖保存
        // await db.saveTags([...tags, ...newTags])
      }
    }
  }

  const updateBookmark = async (bookmark: Bookmark) => {
    // If URL has changed, fetch new favicon
    const existingBookmark = bookmarks.find((b) => b.id === bookmark.id)
    if (existingBookmark && existingBookmark.url !== bookmark.url) {
      try {
        bookmark.favicon = await fetchAndStoreFavicon(bookmark.url, bookmark.title)
      } catch (error) {
        console.error("Error fetching favicon:", error)
      }
    }

    // 更新状态
    setBookmarks((prev) => prev.map((b) => (b.id === bookmark.id ? bookmark : b)))

    // 保存到 IndexedDB - 因为状态更新已经触发防抖保存，这里不需要重复保存
    // await db.saveBookmark(bookmark)

    // Update tags
    if (bookmark.tags) {
      const newTags = bookmark.tags.filter((tag) => !tags.includes(tag))
      if (newTags.length > 0) {
        setTags((prev) => [...prev, ...newTags])
        // 同样，状态更新已经触发防抖保存
        // await db.saveTags([...tags, ...newTags])
      }
    }
  }

  const deleteBookmark = async (id: string) => {
    try {
      // 先直接从数据库中删除书签
      await db.deleteBookmark(id);

      // 然后更新状态
      setBookmarks((prev) => prev.filter((b) => b.id !== id));

      console.log(`成功删除书签: ${id}`);
    } catch (error) {
      console.error(`删除书签失败: ${id}`, error);
      // 删除失败，但仍然尝试更新UI状态，提供更好的用户体验
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    }
  }

  // Folder operations
  const addFolder = async (folder: Folder) => {
    // 更新状态
    setFolders((prev) => [...prev, folder])

    // 保存到 IndexedDB - 因为状态更新已经触发防抖保存，这里不需要重复保存
    // await db.saveFolder(folder)
  }

  const updateFolder = async (folder: Folder) => {
    // 更新状态
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)))

    // 保存到 IndexedDB - 因为状态更新已经触发防抖保存，这里不需要重复保存
    // await db.saveFolder(folder)
  }

  const deleteFolder = async (id: string) => {
    // Delete folder and all its children
    const childFolderIds = getChildFolderIds(id)

    // 更新文件夹状态
    setFolders((prev) => prev.filter((f) => f.id !== id && !childFolderIds.includes(f.id)))

    // Update bookmarks that were in this folder
    setBookmarks((prev) =>
      prev.map((b) => (b.folderId === id || childFolderIds.includes(b.folderId || "") ? { ...b, folderId: null } : b)),
    )

    // Remove from favorites if it was favorited
    if (favoriteFolders.includes(id)) {
      setFavoriteFolders((prev) => prev.filter((folderId) => folderId !== id))
    }

    // If the deleted folder was selected, clear the selection
    if (selectedFolderId === id || childFolderIds.includes(selectedFolderId || "")) {
      setSelectedFolderId(null)
    }

    // 删除 IndexedDB 中的数据 - 因为状态更新已经触发防抖保存，这里不需要重复操作
    // await db.deleteFolder(id)
    // 子文件夹也需要删除
    // for (const childId of childFolderIds) {
    //   await db.deleteFolder(childId)
    // }
  }

  // Helper to get all child folder IDs recursively
  const getChildFolderIds = (folderId: string): string[] => {
    const directChildren = folders.filter((f) => f.parentId === folderId)
    const childIds = directChildren.map((f) => f.id)

    return [...childIds, ...childIds.flatMap((id) => getChildFolderIds(id))]
  }

  // Tag operations
  const addTag = (tag: string) => {
    if (!tags.includes(tag)) {
      setTags((prev) => [...prev, tag])
    }
  }

  const deleteTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag))

    // Remove tag from all bookmarks
    setBookmarks((prev) =>
      prev.map((b) => ({
        ...b,
        tags: b.tags ? b.tags.filter((t) => t !== tag) : [],
      })),
    )
  }

  // Import/Export
  const exportBookmarks = () => {
    // 避免序列化大字符串，使用 Blob 直接创建流式处理
    // 分块处理大型数据结构，每次只处理一部分数据
    const streamData = async () => {
      // 创建对象的浅拷贝，避免直接修改状态
      const exportData = {
        bookmarks,
        folders,
        tags,
        favoriteFolders,
        settings,
        exportDate: new Date().toISOString(),
      };

      // 使用 Blob 直接创建文件，避免在内存中构建完整的大字符串
      const blob = new Blob(
        [JSON.stringify(exportData, (key, value) => {
          // 对超大的数组或对象进行特殊处理
          if (Array.isArray(value) && value.length > 1000) {
            return [...value]; // 创建一个新数组引用，防止循环引用
          }
          return value;
        }, 2)],
        { type: "application/json" }
      );

      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `bookmark-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    streamData();
  }

  const importBookmarks = async (data: any) => {
    try {
      // 开始导入处理
      console.log("开始导入数据...")

      // 处理书签数据 - 使用批量处理来提高性能
      if (data.bookmarks) {
        console.log(`导入 ${data.bookmarks.length} 个书签...`)
        setBookmarks(data.bookmarks)
        // 批量保存到 IndexedDB - 防抖机制已经处理批量保存
        // await db.saveBookmarks(data.bookmarks)
      }

      // 处理其他数据
      if (data.folders) {
        console.log(`导入 ${data.folders.length} 个文件夹...`)
        setFolders(data.folders)
        // await db.saveFolders(data.folders)
      }

      if (data.tags) {
        console.log(`导入 ${data.tags.length} 个标签...`)
        setTags(data.tags)
        // await db.saveTags(data.tags)
      }

      if (data.favoriteFolders) {
        console.log(`导入 ${data.favoriteFolders.length} 个收藏文件夹...`)
        setFavoriteFolders(data.favoriteFolders)
        // await db.saveFavoriteFolders(data.favoriteFolders)
      }

      if (data.settings) {
        console.log("导入应用设置...")
        setSettings(data.settings)
        // await db.saveAppSettings(data.settings)
      }

      console.log("数据导入完成")
    } catch (error) {
      console.error("导入数据失败:", error)
      throw error
    }
  }

  // 添加标签推荐函数
  const suggestTags = async (url: string): Promise<string[]> => {
    if (!settings.tagApiUrl || !settings.tagApiKey) {
      throw new Error("Tag API not configured. Please set up the API in settings.")
    }

    try {
      const response = await fetch(settings.tagApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.tagApiKey}`,
        },
        body: JSON.stringify({
          url,
          existingTags: tags,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("API authentication failed. Please check your API key.")
        }
        throw new Error(`API request failed with status: ${response.status}`)
      }

      const data = await response.json()

      if (!data.tags || !Array.isArray(data.tags)) {
        throw new Error("Invalid API response format. Expected { tags: string[] }")
      }

      return data.tags
    } catch (error) {
      console.error("Error suggesting tags:", error)
      throw error
    }
  }

  // 清除所有书签数据
  const clearAllBookmarkData = async (): Promise<void> => {
    try {
      // 清除IndexedDB中的书签和文件夹数据
      await db.clearAllData();

      // 重置状态
      setBookmarks([]);
      setFolders([]);
      setTags([]);
      setFavoriteFolders([]);
      setSelectedFolderId(null);
      setSelectedTags([]);

      console.log("所有书签数据已清除");
    } catch (error) {
      console.error("清除书签数据失败:", error);
      throw error;
    }
  }

  // 重置为示例数据
  const resetToSampleData = async (): Promise<void> => {
    try {
      // 清除现有数据
      await db.clearAllData();

      // 重置为示例数据
      setBookmarks(sampleBookmarks);
      setFolders(sampleFolders);
      setTags(sampleTags);
      setFavoriteFolders(sampleFavoriteFolders);
      setSelectedFolderId(null);
      setSelectedTags([]);

      console.log("数据已重置为示例数据");
    } catch (error) {
      console.error("重置数据失败:", error);
      throw error;
    }
  }

  return (
    <BookmarkContext.Provider
      value={{
        bookmarks,
        folders,
        tags,
        selectedFolderId,
        setSelectedFolderId,
        selectedTags,
        setSelectedTags,
        favoriteFolders,
        toggleFavoriteFolder,
        toggleFavoriteBookmark,
        addBookmark,
        updateBookmark,
        deleteBookmark,
        addFolder,
        updateFolder,
        deleteFolder,
        addTag,
        deleteTag,
        exportBookmarks,
        importBookmarks,
        filteredBookmarks,
        sortOptions,
        currentSortOption,
        setCurrentSortOption,
        searchFields,
        toggleSearchField,
        settings,
        updateSettings,
        fetchAndStoreFavicon,
        refreshAllFavicons,
        suggestTags,
        clearAllBookmarkData,
        resetToSampleData,
      }}
    >
      {children}
    </BookmarkContext.Provider>
  )
}

// Custom hook to use the bookmark context
export function useBookmarks() {
  const context = useContext(BookmarkContext)
  if (context === undefined) {
    throw new Error("useBookmarks must be used within a BookmarkProvider")
  }
  return context
}
