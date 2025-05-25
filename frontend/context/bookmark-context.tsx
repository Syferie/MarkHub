"use client"

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react"
import Fuse from "fuse.js"
// import { db, migrateFromLocalStorage, needMigration, clearLocalStorageData } from "@/lib/db" // Removed IndexedDB
import { getConfig, saveConfig } from "@/lib/config-storage"
import { useAuth } from "@/context/auth-context"
import {
  getBookmarks,
  getFolders,
  createBookmark as apiCreateBookmark, // Alias to avoid naming conflict
  updateBookmark as apiUpdateBookmark,
  deleteBookmark as apiDeleteBookmark,
  createFolder as apiCreateFolder,
  updateFolder as apiUpdateFolder,
  deleteFolder as apiDeleteFolder,
  setBookmarkFavoriteStatus, // Added import
  fetchFaviconForUrlAPI, // Updated import for new favicon API
} from "@/lib/api-client" // Added API client and types
import { type Bookmark, type Folder } from "@/lib/schemas" // Import types from schemas
import { updateGlobalBookmarkData } from "@/components/webdav-sync" // 导入全局数据更新函数

// Types
// Local Bookmark and Folder interfaces are removed as they are now imported from lib/api-client.ts
// The commented out interface properties below were causing TS errors and are now fully removed.

interface SortOption {
  value: string
  label: string
}

// AppSettings 接口已移除，相关设置通过 AuthContext.userSettings 管理

interface BookmarkContextType {
  bookmarks: Bookmark[]
  folders: Folder[]
  tags: string[]
  selectedFolderId: string | null
  setSelectedFolderId: (id: string | null) => void
  selectedTags: string[]
  setSelectedTags: (tags: string[]) => void
  favoriteFolders: string[]
  toggleFavoriteFolder: (id: string) => Promise<void>
  toggleFavoriteBookmark: (id: string) => void
  // Updated signatures for CRUD operations
  addBookmark: (bookmarkData: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { tags?: string[] }) => Promise<void>
  updateBookmark: (bookmarkId: string, updatedFields: Partial<Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>) => Promise<void>
  deleteBookmark: (id: string) => Promise<void>
  addFolder: (folderData: Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>
  updateFolder: (folderId: string, updatedFields: Partial<Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  addTag: (tagOrTags: string | string[]) => Promise<void>
  deleteTag: (tag: string) => Promise<void>
  exportBookmarks: () => void
  importBookmarks: (data: any) => Promise<void>
  filteredBookmarks: (activeTab: string, searchQuery: string, searchFields: string[]) => Bookmark[]
  sortOptions: SortOption[]
  currentSortOption: string
  setCurrentSortOption: (option: string) => void
  searchFields: string[]
  toggleSearchField: (field: string) => void
  // settings 和 updateSettings 已移除，相关功能通过 AuthContext 管理
  fetchAndStoreFavicon: (url: string, title: string) => Promise<string>
  refreshAllFavicons: () => Promise<void>
  clearAllBookmarkData: () => Promise<void>
  resetToSampleData: () => Promise<void>;
  loadInitialData: () => Promise<void>; // 添加 loadInitialData
  refreshFavicon: (bookmarkId: string) => Promise<void>;
}

// 示例数据 (将被移除或替换为从API加载)
// const sampleBookmarks: Bookmark[] = [ ... ] // Removed
// const sampleFolders: Folder[] = [ ... ] // Removed
// const sampleTags: string[] = [ ... ] // Removed
// const sampleFavoriteFolders: string[] = [] // Removed, will be initialized to empty array

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

// defaultSettings 对象已移除，相关默认值应由 AuthContext 或后端处理

// Create context
const BookmarkContext = createContext<BookmarkContextType | undefined>(undefined)

// Provider component
export function BookmarkProvider({ children }: { children: ReactNode }) {
  const { token, userSettings, updateGlobalSettings } = useAuth()
 
  // 初始化状态
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]) // Initialize with empty array
  const [folders, setFolders] = useState<Folder[]>([]) // Initialize with empty array
  // const [tags, setTags] = useState<string[]>([]) // Removed, will derive from userSettings
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  // const [favoriteFolders, setFavoriteFolders] = useState<string[]>([]) // Removed, will derive from userSettings
  // const [currentSortOption, setCurrentSortOption] = useState<string>("newest") // 移除本地状态
  // const [searchFields, setSearchFields] = useState<string[]>(defaultSearchFields) // 移除本地状态
  // 本地 settings 状态已移除，相关设置通过 AuthContext.userSettings 管理

  // 从 AuthContext 获取设置数据
  const tags = userSettings?.tagList || []
  const favoriteFolders = userSettings?.favoriteFolderIds || []
  const currentSortOption = userSettings?.sortOption || "newest" // 从 userSettings 获取，提供默认值
  const searchFields = userSettings?.searchFields || defaultSearchFields // 从 userSettings 获取，提供默认值
 
