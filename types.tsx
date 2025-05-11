export interface Bookmark {
  id: string
  title: string
  url: string
  folderId: string | null
  tags?: string[]
  createdAt: string
  favicon?: string
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
}
