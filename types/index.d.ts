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