  // 添加迁移状态 (将被移除)
  // const [isMigrating, setIsMigrating] = useState(false) // Removed
  // const [migrationComplete, setMigrationComplete] = useState(false) // Removed
 
  // 添加数据加载状态
  const [isLoading, setIsLoading] = useState(true)
  // const [isDataSaving, setIsDataSaving] = useState(false) // 旧的客户端保存状态，已移除
 
  // 添加客户端状态标记
  const [isClient, setIsClient] = useState(false)
   
  // 添加更新计数器，用于触发UI更新
  const bookmarkUpdateCounter = useRef<number>(0)
   
  // 添加数据已加载标志，解决刷新后使用初始数据问题
  const dataLoadedOnce = useRef<boolean>(false)
 
  // 确保只在客户端执行
  useEffect(() => {
    setIsClient(true)
  }, [])
 
  // 数据加载 (从 API)
  const loadInitialData = async () => { // 重命名函数以便直接暴露
    if (!isClient) return;

    // const loadDataFromAPI = async () => { // 原函数名，现在合并
      if (!token) {
        console.log("用户未认证，不加载书签数据。")
        setBookmarks([])
        setFolders([])
        // Tags and favoriteFolders are derived from userSettings, no need to set them here
        // settings, sortOption, searchFields will be handled in a later step
        setIsLoading(false)
        dataLoadedOnce.current = true
        return
      }
 
      setIsLoading(true)
      try {
        console.log("从 API 加载书签和文件夹数据...")
        const [loadedBookmarks, loadedFolders] = await Promise.all([
          getBookmarks(token),
          getFolders(token),
        ])
 
        setBookmarks(loadedBookmarks)
        setFolders(loadedFolders)
        
        // Tags and favoriteFolders are derived from userSettings
        // setCurrentSortOption("newest") // Keep default or load from settings later
        // setSearchFields(defaultSearchFields) // Keep default or load from settings later
        // setSettings(defaultSettings) // Keep default or load from settings later
 
        console.log("从 API 加载数据完成。")
        // 触发 filteredBookmarks 的更新
        bookmarkUpdateCounter.current += 1;
        
        // 更新全局书签数据，用于WebDAV同步
        updateGlobalBookmarkData({
          bookmarks: loadedBookmarks,
          folders: loadedFolders,
          tags,
          favoriteFolders,
          // settings 参数已从 updateGlobalBookmarkData 调用中移除，WebDAV同步如需配置应从AuthContext获取
        });
      } catch (error) {
        console.error("从 API 加载数据失败:", error)
        // Optionally set an error state here to inform the user
        setBookmarks([]) // Clear data on error
        setFolders([])
        // Tags and favoriteFolders are derived from userSettings
      } finally {
        setIsLoading(false)
        dataLoadedOnce.current = true
      }
    // } // 原函数名结束

    // loadDataFromAPI() // 不再需要单独调用，useEffect 会调用 loadInitialData
  }; // loadInitialData 函数结束

  useEffect(() => {
    if (isClient && token) { // 确保 token 存在时才加载
      loadInitialData();
    } else if (isClient && !token) { // 如果客户端已准备好但没有 token，也调用一次以处理未登录状态
      loadInitialData();
    }
  }, [isClient, token]); // Re-run if token changes (e.g., user logs in/out)

