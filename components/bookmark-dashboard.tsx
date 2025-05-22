"use client"

import { useState, useEffect, useMemo } from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { Tabs, ActionIcon, TextInput, Button, Badge, Checkbox, Anchor, Text } from "@mantine/core"
import { IconSearch, IconPlus, IconAdjustments, IconFolder, IconSettings, IconStar, IconX, IconTags } from "@tabler/icons-react"
import { useAuth } from "@/context/auth-context" // 导入认证上下文
import Link from "next/link" // 导入Link组件用于导航
import BookmarkList from "./bookmark-list"
import FolderTree from "./folder-tree"
// import TagManager from "./tag-manager" // 旧的 TagManager 不再直接使用
import TagPanel from "./tag-panel" // 导入新的 TagPanel
import AddBookmarkModal from "./add-bookmark-modal"
import SettingsModal from "./settings-modal"
import ActiveFiltersDisplay from "./ActiveFiltersDisplay" // 导入新的筛选条件显示组件
import { useBookmarks } from "@/context/bookmark-context"
import { useLanguage } from "@/context/language-context"
import { uploadBookmarksToWebDAV } from "./webdav-sync"

export default function BookmarkDashboard() {
  // Re-evaluating types
  const [searchQuery, setSearchQuery] = useState("")
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isTagPanelOpen, setIsTagPanelOpen] = useState(false) // 新增状态控制 TagPanel
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
    // settings, // settings is now managed by AuthContext
  } = useBookmarks()
  const { userSettings } = useAuth() // Get userSettings from AuthContext
  const { t } = useLanguage()
  const [folderName, setFolderName] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(userSettings?.defaultView || "all")

  // Update active tab when default view setting changes from AuthContext
  useEffect(() => {
    if (userSettings?.defaultView) {
      setActiveTab(userSettings.defaultView)
    }
  }, [userSettings?.defaultView])

  // 当用户通过文件夹树选择文件夹时，自动切换到"All bookmarks"标签
  // 这解决了用户在收藏文件夹标签激活时点击左侧文件夹树导致的显示问题
  useEffect(() => {
    // 只有当选择了文件夹且当前活动标签不是"all"时切换
    // 这避免了无限循环，因为Tabs组件的onChange也会更新selectedFolderId
    if (selectedFolderId && activeTab !== "all" && !favoriteFolders.includes(selectedFolderId)) {
      setActiveTab("all");
    }
  }, [selectedFolderId, activeTab, favoriteFolders]);

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

  // 使用移动设备检测hook
  const isMobile = useIsMobile();
  
  // 引入认证上下文以访问用户信息和退出功能
  const { user, logout } = useAuth();

  return (
    <div className="container mx-auto p-4 max-w-6xl h-screen overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <img src="/icon128.png" alt="MarkHub Logo" className="w-8 h-8 mr-2" />
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">MarkHub</h1>
        </div>
        {/* 用户信息/退出按钮 或 登录/注册按钮 放在顶部栏原先按钮的位置 */}
        {user ? (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              欢迎, {user.email || user.name || '用户'}
            </span>
            <Button variant="default" onClick={logout} size="sm">
              退出
            </Button>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <Button component={Link} href="/login" variant="default" size="sm">
              登录
            </Button>
            <Button component={Link} href="/register" variant="outline" size="sm" ml="xs">
              注册
            </Button>
          </div>
        )}
      </div>

      {/* 移动端使用选项卡切换文件夹/标签和书签列表 */}
      {isMobile ? (
        <div className="flex flex-col h-[calc(100vh-100px)]">
          <Tabs defaultValue="bookmarks">
            <Tabs.List>
              <Tabs.Tab value="folders" leftSection={<IconFolder size={16} />}>
                {t("dashboard.collections")}
              </Tabs.Tab>
              <Tabs.Tab value="bookmarks" leftSection={<IconPlus size={16} />}>
                {t("dashboard.allBookmarks")}
              </Tabs.Tab>
            </Tabs.List>
            
            <Tabs.Panel value="folders" className="h-[calc(100vh-150px)] overflow-auto">
              <div className="bg-white rounded-lg shadow p-4 mb-4 mt-2">
                <h2 className="text-lg font-semibold mb-4 text-gray-700">{t("dashboard.collections")}</h2>
                <FolderTree />
                {/* 移动端不再显示旧的 TagManager */}
                {/* <h2 className="text-lg font-semibold mb-4 mt-6 text-gray-700">{t("dashboard.tags")}</h2> */}
                {/* <TagManager /> */}
              </div>
            </Tabs.Panel>
            
            <Tabs.Panel value="bookmarks" className="h-[calc(100vh-150px)] overflow-auto">
              <div className="bg-white rounded-lg shadow p-4 mb-4 mt-2">
                <div className="flex items-center space-x-2 mb-4">
                  <TextInput
                    placeholder={t("dashboard.search")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-grow"
                    leftSection={<IconSearch size={16} />}
                  />
                  <div className="flex items-center space-x-2">
                    {/* 筛选按钮 */}
                    <ActionIcon
                      variant={showSearchFilters ? "filled" : "light"}
                      color={showSearchFilters ? "blue" : "gray"}
                      aria-label="Search settings"
                      onClick={() => setShowSearchFilters(!showSearchFilters)}
                    >
                      <IconAdjustments size={20} />
                    </ActionIcon>
                    
                    {/* 设置齿轮按钮 */}
                    <ActionIcon
                      variant="light"
                      onClick={() => setIsSettingsModalOpen(true)}
                      size="md"
                    >
                      <IconSettings size={18} />
                    </ActionIcon>
                    
                  </div>
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
    
                {/* 使用新的 ActiveFiltersDisplay 组件 */}
                <ActiveFiltersDisplay
                  selectedFolderId={selectedFolderId}
                  selectedTags={selectedTags}
                  folders={folders}
                  setSelectedFolderId={setSelectedFolderId}
                  setSelectedTags={setSelectedTags}
                  setActiveTab={setActiveTab}
                  t={t}
                />
    
                <Tabs
                  value={activeTab}
                  onChange={(value) => {
                    const newActiveTab = value || "all";
                    setActiveTab(newActiveTab);

                    if (newActiveTab === "favorites") {
                      // 当点击 "收藏夹" 时，清除文件夹选择
                      setSelectedFolderId && setSelectedFolderId(null);
                    } else if (newActiveTab !== "all") {
                      // 如果是其他文件夹标签 (不是 "all" 也不是 "favorites")
                      // 这些是收藏的文件夹，其 value 是 folderId
                      setSelectedFolderId && setSelectedFolderId(newActiveTab);
                    } else { // newActiveTab === "all"
                      // 如果是 "所有书签" 标签
                      setSelectedFolderId && setSelectedFolderId(null);
                    }
                  }}
                >
                  <Tabs.List className="overflow-x-auto pb-2">
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
            </Tabs.Panel>
          </Tabs>
        </div>
      ) : (
        // 桌面端使用原来的网格布局
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[calc(100vh-100px)]">
          <div className="md:col-span-1 bg-white rounded-lg shadow p-4 overflow-auto">
            <h2 className="text-lg font-semibold mb-4 text-gray-700">{t("dashboard.collections")}</h2>
            <FolderTree />
            {/* 在 FolderTree 下方添加 ActiveFiltersDisplay */}
            <div className="mt-4"> {/* 添加一些边距 */}
              <ActiveFiltersDisplay
                selectedFolderId={selectedFolderId}
                selectedTags={selectedTags}
                folders={folders}
                setSelectedFolderId={setSelectedFolderId}
                setSelectedTags={setSelectedTags}
                // setActiveTab={setActiveTab} // setActiveTab 可能不需要在这里，因为它主要影响主内容区的标签页
                t={t}
              />
            </div>
            {/* 桌面端不再显示旧的 TagManager */}
            {/* <h2 className="text-lg font-semibold mb-4 mt-6 text-gray-700">{t("dashboard.tags")}</h2> */}
            {/* <TagManager /> */}
          </div>
  
          <div className="md:col-span-3 flex flex-col h-full">
            <div className="bg-white rounded-lg shadow p-4 mb-4">
              <div className="flex items-center space-x-2 mb-4">
                {/* 搜索框 */}
                <TextInput
                  placeholder={t("dashboard.search")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-grow"
                  leftSection={<IconSearch size={16} />}
                />
                
                {/* 工具栏按钮，按照顺序：筛选、添加书签、设置 */}
                <div className="flex items-center space-x-2">
                  {/* 1. 筛选按钮 */}
                  <ActionIcon
                    variant={showSearchFilters ? "filled" : "light"}
                    color={showSearchFilters ? "blue" : "gray"}
                    aria-label="Search settings"
                    onClick={() => setShowSearchFilters(!showSearchFilters)}
                    size="lg"
                    className="h-[36px] w-[36px] flex items-center justify-center"
                  >
                    <IconAdjustments size={20} />
                  </ActionIcon>

                  {/* 2. 标签管理按钮 */}
                  <Button
                    leftSection={<IconTags size={16} />}
                    onClick={() => setIsTagPanelOpen(true)} // 打开 TagPanel
                    variant="outline"
                    size={isMobile ? "xs" : "sm"}
                  >
                    {t("dashboard.tagsButton")}
                  </Button>
                  
                  {/* 3. 添加书签按钮 */}
                  <Button
                    leftSection={<IconPlus size={16} />}
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                    size={isMobile ? "xs" : "sm"}
                  >
                    {isMobile ? "+" : t("dashboard.addBookmark")}
                  </Button>
                  
                  {/* 4. 设置齿轮按钮 */}
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
  
              {/* ActiveFiltersDisplay 已移至左侧边栏，此处不再渲染 */}
  
              <Tabs
                value={activeTab}
                onChange={(value) => {
                  const newActiveTab = value || "all";
                  setActiveTab(newActiveTab);

                  if (newActiveTab === "favorites") {
                    // 当点击 "收藏夹" 时，清除文件夹选择
                    setSelectedFolderId && setSelectedFolderId(null);
                  } else if (newActiveTab !== "all") {
                    // 如果是其他文件夹标签 (不是 "all" 也不是 "favorites")
                    // 这些是收藏的文件夹，其 value 是 folderId
                    setSelectedFolderId && setSelectedFolderId(newActiveTab);
                  } else { // newActiveTab === "all"
                    // 如果是 "所有书签" 标签
                    setSelectedFolderId && setSelectedFolderId(null);
                  }
                }}
              >
                <Tabs.List className="overflow-x-auto pb-1">
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
      )}

      
            <AddBookmarkModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
            <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} />
            <TagPanel opened={isTagPanelOpen} onClose={() => setIsTagPanelOpen(false)} /> {/* 添加 TagPanel 实例 */}
          </div>
        )
      }
