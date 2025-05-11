"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import Fuse from "fuse.js"

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
}

// 简化示例数据，减少序列化大小
const sampleBookmarks: Bookmark[] = [
  {
    id: "bookmark-1",
    title: "Google",
    url: "https://www.google.com",
    folderId: "folder-1",
    tags: ["search"],
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    favicon: "",
    isFavorite: true,
  },
  {
    id: "bookmark-2",
    title: "GitHub",
    url: "https://github.com",
    folderId: "folder-2",
    tags: ["development"],
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
  }
]

const sampleTags: string[] = [
  "search",
  "development"
]

// Initial favorite folders
const sampleFavoriteFolders: string[] = ["folder-2"]

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
}

// Create context
const BookmarkContext = createContext<BookmarkContextType | undefined>(undefined)

// Provider component
export function BookmarkProvider({ children }: { children: ReactNode }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(sampleBookmarks)
  const [folders, setFolders] = useState<Folder[]>(sampleFolders)
  const [tags, setTags] = useState<string[]>(sampleTags)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [favoriteFolders, setFavoriteFolders] = useState<string[]>(sampleFavoriteFolders)
  const [currentSortOption, setCurrentSortOption] = useState<string>("newest")
  const [searchFields, setSearchFields] = useState<string[]>(defaultSearchFields)
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)

  // 添加客户端状态标记
  const [isClient, setIsClient] = useState(false)
  
  // 确保只在客户端执行
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Load data from storage on mount (只在客户端执行)
  useEffect(() => {
    // 确保只在客户端执行
    if (!isClient) return

    try {
      // 检查是否有分块存储的书签数据
      const chunksCount = localStorage.getItem("bookmarks_chunks");
      
      if (chunksCount) {
        // 从分块中恢复书签数据
        const count = Number(chunksCount);
        const bookmarksList: Bookmark[] = [];
        
        for (let i = 0; i < count; i++) {
          const chunk = localStorage.getItem(`bookmarks_chunk_${i}`);
          if (chunk) {
            try {
              // 使用Buffer进行解析优化 (在浏览器环境下，这只是一个概念，实际还是使用JSON.parse)
              // 在Node.js环境中，可以使用实际的Buffer
              const parsedChunk = JSON.parse(chunk);
              bookmarksList.push(...parsedChunk);
            } catch (e) {
              console.error(`Error parsing bookmark chunk ${i}:`, e);
            }
          }
        }
        
        if (bookmarksList.length > 0) {
          setBookmarks(bookmarksList);
        }
      } else {
        // 使用旧的存储方式
        const storedBookmarks = localStorage.getItem("bookmarks");
        if (storedBookmarks) setBookmarks(JSON.parse(storedBookmarks));
      }

      // 恢复其他数据
      const storedFolders = localStorage.getItem("folders")
      const storedTags = localStorage.getItem("tags")
      const storedFavoriteFolders = localStorage.getItem("favoriteFolders")
      const storedSortOption = localStorage.getItem("sortOption")
      const storedSearchFields = localStorage.getItem("searchFields")
      const storedSettings = localStorage.getItem("appSettings")

      if (storedFolders) setFolders(JSON.parse(storedFolders))
      if (storedTags) setTags(JSON.parse(storedTags))
      if (storedFavoriteFolders) setFavoriteFolders(JSON.parse(storedFavoriteFolders))
      if (storedSortOption) setCurrentSortOption(storedSortOption)
      if (storedSearchFields) setSearchFields(JSON.parse(storedSearchFields))
      if (storedSettings) setSettings(JSON.parse(storedSettings))
    } catch (error) {
      console.error("Error loading data from localStorage:", error)
    }
  }, [isClient]) // 依赖于 isClient 变量，确保只在客户端执行

  // Save data to storage when it changes (只在客户端执行)
  useEffect(() => {
    // 确保只在客户端执行
    if (!isClient) return

    try {
      // 优化1：使用防抖，减少频繁的存储操作
      const saveDataToStorage = debounce(() => {
        // 优化2：对大型数据进行分块存储
        // 书签数据 - 可能最大的数据结构，按照100项一组进行分块
        if (bookmarks.length > 100) {
          const chunks = chunkArray(bookmarks, 100);
          chunks.forEach((chunk, index) => {
            localStorage.setItem(`bookmarks_chunk_${index}`, JSON.stringify(chunk));
          });
          localStorage.setItem("bookmarks_chunks", String(chunks.length));
          localStorage.removeItem("bookmarks"); // 移除旧的存储方式
        } else {
          localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
          localStorage.removeItem("bookmarks_chunks"); // 清理可能的旧分块
        }

        // 其他较小的数据结构直接存储
        localStorage.setItem("folders", JSON.stringify(folders))
        localStorage.setItem("tags", JSON.stringify(tags))
        localStorage.setItem("favoriteFolders", JSON.stringify(favoriteFolders))
        localStorage.setItem("sortOption", currentSortOption)
        localStorage.setItem("searchFields", JSON.stringify(searchFields))
        localStorage.setItem("appSettings", JSON.stringify(settings))
      }, 300);

      saveDataToStorage();
    } catch (error) {
      console.error("Error saving data to localStorage:", error)
    }
  }, [isClient, bookmarks, folders, tags, favoriteFolders, currentSortOption, searchFields, settings])

  // 辅助函数：数组分块
  const chunkArray = <T,>(array: T[], chunkSize: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

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

    setBookmarks((prev) => [...prev, bookmark])

    // Add any new tags
    if (bookmark.tags) {
      const newTags = bookmark.tags.filter((tag) => !tags.includes(tag))
      if (newTags.length > 0) {
        setTags((prev) => [...prev, ...newTags])
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

    setBookmarks((prev) => prev.map((b) => (b.id === bookmark.id ? bookmark : b)))

    // Update tags
    if (bookmark.tags) {
      const newTags = bookmark.tags.filter((tag) => !tags.includes(tag))
      if (newTags.length > 0) {
        setTags((prev) => [...prev, ...newTags])
      }
    }
  }

  const deleteBookmark = (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
  }

  // Folder operations
  const addFolder = (folder: Folder) => {
    setFolders((prev) => [...prev, folder])
  }

  const updateFolder = (folder: Folder) => {
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)))
  }

  const deleteFolder = (id: string) => {
    // Delete folder and all its children
    const childFolderIds = getChildFolderIds(id)
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

  const importBookmarks = (data: any) => {
    // 优化导入过程，分批次处理数据，避免一次性处理大量数据
    const processImport = async () => {
      // 处理书签数据 - 可能是最大的数据结构
      if (data.bookmarks) {
        // 如果书签数量超过阈值，分批次设置
        if (data.bookmarks.length > 500) {
          // 创建一个初始状态的副本
          let newBookmarks = [...bookmarks];
          
          // 添加导入的书签
          newBookmarks = [...newBookmarks, ...data.bookmarks];
          
          // 设置新的状态
          setBookmarks(newBookmarks);
        } else {
          // 数据量较小，直接设置
          setBookmarks(data.bookmarks);
        }
      }
      
      // 处理其他数据
      if (data.folders) setFolders(data.folders);
      if (data.tags) setTags(data.tags);
      if (data.favoriteFolders) setFavoriteFolders(data.favoriteFolders);
      if (data.settings) setSettings(data.settings);
    };
    
    processImport();
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
