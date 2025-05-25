"use client"

import React from "react"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter 
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  IconExternalLink, 
  IconPencil, 
  IconTrash, 
  IconStar, 
  IconStarFilled,
  IconFolder,
  IconClock,
  IconCalendar,
  IconLink
} from "@tabler/icons-react"
import type { Bookmark } from "@/lib/schemas"
import { useLanguage } from "@/context/language-context"

interface BookmarkDetailModalProps {
  bookmark: Bookmark | null
  isOpen: boolean
  onClose: () => void
  onEdit: (bookmark: Bookmark) => void
  onDelete: (id: string) => void
  onToggleFavorite: (id: string) => void
  onTagClick: (tag: string) => void
  onFolderClick: (folderId: string | null | undefined) => void
  getFolderName: (folderId: string | null | undefined) => string | null
  formatDate: (dateString: string) => string
}

export default function BookmarkDetailModal({
  bookmark,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onToggleFavorite,
  onTagClick,
  onFolderClick,
  getFolderName,
  formatDate,
}: BookmarkDetailModalProps) {
  const { t } = useLanguage()

  if (!bookmark) return null

  const folderName = getFolderName(bookmark.folderId)
  const isFavorite = bookmark.isFavorite

  const handleEdit = () => {
    onEdit(bookmark)
    onClose()
  }

  const handleDelete = () => {
    onDelete(bookmark.id)
    onClose()
  }

  const handleToggleFavorite = () => {
    onToggleFavorite(bookmark.id)
  }

  const handleTagClick = (tag: string, e: React.MouseEvent) => {
    e.preventDefault()
    onTagClick(tag)
    onClose()
  }

  const handleFolderClick = (e: React.MouseEvent) => {
    e.preventDefault()
    onFolderClick(bookmark.folderId)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3 text-left">
            {bookmark.favicon && (
              <img
                src={bookmark.favicon}
                alt=""
                className="w-6 h-6 mt-1 flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {bookmark.title}
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <IconLink size={14} className="text-gray-400" />
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate"
                >
                  {bookmark.url}
                </a>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 图片预览 */}
          {bookmark.img && (
            <div className="w-full">
              <img
                src={bookmark.img}
                alt={bookmark.title}
                className="w-full max-h-64 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            </div>
          )}

          {/* 描述 */}
          {bookmark.description && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                描述
              </h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                {bookmark.description}
              </p>
            </div>
          )}

          {/* 文件夹信息 */}
          {folderName && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                文件夹
              </h3>
              <Badge
                variant="secondary"
                className="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20"
                onClick={handleFolderClick}
              >
                <IconFolder size={12} className="mr-1" />
                {folderName}
              </Badge>
            </div>
          )}

          {/* 标签 */}
          {bookmark.tags && bookmark.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                标签
              </h3>
              <div className="flex flex-wrap gap-2">
                {bookmark.tags.map((tag: string) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={(e) => handleTagClick(tag, e)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* 时间信息 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <IconCalendar size={14} />
              <span>创建时间: {formatDate(bookmark.createdAt || bookmark.created || '')}</span>
            </div>
            {bookmark.updatedAt && bookmark.updatedAt !== bookmark.createdAt && (
              <div className="flex items-center gap-2">
                <IconClock size={14} />
                <span>更新时间: {formatDate(bookmark.updatedAt || bookmark.updated || '')}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0">
          <div className="flex gap-2 sm:mr-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(bookmark.url, "_blank")}
            >
              <IconExternalLink size={16} className="mr-2" />
              打开链接
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleFavorite}
              className={isFavorite ? "text-yellow-600 border-yellow-600" : ""}
            >
              {isFavorite ? <IconStarFilled size={16} className="mr-2" /> : <IconStar size={16} className="mr-2" />}
              {isFavorite ? "取消收藏" : "收藏"}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleEdit}>
              <IconPencil size={16} className="mr-2" />
              编辑
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <IconTrash size={16} className="mr-2" />
              删除
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}