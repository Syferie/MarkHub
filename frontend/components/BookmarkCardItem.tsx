"use client"

import React, { type MouseEvent, useState } from "react"
import { ActionIcon, Badge, Text, Tooltip } from "@mantine/core"
import {
  IconPencil,
  IconTrash,
  IconExternalLink,
  IconFolder,
  IconStar,
  IconStarFilled,
  IconClock,
  IconDotsVertical,
  IconEye,
  IconCopy,
  IconRefresh,
} from "@tabler/icons-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Bookmark } from "@/lib/schemas"
import { useLanguage } from "@/context/language-context"
import BookmarkDetailModal from "./bookmark-detail-modal"

interface BookmarkCardItemProps {
  bookmark: Bookmark
  isSelected: boolean
  bulkMode: boolean
  onToggleSelection: (id: string) => void
  onEdit: (bookmark: Bookmark) => void
  onDelete: (id: string, e: MouseEvent<HTMLElement>) => void
  onToggleFavorite: (id: string, e: MouseEvent<HTMLElement>) => void
  onTagClick: (tag: string, e: MouseEvent<HTMLElement>) => void
  onFolderClick: (folderId: string | null | undefined, e: MouseEvent<HTMLElement>) => void
  getFolderName: (folderId: string | null | undefined) => string | null
  formatDate: (dateString: string) => string
}

