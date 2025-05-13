"use client"

// 定义数据库版本和名称
export const DB_NAME = "markitDB"
export const DB_VERSION = 1

// 定义对象存储名称
export const STORES = {
  BOOKMARKS: "bookmarks",
  FOLDERS: "folders",
  APP_SETTINGS: "appSettings",
}

// 从 context/bookmark-context.tsx 中导入的数据类型
export interface Bookmark {
  id: string
  title: string
  url: string
  folderId: string | null
  tags?: string[]
  createdAt: string
  favicon?: string
  isFavorite?: boolean
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
}

export interface AppSettings {
  darkMode: boolean
  accentColor: string
  defaultView: string
  tagApiUrl?: string
  tagApiKey?: string
  tagConcurrencyLimit?: number
  // 已明确支持的所有设置项，不再使用模糊的"其他可能的设置..."
}

// 辅助类: IndexedDB 数据库操作
class IndexedDBHelper {
  private dbPromise: Promise<IDBDatabase> | null = null

  // 打开数据库连接
  public openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise
    }

    this.dbPromise = new Promise((resolve, reject) => {
      // 打开数据库连接
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      // 当需要创建/升级数据库时
      request.onupgradeneeded = (event) => {
        const db = request.result
        
        // 创建书签存储
        if (!db.objectStoreNames.contains(STORES.BOOKMARKS)) {
          const bookmarkStore = db.createObjectStore(STORES.BOOKMARKS, { keyPath: "id" })
          
          // 创建常用查询索引
          bookmarkStore.createIndex("folderId", "folderId", { unique: false })
          bookmarkStore.createIndex("tags", "tags", { unique: false, multiEntry: true })
          bookmarkStore.createIndex("createdAt", "createdAt", { unique: false })
          bookmarkStore.createIndex("updatedAt", "updatedAt", { unique: false })
          bookmarkStore.createIndex("isFavorite", "isFavorite", { unique: false })
        }
        
        // 创建文件夹存储
        if (!db.objectStoreNames.contains(STORES.FOLDERS)) {
          const folderStore = db.createObjectStore(STORES.FOLDERS, { keyPath: "id" })
          
          // 创建常用查询索引
          folderStore.createIndex("parentId", "parentId", { unique: false })
        }
        
        // 创建应用设置存储
        if (!db.objectStoreNames.contains(STORES.APP_SETTINGS)) {
          db.createObjectStore(STORES.APP_SETTINGS, { keyPath: "key" })
        }
      }

      // 连接成功
      request.onsuccess = () => {
        resolve(request.result)
      }

      // 连接失败
      request.onerror = () => {
        console.error("数据库连接失败:", request.error)
        reject(request.error)
      }
    })

    return this.dbPromise
  }

  // 关闭数据库连接
  public async closeDB(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise
      db.close()
      this.dbPromise = null
    }
  }

  // 添加或更新书签
  public async saveBookmark(bookmark: Bookmark): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.BOOKMARKS], "readwrite")
      const store = transaction.objectStore(STORES.BOOKMARKS)
      
      const request = store.put(bookmark)
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // 批量保存书签
  public async saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.BOOKMARKS], "readwrite")
      const store = transaction.objectStore(STORES.BOOKMARKS)
      
      let completed = 0
      let hasError = false

      for (const bookmark of bookmarks) {
        const request = store.put(bookmark)
        
        request.onsuccess = () => {
          completed++
          if (completed === bookmarks.length && !hasError) {
            resolve()
          }
        }
        
        request.onerror = () => {
          hasError = true
          reject(request.error)
        }
      }
      
      // 如果没有书签需要保存，直接完成
      if (bookmarks.length === 0) {
        resolve()
      }
    })
  }

  // 获取所有书签
  public async getAllBookmarks(): Promise<Bookmark[]> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.BOOKMARKS], "readonly")
      const store = transaction.objectStore(STORES.BOOKMARKS)
      
      const request = store.getAll()
      
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  // 删除书签
  public async deleteBookmark(id: string): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.BOOKMARKS], "readwrite")
      const store = transaction.objectStore(STORES.BOOKMARKS)
      
      const request = store.delete(id)
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // 添加或更新文件夹
  public async saveFolder(folder: Folder): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.FOLDERS], "readwrite")
      const store = transaction.objectStore(STORES.FOLDERS)
      
      const request = store.put(folder)
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // 批量保存文件夹
  public async saveFolders(folders: Folder[]): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.FOLDERS], "readwrite")
      const store = transaction.objectStore(STORES.FOLDERS)
      
      let completed = 0
      let hasError = false

      for (const folder of folders) {
        const request = store.put(folder)
        
        request.onsuccess = () => {
          completed++
          if (completed === folders.length && !hasError) {
            resolve()
          }
        }
        
        request.onerror = () => {
          hasError = true
          reject(request.error)
        }
      }
      
      // 如果没有文件夹需要保存，直接完成
      if (folders.length === 0) {
        resolve()
      }
    })
  }

  // 获取所有文件夹
  public async getAllFolders(): Promise<Folder[]> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.FOLDERS], "readonly")
      const store = transaction.objectStore(STORES.FOLDERS)
      
      const request = store.getAll()
      
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  // 删除文件夹
  public async deleteFolder(id: string): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.FOLDERS], "readwrite")
      const store = transaction.objectStore(STORES.FOLDERS)
      
      const request = store.delete(id)
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // 保存应用设置
  public async saveAppSettings(settings: AppSettings): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.APP_SETTINGS], "readwrite")
      const store = transaction.objectStore(STORES.APP_SETTINGS)
      
      const request = store.put({
        key: "settings",
        value: settings
      })
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // 获取应用设置
  public async getAppSettings(): Promise<AppSettings | null> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.APP_SETTINGS], "readonly")
      const store = transaction.objectStore(STORES.APP_SETTINGS)
      
      const request = store.get("settings")
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.value)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  // 保存收藏的文件夹 IDs
  public async saveFavoriteFolders(folderIds: string[]): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.APP_SETTINGS], "readwrite")
      const store = transaction.objectStore(STORES.APP_SETTINGS)
      
      const request = store.put({
        key: "favoriteFolders",
        value: folderIds
      })
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // 获取收藏的文件夹 IDs
  public async getFavoriteFolders(): Promise<string[]> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.APP_SETTINGS], "readonly")
      const store = transaction.objectStore(STORES.APP_SETTINGS)
      
      const request = store.get("favoriteFolders")
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.value)
        } else {
          resolve([])
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  // 保存标签列表
  public async saveTags(tags: string[]): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.APP_SETTINGS], "readwrite")
      const store = transaction.objectStore(STORES.APP_SETTINGS)
      
      const request = store.put({
        key: "tags",
        value: tags
      })
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // 获取标签列表
  public async getTags(): Promise<string[]> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.APP_SETTINGS], "readonly")
      const store = transaction.objectStore(STORES.APP_SETTINGS)
      
      const request = store.get("tags")
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.value)
        } else {
          resolve([])
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  // 保存排序选项
  public async saveSortOption(option: string): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.APP_SETTINGS], "readwrite")
      const store = transaction.objectStore(STORES.APP_SETTINGS)
      
      const request = store.put({
        key: "sortOption",
        value: option
      })
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // 获取排序选项
  public async getSortOption(): Promise<string | null> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.APP_SETTINGS], "readonly")
      const store = transaction.objectStore(STORES.APP_SETTINGS)
      
      const request = store.get("sortOption")
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.value)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  // 保存搜索字段
  public async saveSearchFields(fields: string[]): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.APP_SETTINGS], "readwrite")
      const store = transaction.objectStore(STORES.APP_SETTINGS)
      
      const request = store.put({
        key: "searchFields",
        value: fields
      })
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // 获取搜索字段
  public async getSearchFields(): Promise<string[]> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.APP_SETTINGS], "readonly")
      const store = transaction.objectStore(STORES.APP_SETTINGS)
      
      const request = store.get("searchFields")
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.value)
        } else {
          resolve([])
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  // 清空数据库中的所有数据（用于测试或重置）
  public async clearAllData(): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const storeNames = [STORES.BOOKMARKS, STORES.FOLDERS, STORES.APP_SETTINGS]
      const transaction = db.transaction(storeNames, "readwrite")
      
      let completedCount = 0
      let hasError = false
      
      for (const storeName of storeNames) {
        const store = transaction.objectStore(storeName)
        const request = store.clear()
        
        request.onsuccess = () => {
          completedCount++
          if (completedCount === storeNames.length && !hasError) {
            resolve()
          }
        }
        
        request.onerror = () => {
          hasError = true
          reject(request.error)
        }
      }
    })
  }
}

