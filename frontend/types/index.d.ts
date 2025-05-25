export interface Bookmark {
  id: string
  title: string
  url: string
  folderId?: string | null; // 明确标记为可选，并与 api-client.ts 保持一致
  tags?: string[]
  description?: string; // 书签描述信息
  img?: string; // 书签图片 URL 或路径
  createdAt: string
  updatedAt: string
  faviconUrl?: string | null;
  isFavorite?: boolean
}

export interface Folder {
  id: string
  name: string
  parentId?: string | null; // 明确标记为可选，并与 api-client.ts 保持一致
  createdAt: string
  updatedAt: string
}

export interface SortOption {
  value: string
  label: string
}

export interface ImportData {
  bookmarks: Bookmark[]
  folders: Folder[]
  tags: string[]
  favoriteFolders: string[]
  settings?: any
  exportDate?: string
}

export interface WebDAVConfigType {
  Url: string
  Username: string
  Password: string
  Path: string
  AutoSync: boolean
}

export interface UserSetting {
  id: string
  userId: string
  darkMode?: boolean
  accentColor?: string
  language?: string
  geminiApiKey?: string
  webdav_config?: WebDAVConfigType
  favoriteFolderIds?: string[]
  tagList?: string[]
  sortOption?: string // 例如 'created_desc', 'title_asc'
  searchFields?: string[] // 例如 ['title', 'url', 'tags']
  defaultView?: 'all' | 'favorites' | string // string for specific folder id
  geminiApiBaseUrl?: string
  geminiModelName?: string
  // PocketBase 集合中可能还有其他字段，如 created, updated
  created?: string
  updated?: string
}