const BookmarkCardItem = React.memo(function BookmarkCardItem({
  bookmark,
  isSelected,
  bulkMode,
  onToggleSelection,
  onEdit,
  onDelete,
  onToggleFavorite,
  onTagClick,
  onFolderClick,
  getFolderName,
  formatDate,
}: BookmarkCardItemProps) {
  const { t } = useLanguage()
  const [showDetailModal, setShowDetailModal] = useState(false)
  const folderName = getFolderName(bookmark.folderId)
  const isFavorite = bookmark.isFavorite

  const handleCardClick = () => {
    if (bulkMode) {
      onToggleSelection(bookmark.id)
    } else {
      window.open(bookmark.url, "_blank")
    }
  }

  const handleEditClick = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    onEdit(bookmark)
  }

  const handleDetailClick = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    setShowDetailModal(true)
  }

  const handleCopyLink = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    navigator.clipboard.writeText(bookmark.url)
    // 这里可以添加 toast 提示
  }

  const handleRefresh = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    // 这里可以添加刷新逻辑，比如重新获取 favicon
  }

  const handleDetailModalEdit = (bookmark: Bookmark) => {
    onEdit(bookmark)
  }

  const handleDetailModalDelete = (id: string) => {
    const mockEvent = {
      stopPropagation: () => {},
      preventDefault: () => {},
      currentTarget: null,
      target: null,
    } as unknown as MouseEvent<HTMLElement>
    onDelete(id, mockEvent)
  }

  const handleDetailModalToggleFavorite = (id: string) => {
    const mockEvent = {
      stopPropagation: () => {},
      preventDefault: () => {},
      currentTarget: null,
      target: null,
    } as unknown as MouseEvent<HTMLElement>
    onToggleFavorite(id, mockEvent)
  }

  const handleDetailModalTagClick = (tag: string) => {
    const mockEvent = {
      stopPropagation: () => {},
      preventDefault: () => {},
      currentTarget: null,
      target: null,
    } as unknown as MouseEvent<HTMLElement>
    onTagClick(tag, mockEvent)
  }

  const handleDetailModalFolderClick = (folderId: string | null | undefined) => {
    const mockEvent = {
      stopPropagation: () => {},
      preventDefault: () => {},
      currentTarget: null,
      target: null,
    } as unknown as MouseEvent<HTMLElement>
    onFolderClick(folderId, mockEvent)
  }

  // 截断描述文本
  const truncateDescription = (text: string, maxLength: number = 80) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  return (
    <>
      <div
        className={`
          group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700
          shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden min-h-[200px]
          ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}
          ${bulkMode ? 'hover:bg-gray-50 dark:hover:bg-gray-700' : 'hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-900/10'}
        `}
        onClick={handleCardClick}
      >
        {/* 批量选择复选框 */}
        {bulkMode && (
          <div className="absolute top-3 left-3 z-10">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelection(bookmark.id)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* 图片预览区域 */}
        {bookmark.img && (
          <div className="relative w-full h-48 overflow-hidden">
            <img
              src={bookmark.img}
              alt={bookmark.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
        )}

        {/* 内容区域 */}
        <div className={`p-4 ${bulkMode && !bookmark.img ? 'ml-6' : ''}`}>
          {/* 标题 */}
          <div className="mb-3">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight mb-2 overflow-hidden"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}>
              {bookmark.title}
            </h3>

            {/* 描述摘要 */}
            {bookmark.description && (
              <Text
                size="sm"
                className="text-gray-600 dark:text-gray-300 leading-relaxed mb-3"
              >
                {truncateDescription(bookmark.description)}
              </Text>
            )}
          </div>

          {/* 文件夹和标签同一排 */}
          {(folderName || (bookmark.tags && bookmark.tags.length > 0)) && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {/* 文件夹 */}
              {folderName && (
                <Tooltip label="点击筛选此文件夹" withArrow>
                  <Badge
                    variant="light"
                    color="blue"
                    size="sm"
                    leftSection={<IconFolder size={12} />}
                    className="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    onClick={(e) => onFolderClick(bookmark.folderId, e)}
                  >
                    {folderName}
                  </Badge>
                </Tooltip>
              )}

              {/* 标签 */}
              {bookmark.tags && bookmark.tags.length > 0 && (
                <>
                  {bookmark.tags.slice(0, 2).map((tag: string) => (
                    <Tooltip key={tag} label="点击筛选此标签" withArrow>
                      <Badge
                        variant="outline"
                        color="gray"
                        size="sm"
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                        onClick={(e) => onTagClick(tag, e)}
                      >
                        {tag}
                      </Badge>
                    </Tooltip>
                  ))}
                  {bookmark.tags.length > 2 && (
                    <Badge variant="outline" color="gray" size="sm">
                      +{bookmark.tags.length - 2}
                    </Badge>
                  )}
                </>
              )}
            </div>
          )}

          {/* 底部信息和操作按钮 */}
          <div className="flex items-center justify-between">
            {/* 左侧：URL 和时间 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {bookmark.favicon && (
                  <img
                    src={bookmark.favicon}
                    alt=""
                    className="w-3 h-3 flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                )}
                <Text
                  size="xs"
                  className="text-gray-500 dark:text-gray-400 truncate"
                  title={bookmark.url}
                >
                  {new URL(bookmark.url).hostname}
                </Text>
              </div>
              <div className="flex items-center gap-1">
                <IconClock size={12} className="text-gray-400" />
                <Text size="xs" className="text-gray-500 dark:text-gray-400">
                  {formatDate(bookmark.createdAt || bookmark.created || '')}
                </Text>
              </div>
            </div>

            {/* 右侧：操作按钮 */}
            <div className="flex items-center gap-1 ml-2">
              {/* 收藏按钮 */}
              <Tooltip label={isFavorite ? "取消收藏" : "收藏"} withArrow>
                <ActionIcon
                  variant="subtle"
                  color={isFavorite ? "yellow" : "gray"}
                  size="sm"
                  onClick={(e) => onToggleFavorite(bookmark.id, e)}
                >
                  {isFavorite ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                </ActionIcon>
              </Tooltip>

              {/* 预览按钮 */}
              <Tooltip label="查看详情" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={handleDetailClick}
                >
                  <IconEye size={14} />
                </ActionIcon>
              </Tooltip>

              {/* 更多操作下拉菜单 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconDotsVertical size={14} />
                  </ActionIcon>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handleEditClick}>
                    <IconPencil size={14} className="mr-2" />
                    编辑
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyLink}>
                    <IconCopy size={14} className="mr-2" />
                    复制链接
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRefresh}>
                    <IconRefresh size={14} className="mr-2" />
                    刷新
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => onDelete(bookmark.id, e as any)}
                    className="text-red-600 focus:text-red-600"
                  >
                    <IconTrash size={14} className="mr-2" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* 书签详情模态框 */}
      <BookmarkDetailModal
        bookmark={bookmark}
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        onEdit={handleDetailModalEdit}
        onDelete={handleDetailModalDelete}
        onToggleFavorite={handleDetailModalToggleFavorite}
        onTagClick={handleDetailModalTagClick}
        onFolderClick={handleDetailModalFolderClick}
        getFolderName={getFolderName}
        formatDate={formatDate}
      />
    </>
  )
})

export default BookmarkCardItem