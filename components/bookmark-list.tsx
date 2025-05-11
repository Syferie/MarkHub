"use client"

import React, { type ReactNode, useState, MouseEvent } from "react"
import { ActionIcon, Badge, Text, Tooltip, Checkbox, Button, Group, Select } from "@mantine/core"
import {
  IconPencil,
  IconTrash,
  IconExternalLink,
  IconFolder,
  IconTag,
  IconStar,
  IconStarFilled,
  IconClock,
  IconCheck,
  IconSortAscending,
  IconX,
  IconRefresh,
} from "@tabler/icons-react"
import { useBookmarks } from "@/context/bookmark-context"
import EditBookmarkModal from "./edit-bookmark-modal"
import type { Bookmark } from "@/types"

// 添加 isFavorite 属性到 Bookmark 接口
interface ExtendedBookmark extends Bookmark {
  isFavorite?: boolean;
}
// @ts-ignore - 忽略类型检查，因为我们无法安装类型声明包
import { VariableSizeList as List } from "react-window"
// @ts-ignore - 忽略类型检查，因为我们无法安装类型声明包
import AutoSizer from "react-virtualized-auto-sizer"

interface BookmarkListProps {
  bookmarks: ExtendedBookmark[]
  searchQuery?: string
  sortOptions?: { value: string; label: string }[]
  currentSortOption?: string
  setCurrentSortOption?: (option: string) => void
}

