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
          shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden flex flex-col
          ${bookmark.img ? 'h-auto' : 'h-32'}
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

        {/* 右上角操作按钮 */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* 收藏按钮 */}
          <Tooltip label={isFavorite ? "取消收藏" : "收藏"} withArrow>
            <ActionIcon
              variant="subtle"
              color={isFavorite ? "yellow" : "gray"}
              size="sm"
              className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-sm hover:bg-white dark:hover:bg-gray-700"
              onClick={(e) => onToggleFavorite(bookmark.id, e)}
            >
              {isFavorite ? <IconStarFilled size={16} /> : <IconStar size={16} />}
            </ActionIcon>
          </Tooltip>

          {/* 预览按钮 */}
          <Tooltip label="查看详情" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-sm hover:bg-white dark:hover:bg-gray-700"
              onClick={handleDetailClick}
            >
              <IconEye size={16} />
            </ActionIcon>
          </Tooltip>

          {/* 更多操作下拉菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-sm hover:bg-white dark:hover:bg-gray-700"
                onClick={(e) => e.stopPropagation()}
              >
                <IconDotsVertical size={16} />
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

        {/* 图片预览区域 - 2:1 比例 */}
        {bookmark.img && (
          <div className="relative w-full overflow-hidden" style={{ aspectRatio: '2/1' }}>
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

        {/* 内容区域 - 使用flex布局让底部固定 */}
        <div className={`p-3 flex flex-col ${bookmark.img ? 'flex-1' : 'h-full'} ${bulkMode && !bookmark.img ? 'ml-6' : ''}`}>
          {/* 上半部分内容 */}
          <div className="flex-1">
            {/* 标题 - 固定一行 */}
            <div className="mb-2">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm leading-tight mb-1 overflow-hidden whitespace-nowrap text-ellipsis">
                {bookmark.title}
              </h3>

              {/* 描述摘要 - 固定两行 */}
              {bookmark.description && (
                <Text
                  size="xs"
                  className="text-gray-600 dark:text-gray-300 leading-tight mb-2 overflow-hidden"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {bookmark.description}
                </Text>
              )}
            </div>

            {/* 文件夹和标签同一排 */}
            {(folderName || (bookmark.tags && bookmark.tags.length > 0)) && (
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {/* 文件夹 */}
                {folderName && (
                  <Tooltip label="点击筛选此文件夹" withArrow className="cursor-pointer">
                    <Badge
                      variant="light"
                      color="blue"
                      size="sm"
                      leftSection={<IconFolder size={20} />}
                      className="hover:bg-blue-100 dark:hover:bg-blue-900/30"
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
                      <Tooltip key={tag} label="点击筛选此标签" withArrow className="cursor-pointer">
                        <Badge
                          variant="outline"
                          color="gray"
                          size="sm"
                          className="hover:bg-gray-50 dark:hover:bg-gray-700"
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
          </div>

          {/* 底部信息 - 固定在底部 */}
          <div className="mt-auto">
            {/* URL 和时间同一行 */}
            <div className="flex items-center gap-2">
              {bookmark.favicon && (
                <img
                  src={bookmark.favicon}
                  alt=""
                  className="w-4 h-4 flex-shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}
              <Text
                size="sm"
                className="text-gray-600 dark:text-gray-300 truncate flex-1 font-medium"
                title={bookmark.url}
              >
                {new URL(bookmark.url).hostname}
              </Text>
              <div className="flex items-center gap-1 flex-shrink-0">
                <IconClock size={14} className="text-gray-400" />
                <Text size="sm" className="text-gray-600 dark:text-gray-300 whitespace-nowrap font-medium">
                  {formatDate(bookmark.createdAt || bookmark.created || '')}
                </Text>
              </div>
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