  // 辅助函数：防抖
  const debounce = <F extends (...args: any[]) => any>(func: F, wait: number): ((...args: Parameters<F>) => void) => {
    let timeout: NodeJS.Timeout | null = null;
 
    return (...args: Parameters<F>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }
 
  // The useEffect hook for applying darkMode and accentColor (lines 216-250) is removed
  // as this is now handled by AppSpecificMantineProvider in app/layout.tsx.
 
  // updateSettings 函数已移除，相关设置通过 AuthContext 的 updateGlobalSettings 管理
 
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
  const toggleFavoriteFolder = async (folderId: string) => {
    if (!userSettings || !updateGlobalSettings) {
      console.error("User settings or update function not available");
      return;
    }
    const currentFavoriteFolderIds = userSettings.favoriteFolderIds || [];
    let newFavoriteFolderIds: string[];
    if (currentFavoriteFolderIds.includes(folderId)) {
      newFavoriteFolderIds = currentFavoriteFolderIds.filter((id) => id !== folderId);
    } else {
      newFavoriteFolderIds = [...currentFavoriteFolderIds, folderId];
    }
    try {
      await updateGlobalSettings({ favoriteFolderIds: newFavoriteFolderIds });
    } catch (error) {
      console.error("Failed to update favoriteFolderIds:", error);
    }
  }
 
  // Toggle favorite bookmark
  const toggleFavoriteBookmark = async (id: string) => {
    const bookmark = bookmarks.find(b => b.id === id);
    if (!bookmark) {
      console.error(`Bookmark with id ${id} not found.`);
      return;
    }
 
    const newFavoriteStatus = !bookmark.isFavorite;
 
    // Optimistically update local state
    setBookmarks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, isFavorite: newFavoriteStatus } : b)),
    );
    bookmarkUpdateCounter.current += 1;
 
    if (!token) {
      console.error("User not authenticated, cannot sync favorite status.");
      // Optionally revert optimistic update or show error to user
      setBookmarks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, isFavorite: bookmark.isFavorite } : b)),
      );
      bookmarkUpdateCounter.current += 1;
      return;
    }
 
    try {
      const updatedBookmark = await setBookmarkFavoriteStatus(token, id, newFavoriteStatus);
      // Optionally, update local state with the response from the server
      // This ensures data consistency if the backend modifies the bookmark in other ways
      setBookmarks((prev) =>
        prev.map((b) => (b.id === id ? updatedBookmark : b)),
      );
      bookmarkUpdateCounter.current += 1;
      console.log(`Bookmark ${id} favorite status updated to ${newFavoriteStatus} on the server.`);
    } catch (error) {
      console.error(`Error updating bookmark ${id} favorite status on the server:`, error);
      // Revert optimistic update if API call fails
      setBookmarks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, isFavorite: bookmark.isFavorite } : b)),
      );
      bookmarkUpdateCounter.current += 1;
      // Optionally, show an error message to the user
    }
  }
 
  // 设置当前排序选项 - 更新为使用 AuthContext
  const setCurrentSortOption = (newSortOption: string) => {
    if (!userSettings || !updateGlobalSettings) {
      console.error("User settings or update function not available for setCurrentSortOption");
      return;
    }
    
    updateGlobalSettings({ sortOption: newSortOption })
      .catch((error) => {
        console.error("Failed to update sortOption:", error);
      });
  }

  // Toggle search field - 更新为使用 AuthContext
  const toggleSearchField = (field: string) => {
    if (!userSettings || !updateGlobalSettings) {
      console.error("User settings or update function not available for toggleSearchField");
      return;
    }
    
    const currentFields = userSettings.searchFields || defaultSearchFields;
    const newFields = currentFields.includes(field)
      ? currentFields.filter((f) => f !== field)
      : [...currentFields, field];
      
    updateGlobalSettings({ searchFields: newFields })
      .catch((error) => {
        console.error("Failed to update searchFields:", error);
      });
  }
 
  // Sort bookmarks based on current sort option
  const sortBookmarks = (bookmarksToSort: Bookmark[]): Bookmark[] => {
    const sorted = [...bookmarksToSort]
 
    switch (currentSortOption) {
      case "newest":
        return sorted.sort((a, b) => new Date(b.created || '').getTime() - new Date(a.created || '').getTime())
      case "oldest":
        return sorted.sort((a, b) => new Date(a.created || '').getTime() - new Date(b.created || '').getTime())
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
 
  // 用于缓存子文件夹ID的映射
  const childFolderIdsCache = useRef<Record<string, string[]>>({});
 
  // 优化的getChildFolderIds函数，使用缓存避免重复计算
  const getChildFolderIds = (folderId: string): string[] => {
    // 如果缓存中已有结果，直接返回
    if (childFolderIdsCache.current[folderId]) {
      return childFolderIdsCache.current[folderId];
    }
 
    const directChildren = folders.filter((f) => f.parentId === folderId);
    const childIds = directChildren.map((f) => f.id);
 
    // 递归获取所有子文件夹ID
    const allChildIds = [...childIds];
    for (const childId of childIds) {
      allChildIds.push(...getChildFolderIds(childId));
    }
 
    // 缓存结果
    childFolderIdsCache.current[folderId] = allChildIds;
    return allChildIds;
  }
 
  // 当文件夹结构变化时，清除缓存
  useEffect(() => {
    childFolderIdsCache.current = {};
  }, [folders]);
 
  // 使用useMemo优化的filteredBookmarks函数，但添加更新计数器避免缓存问题
  const filteredBookmarksCache = useRef<Record<string, Bookmark[]>>({});
  const filteredBookmarksCacheKey = useRef<string>('');
 
  // Filter bookmarks based on selected folder, tags, and search query
  const filteredBookmarks = (activeTab: string, searchQuery: string, fields: string[] = searchFields) => {
    // 创建缓存键，添加更新计数器确保在数据变化时缓存失效
    const cacheKey = `${activeTab}_${selectedFolderId || 'null'}_${selectedTags.join(',')}_${searchQuery}_${fields.join(',')}_${currentSortOption}_${bookmarkUpdateCounter.current}`;
 
    // 如果缓存键与上次相同，直接返回缓存结果
    if (cacheKey === filteredBookmarksCacheKey.current && filteredBookmarksCache.current[cacheKey]) {
      return filteredBookmarksCache.current[cacheKey];
    }
 
    // 更新缓存键
    filteredBookmarksCacheKey.current = cacheKey;
 
    // 开始过滤
    let filtered = [...bookmarks];
 
    // 使用更高效的过滤方式
    // Filter by active tab
    if (activeTab === "favorites") {
      filtered = filtered.filter((bookmark) => bookmark.isFavorite);
    } else if (activeTab !== "all") {
      filtered = filtered.filter((bookmark) => bookmark.folderId === activeTab);
    }
 
    // Filter by selected folder - 使用缓存的子文件夹ID
    if (selectedFolderId) {
      const childFolderIds = getChildFolderIds(selectedFolderId);
      // 创建一个Set以提高includes的性能
      const folderIdSet = new Set([selectedFolderId, ...childFolderIds]);
      filtered = filtered.filter(
        (bookmark) => bookmark.folderId && folderIdSet.has(bookmark.folderId)
      );
    }
 
    // Filter by selected tags - 使用Set提高性能
    if (selectedTags.length > 0) {
      const tagSet = new Set(selectedTags);
      filtered = filtered.filter(
        (bookmark) => bookmark.tags && bookmark.tags.some((tag: string) => tagSet.has(tag))
      );
    }
 
    // Filter by search query using fuzzy search
    if (searchQuery) {
      // 只有当搜索查询不为空时才创建Fuse实例，避免不必要的计算
      const fuse = new Fuse(filtered, {
        keys: fields,
        threshold: 0.4,
        ignoreLocation: true,
      });
      const result = fuse.search(searchQuery);
      filtered = result.map((item) => item.item);
    }
 
    // Sort the filtered bookmarks
    const sortedResult = sortBookmarks(filtered);
 
    // 缓存结果
    filteredBookmarksCache.current[cacheKey] = sortedResult;
 
    return sortedResult;
  }
 
  // Bookmark operations
  const addBookmark = async (bookmarkData: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { tags?: string[] }) => {
    if (!token) {
      console.error("用户未认证，无法添加书签。")
      return
    }
 
    // Explicitly pick allowed fields for creation to prevent sending disallowed fields like id, userId, etc.
    const dataToSend: {
      title: string;
      url: string;
      folderId?: string | null;
      favicon?: string;
      isFavorite?: boolean;
      description?: string;
      img?: string;
      tags?: string[];
    } = {
      title: bookmarkData.title,
      url: bookmarkData.url,
    };

    if (bookmarkData.folderId !== undefined && bookmarkData.folderId !== null) {
      dataToSend.folderId = bookmarkData.folderId;
    }
    if (bookmarkData.favicon !== undefined) {
      dataToSend.favicon = bookmarkData.favicon;
    }
    if (bookmarkData.isFavorite !== undefined) {
      dataToSend.isFavorite = bookmarkData.isFavorite;
    }
    if (bookmarkData.description !== undefined) {
      dataToSend.description = bookmarkData.description;
    }
    if (bookmarkData.img !== undefined) {
      dataToSend.img = bookmarkData.img;
    }
    if (bookmarkData.tags !== undefined) {
      dataToSend.tags = bookmarkData.tags;
    }
 
    // If favicon is not provided, fetch it (or prepare for backend to handle it)
    // For now, we assume favicon is part of bookmarkData or handled by backend.
    // If client-side favicon generation is still needed before sending:
    // if (!dataToSend.favicon && dataToSend.url && dataToSend.title) {
    //   try {
    //     dataToSend.favicon = await fetchAndStoreFavicon(dataToSend.url, dataToSend.title);
    //   } catch (error) {
    //     console.error("Error fetching favicon for new bookmark:", error);
    //   }
    // }
 
    try {
      const newBookmark = await apiCreateBookmark(token, dataToSend as Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) // Cast as Omit type
      setBookmarks((prev) => [...prev, newBookmark])
      bookmarkUpdateCounter.current += 1
      
      // 更新全局书签数据
      updateGlobalBookmarkData({
        bookmarks: [...bookmarks, newBookmark],
        folders,
        tags,
        favoriteFolders,
        // settings 参数已从 updateGlobalBookmarkData 调用中移除
      });
 
      // Add any new tags from the created bookmark to the global tags list
      if (newBookmark.tags && userSettings && updateGlobalSettings) {
        const currentGlobalTags = userSettings.tagList || [];
        const tagsToAdd = newBookmark.tags.filter((tag: string) => !currentGlobalTags.includes(tag));
        if (tagsToAdd.length > 0) {
          const newFullTagList = [...currentGlobalTags, ...tagsToAdd];
          try {
            await updateGlobalSettings({ tagList: newFullTagList });
          } catch (error) {
            console.error("Failed to update tagList after adding bookmark:", error);
          }
        }
      }
      console.log("书签创建成功:", newBookmark.title)
    } catch (error) {
      console.error("创建书签失败:", error)
      // Optionally, re-throw or set an error state for the UI
    }
  }
 
  const updateBookmark = async (
    bookmarkId: string,
    updatedFields: Partial<Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'tags'>>
  ) => {
    if (!token) {
      console.error("用户未认证，无法更新书签。")
      return
    }
 
    let dataToUpdate = { ...updatedFields };
 
    // If URL has changed, fetch new favicon (or prepare for backend to handle it)
    // This logic might need adjustment based on whether favicon is part of updatedFields
    // const existingBookmark = bookmarks.find((b) => b.id === bookmarkId);
    // if (existingBookmark && dataToUpdate.url && existingBookmark.url !== dataToUpdate.url && dataToUpdate.title) {
    //   try {
    //     dataToUpdate.favicon = await fetchAndStoreFavicon(dataToUpdate.url, dataToUpdate.title);
    //   } catch (error) {
    //     console.error("Error fetching favicon for updated bookmark:", error);
    //   }
    // }
 
 
    try {
      const updatedBookmark = await apiUpdateBookmark(token, bookmarkId, dataToUpdate)
      setBookmarks((prev) => prev.map((b) => (b.id === bookmarkId ? updatedBookmark : b)))
      bookmarkUpdateCounter.current += 1
      
      // 更新全局书签数据
      const updatedBookmarks = bookmarks.map((b) => (b.id === bookmarkId ? updatedBookmark : b));
      updateGlobalBookmarkData({
        bookmarks: updatedBookmarks,
        folders,
        tags,
        favoriteFolders,
        // settings 参数已从 updateGlobalBookmarkData 调用中移除
      });
 
      // Update global tags if necessary
      if (updatedBookmark.tags && userSettings && updateGlobalSettings) {
        const currentGlobalTags = userSettings.tagList || [];
        const tagsToAdd = updatedBookmark.tags.filter((tag: string) => !currentGlobalTags.includes(tag));
        if (tagsToAdd.length > 0) {
          const newFullTagList = [...currentGlobalTags, ...tagsToAdd];
          try {
            await updateGlobalSettings({ tagList: newFullTagList });
          } catch (error) {
            console.error("Failed to update tagList after updating bookmark:", error);
          }
        }
      }
      console.log("书签更新成功:", updatedBookmark.title)
    } catch (error) {
      console.error(`更新书签失败 (ID: ${bookmarkId}):`, error)
    }
  }
 
  const deleteBookmark = async (id: string) => {
    if (!token) {
      console.error("用户未认证，无法删除书签。")
      return
    }
 
    try {
      await apiDeleteBookmark(token, id)
      setBookmarks((prev) => prev.filter((b) => b.id !== id))
      bookmarkUpdateCounter.current += 1
      
      // 更新全局书签数据
      const updatedBookmarks = bookmarks.filter((b) => b.id !== id);
      updateGlobalBookmarkData({
        bookmarks: updatedBookmarks,
        folders,
        tags,
        favoriteFolders,
        // settings 参数已从 updateGlobalBookmarkData 调用中移除
      });
      console.log(`书签已删除 (ID: ${id})`)
    } catch (error) {
      console.error(`删除书签失败 (ID: ${id}):`, error)
      // Consider how to handle UI in case of API failure.
      // For now, we optimistically update, but you might want to revert or show an error.
    }
  }
 
  // Folder operations
  const addFolder = async (folderData: Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => {
    if (!token) {
      console.error("用户未认证，无法添加文件夹。")
      return
    }
    try {
      // Explicitly pick allowed fields for folder creation
      const dataToSend: {
        name: string;
        parentId?: string | null;
      } = {
        name: folderData.name,
      };
 
      if (folderData.parentId !== undefined && folderData.parentId !== null) {
        dataToSend.parentId = folderData.parentId;
      }
 
      const newFolder = await apiCreateFolder(token, dataToSend as Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) // Cast as Omit type
      setFolders((prev) => [...prev, newFolder]) // 使用 newFolder
      console.log("文件夹已创建:", newFolder)
      
      // 更新全局书签数据
      updateGlobalBookmarkData({
        bookmarks,
        folders: [...folders, newFolder],
        tags,
        favoriteFolders,
        // settings 参数已从 updateGlobalBookmarkData 调用中移除
      });
    } catch (error) {
      console.error("创建文件夹失败:", error)
    }
  }
 
  const updateFolder = async (
    folderId: string, // 匹配 BookmarkContextType 中的签名
    updatedFields: Partial<Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'userId'>> // 匹配 BookmarkContextType
  ) => {
    if (!token) {
      console.error("用户未认证，无法更新文件夹。")
      return
    }
    try {
      const updatedFolderData = await apiUpdateFolder(token, folderId, updatedFields)
      setFolders((prev) => prev.map((f) => (f.id === folderId ? updatedFolderData : f)))
      console.log("文件夹已更新:", updatedFolderData)
      
      // 更新全局书签数据
      const updatedFolders = folders.map((f) => (f.id === folderId ? updatedFolderData : f));
      updateGlobalBookmarkData({
        bookmarks,
        folders: updatedFolders,
        tags,
        favoriteFolders,
        // settings 参数已从 updateGlobalBookmarkData 调用中移除
      });
    } catch (error) {
      console.error(`更新文件夹失败 (ID: ${folderId}):`, error)
    }
  }
 
  const deleteFolder = async (id: string) => {
    if (!token) {
      console.error("用户未认证，无法删除文件夹。")
      return
    }
 
    const childFolderIds = getChildFolderIds(id) // 这部分逻辑可以保留
 
    try {
      await apiDeleteFolder(token, id)
      // 假设后端会级联删除或我们需要单独处理子文件夹的删除
      // 如果后端不处理子文件夹，我们可能需要迭代 childFolderIds 并逐个删除
      // for (const childId of childFolderIds) {
      //   await apiDeleteFolder(token, childId);
      // }
 
      setFolders((prev) => prev.filter((f) => f.id !== id && !childFolderIds.includes(f.id)))
 
      // Update bookmarks that were in this folder or its children
      setBookmarks((prev) =>
        prev.map((b) =>
          b.folderId === id || (b.folderId && childFolderIds.includes(b.folderId))
            ? { ...b, folderId: null }
            : b
        )
      )
      bookmarkUpdateCounter.current += 1;
      
      // 更新全局书签数据
      const updatedFolders = folders.filter((f) => f.id !== id && !childFolderIds.includes(f.id));
      const updatedBookmarks = bookmarks.map((b) =>
        b.folderId === id || (b.folderId && childFolderIds.includes(b.folderId))
          ? { ...b, folderId: null }
          : b
      );
      updateGlobalBookmarkData({
        bookmarks: updatedBookmarks,
        folders: updatedFolders,
        tags,
        favoriteFolders,
        // settings 参数已从 updateGlobalBookmarkData 调用中移除
      });
 
 
      if (userSettings?.favoriteFolderIds?.includes(id) && updateGlobalSettings) {
        const newFavoriteFolderIds = (userSettings.favoriteFolderIds || []).filter(folderId => folderId !== id);
        try {
          await updateGlobalSettings({ favoriteFolderIds: newFavoriteFolderIds });
        } catch (error) {
          console.error("Failed to update favoriteFolderIds after deleting folder:", error);
        }
      }
 
      if (selectedFolderId === id || (selectedFolderId && childFolderIds.includes(selectedFolderId))) {
        setSelectedFolderId(null)
      }
 
      childFolderIdsCache.current = {}; // 清除缓存
      console.log(`文件夹已删除 (ID: ${id}) 及其子文件夹`)
    } catch (error) {
      console.error(`删除文件夹失败 (ID: ${id}):`, error)
    }
  }
 
  // 这个函数已经被上面优化的版本替代
 
  // Tag operations
  const addTag = async (tagOrTags: string | string[]) => {
    if (!userSettings || !updateGlobalSettings) {
      console.error("User settings or update function not available for addTag");
      return;
    }

    let tagsToAdd: string[] = [];
    if (typeof tagOrTags === 'string') {
      //尝试按逗号和分号分割
      const splitTags = tagOrTags.split(/[,;]/).map(t => t.trim()).filter(t => t.length > 0);
      if (splitTags.length > 1) {
        tagsToAdd = splitTags;
      } else if (splitTags.length === 1 && splitTags[0].length > 0) { // 单个标签或无分隔符的单个标签
        tagsToAdd = [splitTags[0]];
      }
    } else if (Array.isArray(tagOrTags)) {
      tagsToAdd = tagOrTags.map(t => t.trim()).filter(t => t.length > 0);
    }

    if (tagsToAdd.length === 0) {
      return; // 没有有效的标签可添加
    }

    const currentTagList = userSettings.tagList || [];
    const newUniqueTags = tagsToAdd.filter(t => !currentTagList.includes(t));

    if (newUniqueTags.length > 0) {
      const finalUpdatedTagList = [...currentTagList, ...newUniqueTags];
      try {
        await updateGlobalSettings({ tagList: finalUpdatedTagList });
        console.log("Global tags updated with:", newUniqueTags);
        
        // 更新全局书签数据，标签已更新
        updateGlobalBookmarkData({
          bookmarks,
          folders,
          tags: finalUpdatedTagList,
          favoriteFolders,
          // settings 参数已从 updateGlobalBookmarkData 调用中移除
        });
      } catch (error) {
        console.error("Failed to update tagList:", error);
      }
    }
  }
 
  const deleteTag = async (tag: string) => {
    if (!userSettings || !updateGlobalSettings) {
      console.error("User settings or update function not available for deleteTag");
      return;
    }
    const currentTagList = userSettings.tagList || [];
    const updatedTagList = currentTagList.filter((t) => t !== tag);
    try {
      await updateGlobalSettings({ tagList: updatedTagList });
 
      // Remove tag from all bookmarks - this part remains as it modifies bookmark objects
      setBookmarks((prev) =>
        prev.map((b) => ({
          ...b,
          tags: b.tags ? b.tags.filter((t: string) => t !== tag) : [],
        })),
      );
      
      // 更新全局书签数据
      const updatedBookmarks = bookmarks.map((b) => ({
        ...b,
        tags: b.tags ? b.tags.filter((t: string) => t !== tag) : [],
      }));
      updateGlobalBookmarkData({
        bookmarks: updatedBookmarks,
        folders,
        tags: updatedTagList,
        favoriteFolders,
        // settings 参数已从 updateGlobalBookmarkData 调用中移除
      });
      // If bookmark's tags need individual API update, that's a separate concern.
      // The prompt implies this is handled by updateBookmark.
    } catch (error) {
      console.error("Failed to update tagList after deleting tag:", error);
    }
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
        // settings 参数已从 updateGlobalBookmarkData 调用中移除 (WebDAV 可能需要 userSettings)
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
 
      if (data.tags && Array.isArray(data.tags) && userSettings && updateGlobalSettings) {
        console.log(`导入 ${data.tags.length} 个标签...`);
        try {
          const currentTags = userSettings.tagList || [];
          const combinedTags = Array.from(new Set([...currentTags, ...data.tags]));
          await updateGlobalSettings({ tagList: combinedTags });
        } catch (error) {
          console.error("Failed to import tags:", error);
        }
      }
 
      if (data.favoriteFolders && Array.isArray(data.favoriteFolders) && userSettings && updateGlobalSettings) {
        console.log(`导入 ${data.favoriteFolders.length} 个收藏文件夹...`);
        try {
          const currentFavorites = userSettings.favoriteFolderIds || [];
          const combinedFavorites = Array.from(new Set([...currentFavorites, ...data.favoriteFolders]));
          await updateGlobalSettings({ favoriteFolderIds: combinedFavorites });
        } catch (error) {
          console.error("Failed to import favorite folders:", error);
        }
      }
 
      if (data.settings && updateGlobalSettings) {
        console.log("导入应用设置并尝试同步到后端...")
        // 假设 data.settings 的结构与 UserSettingsInput 兼容
        // 或者需要转换 data.settings 中的字段以匹配 updateGlobalSettings 的期望
        const { darkMode, accentColor, defaultView, language, geminiApiKey, geminiApiBaseUrl, geminiModelName, webdav_config, favoriteFolderIds, tagList, sortOption, searchFields, tagConcurrencyLimit } = data.settings;
        const settingsToUpdate: Partial<Parameters<typeof updateGlobalSettings>[0]> = {};
        if (darkMode !== undefined) settingsToUpdate.darkMode = darkMode;
        if (accentColor !== undefined) settingsToUpdate.accentColor = accentColor;
        if (defaultView !== undefined) settingsToUpdate.defaultView = defaultView;
        if (language !== undefined) settingsToUpdate.language = language;
        if (geminiApiKey !== undefined) settingsToUpdate.geminiApiKey = geminiApiKey;
        if (geminiApiBaseUrl !== undefined) settingsToUpdate.geminiApiBaseUrl = geminiApiBaseUrl;
        if (geminiModelName !== undefined) settingsToUpdate.geminiModelName = geminiModelName;
        if (webdav_config !== undefined) settingsToUpdate.webdav_config = webdav_config;
        // favoriteFolderIds 和 tagList 通常通过特定操作更新，但如果导入文件中有，也尝试更新
        if (favoriteFolderIds !== undefined) settingsToUpdate.favoriteFolderIds = favoriteFolderIds;
        if (tagList !== undefined) settingsToUpdate.tagList = tagList;
        if (sortOption !== undefined) settingsToUpdate.sortOption = sortOption;
        if (searchFields !== undefined) settingsToUpdate.searchFields = searchFields;
        // tagConcurrencyLimit is not a field in UserSetting, so it's removed from import.
        // if (tagConcurrencyLimit !== undefined) settingsToUpdate.tagConcurrencyLimit = tagConcurrencyLimit;


        if (Object.keys(settingsToUpdate).length > 0) {
          updateGlobalSettings(settingsToUpdate).catch(error => {
            console.error("导入时更新全局设置失败:", error);
          });
        }
      }
 
      console.log("数据导入完成")
      
      // 更新全局书签数据，导入的数据已设置
      updateGlobalBookmarkData({
        bookmarks: data.bookmarks || [],
        folders: data.folders || [],
        tags: userSettings?.tagList || [],
        favoriteFolders: userSettings?.favoriteFolderIds || [],
        // settings 参数已从 updateGlobalBookmarkData 调用中移除 (WebDAV 可能需要 userSettings)
      });
    } catch (error) {
      console.error("导入数据失败:", error)
      throw error
    }
  }
 
  // 清除所有书签数据
  const clearAllBookmarkData = async (): Promise<void> => {
    try {
      // 清除IndexedDB中的书签和文件夹数据 - API call will be needed for backend
      // await db.clearAllData();
      console.log("清除所有书签数据 - API 调用待实现");

      // 重置状态
      setBookmarks([]);
      setFolders([]);
      if (updateGlobalSettings) {
        try {
          await updateGlobalSettings({
            tagList: [],
            favoriteFolderIds: [],
            sortOption: "newest", // 重置排序选项为默认值
            searchFields: defaultSearchFields // 重置搜索字段为默认值
          });
        } catch (error) {
          console.error("Failed to clear tags and favorite folders in userSettings:", error);
        }
      }
      setSelectedFolderId(null);
      setSelectedTags([]);
 
      // 注意：不重置hasLoadedInitialSamples标记，确保清空数据后不会再次加载预置数据
      // console.log("所有书签数据已清除，但保留了初始化标记"); // This logic might change
    } catch (error) {
      console.error("清除书签数据失败:", error);
      throw error;
    }
  }
 
  // 重置为示例数据 - This function's behavior will change significantly
  const resetToSampleData = async (): Promise<void> => {
    try {
      // 清除现有数据 - API call will be needed for backend
      // await db.clearAllData();
      console.log("重置为示例数据 - 此功能需要重新设计以适应后端API");
 
      // 重置为示例数据 - Sample data is removed, so this needs rethinking
      setBookmarks([]); // Clears bookmarks
      setFolders([]);   // Clears folders
      if (updateGlobalSettings) {
        try {
          await updateGlobalSettings({
            tagList: [],
            favoriteFolderIds: [],
            sortOption: "newest", // 重置排序选项为默认值
            searchFields: defaultSearchFields // 重置搜索字段为默认值
          });
        } catch (error) {
          console.error("Failed to reset tags and favorite folders in userSettings:", error);
        }
      }
      setSelectedFolderId(null);
      setSelectedTags([]);
      
      // 将 hasLoadedInitialSamples 标记设为 true，表示已加载过示例数据
      // saveConfig('hasLoadedInitialSamples', true); // This logic might change
 
      // console.log("数据已重置为示例数据");
    } catch (error) {
      console.error("重置数据失败:", error);
      throw error;
    }
  }

  const refreshFavicon = async (bookmarkId: string) => {
    if (!token) {
      console.error("User not authenticated, cannot refresh favicon.");
      return;
    }

    const bookmark = bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) {
      console.error(`Bookmark with id ${bookmarkId} not found for favicon refresh.`);
      return;
    }

    try {
      const apiResponse = await fetchFaviconForUrlAPI(token, bookmark.url);
      
      if (apiResponse.faviconUrl !== undefined) { // Check if faviconUrl is present in the response
        // Even if faviconUrl is null, we should update the bookmark to clear any existing one.
        await updateBookmark(bookmarkId, { faviconUrl: apiResponse.faviconUrl });
        console.log(`Favicon processed for bookmark ${bookmarkId}. New URL: ${apiResponse.faviconUrl}`);
      } else {
        // This case should ideally not happen if the API always returns faviconUrl (even if null)
        // but as a fallback, we can choose to do nothing or log a specific warning.
        console.warn(`Favicon URL not returned by API for bookmark ${bookmarkId}. No update performed.`);
      }
      // Note: updateBookmark already handles setBookmarks and bookmarkUpdateCounter.current += 1
      // and also updates global data via updateGlobalBookmarkData.
    } catch (error) {
      console.error(`Error in refreshFavicon process for bookmark ${bookmarkId}:`, error);
      // Optionally, show a toast notification to the user
    }
  };

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
        // settings, // 已移除，通过 AuthContext 管理
        // updateSettings, // 已移除，通过 AuthContext 管理
        fetchAndStoreFavicon,
        refreshAllFavicons,
        clearAllBookmarkData,
        resetToSampleData,
        loadInitialData, // 将 loadInitialData 添加到 context value
        refreshFavicon,
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