// 创建并导出单例实例
export const db = new IndexedDBHelper()

// 从 localStorage 迁移数据到 IndexedDB
export async function migrateFromLocalStorage(): Promise<boolean> {
  try {
    console.log("开始从 localStorage 迁移数据到 IndexedDB...")
    
    // 检查 localStorage 中是否有数据
    let bookmarks: Bookmark[] = []
    let folders: Folder[] = []
    let tags: string[] = []
    let favoriteFolders: string[] = []
    let sortOption: string | null = null
    let searchFields: string[] = []
    let appSettings: AppSettings | null = null
    
    // 加载书签 - 处理分块存储的情况
    const chunksCount = localStorage.getItem("bookmarks_chunks")
    
    if (chunksCount) {
      // 从分块中恢复书签数据
      const count = Number(chunksCount)
      
      for (let i = 0; i < count; i++) {
        const chunk = localStorage.getItem(`bookmarks_chunk_${i}`)
        if (chunk) {
          try {
            const parsedChunk = JSON.parse(chunk)
            bookmarks.push(...parsedChunk)
          } catch (e) {
            console.error(`Error parsing bookmark chunk ${i}:`, e)
          }
        }
      }
    } else {
      // 使用旧的存储方式
      const storedBookmarks = localStorage.getItem("bookmarks")
      if (storedBookmarks) {
        bookmarks = JSON.parse(storedBookmarks)
      }
    }
    
    // 加载其他数据
    const storedFolders = localStorage.getItem("folders")
    const storedTags = localStorage.getItem("tags")
    const storedFavoriteFolders = localStorage.getItem("favoriteFolders")
    const storedSortOption = localStorage.getItem("sortOption")
    const storedSearchFields = localStorage.getItem("searchFields")
    const storedSettings = localStorage.getItem("appSettings")
    
    if (storedFolders) folders = JSON.parse(storedFolders)
    if (storedTags) tags = JSON.parse(storedTags)
    if (storedFavoriteFolders) favoriteFolders = JSON.parse(storedFavoriteFolders)
    if (storedSortOption) sortOption = storedSortOption
    if (storedSearchFields) searchFields = JSON.parse(storedSearchFields)
    
    // 处理 appSettings - 首先尝试从整体对象加载
    if (storedSettings) {
      try {
        appSettings = JSON.parse(storedSettings)
      } catch (e) {
        console.error("Error parsing appSettings:", e)
      }
    }
    
    // 检查是否需要从单独存储的设置项构建或补充 appSettings
    if (!appSettings) {
      appSettings = {} as AppSettings
    }
    
    // 检查各个独立存储的设置项，并添加到 appSettings 中
    // 注意: 这些设置可能存在于旧版本的应用程序中
    const possibleIndividualSettings = [
      "darkMode", "accentColor", "defaultView", "tagApiUrl", "tagApiKey", "tagConcurrencyLimit"
    ]
    
    // 将独立设置项合并到 appSettings 中（如果尚未设置）
    for (const key of possibleIndividualSettings) {
      const value = localStorage.getItem(key)
      if (value !== null && !(key in appSettings)) {
        try {
          // 尝试解析 JSON，但如果失败则使用原始值
          try {
            (appSettings as any)[key] = JSON.parse(value)
          } catch {
            (appSettings as any)[key] = value
          }
          console.log(`从独立设置项迁移 ${key}`)
        } catch (e) {
          console.error(`Error processing individual setting ${key}:`, e)
        }
      }
    }
    
    // 检查是否有数据需要迁移
    if (
      bookmarks.length === 0 &&
      folders.length === 0 &&
      tags.length === 0 &&
      favoriteFolders.length === 0 &&
      Object.keys(appSettings).length === 0
    ) {
      console.log("没有找到需要迁移的数据")
      return false
    }
    
    // 迁移数据到 IndexedDB
    if (bookmarks.length > 0) {
      console.log(`迁移 ${bookmarks.length} 个书签...`)
      await db.saveBookmarks(bookmarks)
    }
    
    if (folders.length > 0) {
      console.log(`迁移 ${folders.length} 个文件夹...`)
      await db.saveFolders(folders)
    }
    
    if (tags.length > 0) {
      console.log(`迁移 ${tags.length} 个标签...`)
      await db.saveTags(tags)
    }
    
    if (favoriteFolders.length > 0) {
      console.log(`迁移 ${favoriteFolders.length} 个收藏文件夹...`)
      await db.saveFavoriteFolders(favoriteFolders)
    }
    
    if (sortOption) {
      console.log("迁移排序选项...")
      await db.saveSortOption(sortOption)
    }
    
    if (searchFields.length > 0) {
      console.log(`迁移 ${searchFields.length} 个搜索字段...`)
      await db.saveSearchFields(searchFields)
    }
    
    if (appSettings) {
      console.log("迁移应用设置...")
      await db.saveAppSettings(appSettings)
    }
    
    // 记录迁移完成标志到 localStorage，防止重复迁移
    localStorage.setItem("indexedDB_migration_completed", "true")
    
    console.log("数据迁移完成")
    return true
  } catch (error) {
    console.error("数据迁移失败:", error)
    return false
  }
}

