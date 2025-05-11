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

interface ImportData {
  bookmarks: Bookmark[]
  folders: Folder[]
  tags: string[]
  favoriteFolders: string[]
  settings?: any
  exportDate?: string
}