export default function BookmarkList({
  bookmarks,
  searchQuery = "",
  sortOptions = [],
  currentSortOption = "newest",
  setCurrentSortOption,
}: BookmarkListProps) {
  const { deleteBookmark, folders, setSelectedFolderId, setSelectedTags, toggleFavoriteBookmark } =
    useBookmarks()
  const [editingBookmark, setEditingBookmark] = useState<ExtendedBookmark | null>(null)
  const [selectedBookmarks, setSelectedBookmarks] = useState<string[]>([])
  const [bulkMode, setBulkMode] = useState(false)
  const [showBulkActions, setShowBulkActions] = useState(false)

  const getFolderName = (folderId: string | null) => {
    if (!folderId || !Array.isArray(folders)) return null
    const folder = folders.find((f) => f && f.id === folderId)
    return folder ? folder.name : null
  }

  const handleTagClick = (tag: string, e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedTags && setSelectedTags([tag])
  }

  const handleFolderClick = (folderId: string | null, e: MouseEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (folderId) {
      setSelectedFolderId && setSelectedFolderId(folderId)
    }
  }

  const handleDeleteBookmark = (id: string, e: MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    deleteBookmark && deleteBookmark(id)
  }

  const handleToggleFavorite = (id: string, e: MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    toggleFavoriteBookmark && toggleFavoriteBookmark(id)
  }

  const toggleBookmarkSelection = (id: string) => {
    setSelectedBookmarks((prev) => (prev.includes(id) ? prev.filter((bookmarkId) => bookmarkId !== id) : [...prev, id]))
  }

  const toggleAllBookmarks = () => {
    if (selectedBookmarks.length === bookmarks.length) {
      setSelectedBookmarks([])
    } else {
      setSelectedBookmarks(bookmarks.map((b) => b.id))
    }
  }

  const handleBulkDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedBookmarks.length} bookmarks?`)) {
      selectedBookmarks.forEach((id) => {
        deleteBookmark && deleteBookmark(id)
      })
      setSelectedBookmarks([])
      setBulkMode(false)
      setShowBulkActions(false)
    }
  }

  const handleBulkFavorite = (favorite: boolean) => {
    selectedBookmarks.forEach((id) => {
      const bookmark = bookmarks.find((b) => b.id === id)
      if (bookmark && bookmark.isFavorite !== favorite) {
        toggleFavoriteBookmark && toggleFavoriteBookmark(id)
      }
    })
    setSelectedBookmarks([])
    setBulkMode(false)
    setShowBulkActions(false)
  }

  // 移除 handleRefreshFavicons 函数，不再需要

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diffTime = Math.abs(now.getTime() - date.getTime())
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

      if (diffDays === 0) {
        return "Today"
      } else if (diffDays === 1) {
        return "Yesterday"
      } else if (diffDays < 7) {
        return `${diffDays} days ago`
      } else {
        return date.toLocaleDateString()
      }
    } catch (e) {
      return "Unknown date"
    }
  }

  // Highlight search matches
  const highlightText = (text: string, query: string): ReactNode => {
    if (!query || !text) return text || ""

    try {
      const regex = new RegExp(`(${query})`, "gi")
      const parts = text.split(regex)

      return (
        <>
          {parts.map((part, i) =>
            regex.test(part) ? (
              <mark key={i} className="bg-yellow-200">
                {part}
              </mark>
            ) : (
              part
            ),
          )}
        </>
      )
    } catch (e) {
      // If regex fails (e.g., with special characters), return the original text
      return text
    }
  }

  // 使用React.memo优化BookmarkItem组件
  const BookmarkItem = React.memo(({
    bookmark,
    index,
    style,
  }: { bookmark: ExtendedBookmark; index: number; style: React.CSSProperties }) => {
    if (!bookmark) return null

    const folderName = getFolderName(bookmark.folderId)
    const isFavorite = bookmark.isFavorite
    const isSelected = selectedBookmarks.includes(bookmark.id)

    // 修改样式，减少间距
    return (
      <div
        style={{
          ...style,
          height: "auto", // 允许内容决定高度
          paddingTop: "4px",
          paddingBottom: "4px",
        }}
        className={`${index % 2 === 0 ? "bg-gray-50 dark:bg-gray-800" : ""}`}
      >
        <div
          className={`flex items-start justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-all duration-200 bookmark-item hover:shadow-sm ${
            isSelected ? "bg-blue-50 border-blue-200" : ""
          }`}
        >
          <div className="flex items-start space-x-3">
            {bulkMode && (
              <Checkbox checked={isSelected} onChange={() => toggleBookmarkSelection(bookmark.id)} className="mt-1" />
            )}
            <div className="w-8 h-8 flex-shrink-0 bg-gray-100 rounded-md flex items-center justify-center overflow-hidden transition-all duration-200 hover:shadow-inner">
              {/* 简化为始终使用标题首字母作为图标 */}
              <div className="w-6 h-6 bg-blue-500 rounded-sm flex items-center justify-center text-white font-bold transition-transform duration-200 hover:scale-110">
                {bookmark.title?.charAt(0)?.toUpperCase() || "B"}
              </div>
            </div>

            <div>
              <a
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg font-medium text-gray-800 hover:text-blue-600 transition-colors duration-200 flex items-center"
              >
                {highlightText(bookmark.title || "", searchQuery)}
                <IconExternalLink
                  size={16}
                  className="ml-1 text-gray-400 transition-transform duration-200 hover:translate-x-1"
                />
              </a>

              <Text size="sm" className="text-gray-500 mt-1 truncate max-w-md">
                {highlightText(bookmark.url || "", searchQuery)}
              </Text>

              <div className="flex flex-wrap gap-2 mt-2">
                <Tooltip label="Added date" withArrow>
                  <Badge size="sm" color="gray" variant="outline" leftSection={<IconClock size={12} />}>
                    {formatDate(bookmark.createdAt)}
                  </Badge>
                </Tooltip>

                {folderName && (
                  <Tooltip label="Click to filter by this folder" withArrow>
                    <Badge
                      size="sm"
                      color="blue"
                      variant="outline"
                      leftSection={<IconFolder size={12} />}
                      className="cursor-pointer transition-all duration-200 hover:bg-blue-50 filter-badge"
                      onClick={(e) => handleFolderClick(bookmark.folderId, e)}
                    >
                      {folderName}
                    </Badge>
                  </Tooltip>
                )}

                {Array.isArray(bookmark.tags) &&
                  bookmark.tags.length > 0 &&
                  bookmark.tags.map((tag: string) => (
                    <Tooltip key={tag} label="Click to filter by this tag" withArrow>
                      <Badge
                        size="sm"
                        color="green"
                        variant="light"
                        leftSection={<IconTag size={12} />}
                        className="cursor-pointer transition-all duration-200 hover:bg-green-50 filter-badge"
                        onClick={(e) => handleTagClick(tag, e)}
                      >
                        {highlightText(tag, searchQuery)}
                      </Badge>
                    </Tooltip>
                  ))}
              </div>
            </div>
          </div>

          {!bulkMode && (
            <div className="flex space-x-1">
              <Tooltip label={isFavorite ? "Remove from favorites" : "Add to favorites"} withArrow>
                <ActionIcon
                  variant="subtle"
                  color={isFavorite ? "yellow" : "gray"}
                  className="transition-all duration-200 hover:bg-yellow-50"
                  onClick={(e) => handleToggleFavorite(bookmark.id, e)}
                >
                  {isFavorite ? <IconStarFilled size={18} /> : <IconStar size={18} />}
                </ActionIcon>
              </Tooltip>
              <ActionIcon
                variant="subtle"
                className="transition-all duration-200 hover:bg-blue-50"
                onClick={() => setEditingBookmark(bookmark)}
              >
                <IconPencil size={18} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                className="transition-all duration-200 hover:bg-red-50"
                onClick={(e) => handleDeleteBookmark(bookmark.id, e)}
              >
                <IconTrash size={18} />
              </ActionIcon>
            </div>
          )}
        </div>
      </div>
    )
  }, (prevProps, nextProps) => {
    // 优化重新渲染逻辑，只有在这些属性改变时才重新渲染
    return (
      prevProps.bookmark.id === nextProps.bookmark.id &&
      prevProps.bookmark.title === nextProps.bookmark.title &&
      prevProps.bookmark.url === nextProps.bookmark.url &&
      prevProps.bookmark.isFavorite === nextProps.bookmark.isFavorite &&
      prevProps.bookmark.folderId === nextProps.bookmark.folderId &&
      prevProps.style === nextProps.style &&
      selectedBookmarks.includes(prevProps.bookmark.id) ===
      selectedBookmarks.includes(nextProps.bookmark.id)
    );
  });
  
  // 创建虚拟列表的记忆化组件
  const MemoizedVirtualList = React.memo(({ bookmarks }: { bookmarks: ExtendedBookmark[] }) => {
    // 动态调整项目大小，减少内存占用
    const getItemSize = (index: number) => {
      const bookmark = bookmarks[index];
      // 基础高度 + 根据标签数量增加高度
      return 120 + (bookmark?.tags?.length || 0) * 5;
    };
    
    // 为虚拟列表组件定义类型
    interface ListChildComponentProps {
      index: number;
      style: React.CSSProperties;
    }
    
    // 使用变量渲染列表，减少嵌套组件数量
    return (
      // @ts-ignore - 忽略类型检查，因为我们无法安装类型声明包
      <AutoSizer>
        {({ height, width }: { height: number; width: number }) => (
          // @ts-ignore - 忽略类型检查，因为我们无法安装类型声明包
          <List
            className="bookmark-list"
            height={height}
            width={width}
            itemCount={bookmarks.length}
            // 使用动态计算的高度，VariableSizeList支持函数形式的itemSize
            itemSize={getItemSize}
            // 减少overscanCount以减少内存使用
            overscanCount={3}
          >
            {({ index, style }: ListChildComponentProps) => (
              <BookmarkItem
                bookmark={bookmarks[index]}
                index={index}
                style={style}
              />
            )}
          </List>
        )}
      </AutoSizer>
    );
  }, (prevProps, nextProps) => {
    // 只在书签列表长度变化或书签ID列表变化时才重新渲染
    if (prevProps.bookmarks.length !== nextProps.bookmarks.length) {
      return false;
    }
    
    // 检查ID是否变化（简化比较逻辑，只比较ID，减少深度比较导致的性能问题）
    const prevIds = prevProps.bookmarks.map(b => b.id).join(',');
    const nextIds = nextProps.bookmarks.map(b => b.id).join(',');
    return prevIds === nextIds;
  });

  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return (
      <div className="text-center py-10 fade-in">
        <Text size="lg" className="text-gray-500">
          No bookmarks found
        </Text>
        <Text size="sm" className="text-gray-400 mt-2">
          Add some bookmarks or adjust your filters
        </Text>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          {bulkMode && (
            <Text size="sm" className="text-gray-500">
              {selectedBookmarks.length} of {bookmarks.length} selected
            </Text>
          )}
        </div>
        <Group gap="xs">
          {bulkMode ? (
            <>
              <Button size="xs" variant="outline" onClick={toggleAllBookmarks} leftSection={<IconCheck size={14} />}>
                {selectedBookmarks.length === bookmarks.length ? "Deselect All" : "Select All"}
              </Button>

              <Button
                size="xs"
                color={showBulkActions ? "blue" : "gray"}
                variant={showBulkActions ? "filled" : "light"}
                onClick={() => setShowBulkActions(!showBulkActions)}
                disabled={selectedBookmarks.length === 0}
              >
                Actions
              </Button>

              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  setBulkMode(false)
                  setSelectedBookmarks([])
                  setShowBulkActions(false)
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="xs" variant="light" onClick={() => setBulkMode(true)}>
                Bulk Edit
              </Button>
              {Array.isArray(sortOptions) && sortOptions.length > 0 && setCurrentSortOption && (
                <Select
                  size="xs"
                  data={sortOptions}
                  value={currentSortOption}
                  onChange={(value) => setCurrentSortOption(value || "newest")}
                  leftSection={<IconSortAscending size={14} />}
                  placeholder="Sort by"
                />
              )}
            </>
          )}
        </Group>
      </div>

      {showBulkActions && selectedBookmarks.length > 0 && (
        <div className="mb-4 p-3 border border-gray-200 rounded-md bg-gray-50 slide-in">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium text-sm">Bulk Actions</span>
            <ActionIcon size="sm" onClick={() => setShowBulkActions(false)}>
              <IconX size={16} />
            </ActionIcon>
          </div>
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconStarFilled size={14} />}
              onClick={() => handleBulkFavorite(true)}
            >
              Add to Favorites
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconStar size={14} />}
              onClick={() => handleBulkFavorite(false)}
            >
              Remove from Favorites
            </Button>
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={handleBulkDelete}
            >
              Delete Selected
            </Button>
          </Group>
        </div>
      )}

      <div className="h-[calc(100vh-300px)] w-full">
        {/* 使用React.memo优化组件渲染 */}
        <MemoizedVirtualList bookmarks={bookmarks} />
      </div>

      {editingBookmark && (
        <EditBookmarkModal
          bookmark={editingBookmark}
          isOpen={!!editingBookmark}
          onClose={() => setEditingBookmark(null)}
        />
      )}
    </div>
  )
}
