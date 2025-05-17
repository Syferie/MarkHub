"use client"

import { useState, useEffect, useMemo } from "react"
import { Tabs, ActionIcon, TextInput, Button, Badge, Checkbox } from "@mantine/core"
import { IconSearch, IconPlus, IconAdjustments, IconFolder, IconSettings, IconStar, IconX } from "@tabler/icons-react"
import { AIClassificationIndicator } from "./ai-classification-indicator"
import ExtensionMessageListener from "./extension-message-listener"
import BookmarkList from "./bookmark-list"
import FolderTree from "./folder-tree"
import TagManager from "./tag-manager"
import AddBookmarkModal from "./add-bookmark-modal"
import SettingsModal from "./settings-modal"
import { useBookmarks } from "@/context/bookmark-context"
import { useLanguage } from "@/context/language-context"
import { uploadBookmarksToWebDAV } from "./webdav-sync"

export default function BookmarkDashboard() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [showSearchFilters, setShowSearchFilters] = useState(false)
  const {
    selectedFolderId,
    selectedTags,
    filteredBookmarks,
    folders,
    favoriteFolders,
    setSelectedFolderId,
    setSelectedTags,
    sortOptions,
    currentSortOption,
    setCurrentSortOption,
    searchFields,
    toggleSearchField,
    settings,
  } = useBookmarks()
  const { t } = useLanguage()
  const [folderName, setFolderName] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(settings?.defaultView || "all")

  // Update active tab when default view setting changes
  useEffect(() => {
    if (settings?.defaultView) {
      setActiveTab(settings.defaultView)
    }
  }, [settings?.defaultView])

  // 当用户通过文件夹树选择文件夹时，自动切换到"All bookmarks"标签
  // 这解决了用户在收藏文件夹标签激活时点击左侧文件夹树导致的显示问题
  useEffect(() => {
    // 只有当选择了文件夹且当前活动标签不是"all"时切换
    // 这避免了无限循环，因为Tabs组件的onChange也会更新selectedFolderId
    if (selectedFolderId && activeTab !== "all" && !favoriteFolders.includes(selectedFolderId)) {
      setActiveTab("all");
    }
  }, [selectedFolderId, activeTab, favoriteFolders]);

  // 使用新的 ExtensionMessageListener 组件替代直接编写在 BookmarkDashboard 中的消息处理逻辑
  // ExtensionMessageListener 组件不会渲染任何内容，只是设置事件监听器
  // 这样可以让组件职责更加清晰，AI分类任务由专门的组件处理

  useEffect(() => {
    const getFolderName = () => {
      if (!selectedFolderId || !Array.isArray(folders)) return null
      const folder = folders.find((f) => f && f.id === selectedFolderId)
      return folder ? folder.name : null
    }

    setFolderName(getFolderName())
  }, [selectedFolderId, folders])

  // 使用useMemo优化过滤书签的计算，避免不必要的重新计算
  const bookmarksToShow = useMemo(() => {
    return filteredBookmarks ? filteredBookmarks(activeTab, searchQuery, searchFields) : [];
  }, [filteredBookmarks, activeTab, searchQuery, searchFields, selectedFolderId, selectedTags, currentSortOption]);

  // Get favorite folders for tabs
  const favoriteFolderTabs =
    Array.isArray(favoriteFolders) && Array.isArray(folders)
      ? favoriteFolders
          .map((folderId) => {
            const folder = folders.find((f) => f && f.id === folderId)
            return folder ? { id: folder.id, name: folder.name } : null
          })
          .filter(Boolean)
      : []

  return (
    <div className="container mx-auto p-4 max-w-6xl h-screen overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <img src="/icon128.png" alt="MarkHub Logo" className="w-8 h-8 mr-2" />
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">MarkHub</h1>
        </div>
        <div className="flex space-x-2">
          <AIClassificationIndicator />
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setIsAddModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {t("dashboard.addBookmark")}
          </Button>
          <ActionIcon
            variant="light"
            onClick={() => setIsSettingsModalOpen(true)}
            size="lg"
            className="h-[36px] w-[36px] flex items-center justify-center"
          >
            <IconSettings size={20} />
          </ActionIcon>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[calc(100vh-100px)]">
        <div className="md:col-span-1 bg-white rounded-lg shadow p-4 overflow-auto">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">{t("dashboard.collections")}</h2>
          <FolderTree />

          <h2 className="text-lg font-semibold mb-4 mt-6 text-gray-700">{t("dashboard.tags")}</h2>
          <TagManager />
        </div>

        <div className="md:col-span-3 flex flex-col h-full">
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex items-center space-x-2 mb-4">
              <TextInput
                placeholder={t("dashboard.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-grow"
                leftSection={<IconSearch size={16} />}
              />
              <ActionIcon
                variant={showSearchFilters ? "filled" : "light"}
                color={showSearchFilters ? "blue" : "gray"}
                aria-label="Search settings"
                onClick={() => setShowSearchFilters(!showSearchFilters)}
              >
                <IconAdjustments size={20} />
              </ActionIcon>
            </div>

            {showSearchFilters && (
              <div className="mb-4 p-3 border border-gray-200 rounded-md bg-gray-50 slide-in">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-sm">{t("dashboard.searchFilters")}</span>
                  <ActionIcon size="sm" onClick={() => setShowSearchFilters(false)}>
                    <IconX size={16} />
                  </ActionIcon>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Checkbox
                    label={t("dashboard.title")}
                    checked={Array.isArray(searchFields) && searchFields.includes("title")}
                    onChange={() => toggleSearchField && toggleSearchField("title")}
                  />
                  <Checkbox
                    label={t("dashboard.url")}
                    checked={Array.isArray(searchFields) && searchFields.includes("url")}
                    onChange={() => toggleSearchField && toggleSearchField("url")}
                  />
                  <Checkbox
                    label={t("dashboard.tagsField")}
                    checked={Array.isArray(searchFields) && searchFields.includes("tags")}
                    onChange={() => toggleSearchField && toggleSearchField("tags")}
                  />
                </div>
              </div>
            )}

            {/* 始终显示过滤器区域，避免UI浮动 */}
            <div className="mb-3 flex flex-wrap items-center gap-2 min-h-[32px]">
              {selectedFolderId || (Array.isArray(selectedTags) && selectedTags.length > 0) ? (
                <>
                  <span className="text-sm text-gray-500">{t("dashboard.filteredBy")}</span>

                  {folderName && (
                    <Badge color="blue" variant="light" size="lg">
                      {t("dashboard.folder")} {folderName}
                    </Badge>
                  )}

                  {Array.isArray(selectedTags) &&
                    selectedTags.map((tag) => (
                      <Badge key={tag} color="green" variant="light" size="lg">
                        {t("dashboard.tag")} {tag}
                      </Badge>
                    ))}

                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => {
                      setSelectedFolderId && setSelectedFolderId(null)
                      setSelectedTags && setSelectedTags([])
                    }}
                  >
                    {t("dashboard.clearFilters")}
                  </Button>
                </>
              ) : (
                <span className="text-sm text-gray-400">{t("dashboard.noFilters")}</span>
              )}
            </div>

            <Tabs
              value={activeTab}
              onChange={(value) => {
                setActiveTab(value || "all")
                // If selecting a folder tab, set the selectedFolderId
                if (value !== "all" && value !== "favorites") {
                  setSelectedFolderId && setSelectedFolderId(value)
                } else if (value === "all") {
                  setSelectedFolderId && setSelectedFolderId(null)
                }
              }}
            >
              <Tabs.List>
                <Tabs.Tab value="all">{t("dashboard.allBookmarks")}</Tabs.Tab>
                <Tabs.Tab value="favorites" leftSection={<IconStar size={14} />}>
                  {t("dashboard.favorites")}
                </Tabs.Tab>
                {favoriteFolderTabs.map((folder) => (
                  <Tabs.Tab key={folder!.id} value={folder!.id} leftSection={<IconFolder size={14} />}>
                    {folder!.name}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          </div>

          <div className="bg-white rounded-lg shadow p-4 flex-grow overflow-hidden">
            <BookmarkList
              bookmarks={bookmarksToShow}
              searchQuery={searchQuery}
              sortOptions={sortOptions}
              currentSortOption={currentSortOption}
              setCurrentSortOption={setCurrentSortOption}
            />
          </div>
        </div>
      </div>

      <AddBookmarkModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} />
      {/* 添加消息监听器组件 */}
      <ExtensionMessageListener />
    </div>
  )
}