// 检查是否需要进行数据迁移
export function needMigration(): boolean {
  // 如果已经完成迁移，则不再需要迁移
  if (localStorage.getItem("indexedDB_migration_completed") === "true") {
    return false
  }
  
  // 检查是否有任何 localStorage 数据需要迁移
  // 检查常规数据项
  const hasMainData = (
    localStorage.getItem("bookmarks") !== null ||
    localStorage.getItem("bookmarks_chunks") !== null ||
    localStorage.getItem("folders") !== null ||
    localStorage.getItem("tags") !== null ||
    localStorage.getItem("favoriteFolders") !== null ||
    localStorage.getItem("appSettings") !== null
  )
  
  if (hasMainData) return true
  
  // 检查可能单独存储的设置项
  const possibleIndividualSettings = [
    "darkMode", "accentColor", "defaultView", "tagApiUrl", "tagApiKey", "tagConcurrencyLimit"
  ]
  
  return possibleIndividualSettings.some(key => localStorage.getItem(key) !== null)
}

// 清除 localStorage 中的旧数据
export function clearLocalStorageData(): void {
  // 清除书签数据
  localStorage.removeItem("bookmarks")
  
  // 清除分块存储的书签数据
  const chunksCount = localStorage.getItem("bookmarks_chunks")
  if (chunksCount) {
    const count = Number(chunksCount)
    for (let i = 0; i < count; i++) {
      localStorage.removeItem(`bookmarks_chunk_${i}`)
    }
    localStorage.removeItem("bookmarks_chunks")
  }
  
  // 清除其他数据
  localStorage.removeItem("folders")
  localStorage.removeItem("tags")
  localStorage.removeItem("favoriteFolders")
  localStorage.removeItem("sortOption")
  localStorage.removeItem("searchFields")
  localStorage.removeItem("appSettings")
  
  // 清除可能单独存储的设置项
  localStorage.removeItem("darkMode")
  localStorage.removeItem("accentColor")
  localStorage.removeItem("defaultView")
  localStorage.removeItem("tagApiUrl")
  localStorage.removeItem("tagApiKey")
  localStorage.removeItem("tagConcurrencyLimit")
  
  console.log("已清除 localStorage 中的旧数据")
}