"use client"

import { useState, useEffect } from "react"
import { Modal, TextInput, Button, Group, Tooltip, ActionIcon, Alert, Text, Combobox, PillsInput, Pill, useCombobox, Progress } from "@mantine/core"
import { IconWand, IconAlertCircle, IconCheck, IconSparkles, IconLoader2, IconFolder } from "@tabler/icons-react"
import { useBookmarks } from "@/context/bookmark-context"
import { useLanguage } from "@/context/language-context"
import type { Bookmark } from "@/types"
import { HierarchicalFolderSelect } from "./hierarchical-folder-select"
import { generateTags } from "@/lib/tag-api"
import { suggestFolder } from "@/lib/folder-api"
import { uploadBookmarksToWebDAV, getWebDAVStatus } from "./webdav-sync"

interface EditBookmarkModalProps {
  bookmark: Bookmark
  isOpen: boolean
  onClose: () => void
}

export default function EditBookmarkModal({ bookmark, isOpen, onClose }: EditBookmarkModalProps) {
  const { updateBookmark, tags, settings, folders } = useBookmarks()
  const { t } = useLanguage()
  const [title, setTitle] = useState(bookmark.title)
  const [url, setUrl] = useState(bookmark.url)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(bookmark.folderId)
  const [selectedTags, setSelectedTags] = useState<string[]>(bookmark.tags || [])
  const [isLoadingTags, setIsLoadingTags] = useState(false)
  const [isLoadingFolder, setIsLoadingFolder] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [tagGenerationStatus, setTagGenerationStatus] = useState<{
    status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;
    message?: string;
  }>({ status: 'idle' })
  const [folderGenerationStatus, setFolderGenerationStatus] = useState<{
    status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;
    message?: string;
  }>({ status: 'idle' })

  useEffect(() => {
    if (isOpen) {
      setTitle(bookmark.title)
      setUrl(bookmark.url)
      setSelectedFolder(bookmark.folderId)
      setSelectedTags(bookmark.tags || [])
      setTagError(null)
      setFolderError(null)
      setTagGenerationStatus({ status: 'idle' })
      setFolderGenerationStatus({ status: 'idle' })
    }
  }, [isOpen, bookmark])

  const handleSubmit = async () => {
    if (title && url) {
      try {
        const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`)
        updateBookmark({
          ...bookmark,
          title,
          url: urlObj.toString(),
          folderId: selectedFolder,
          tags: selectedTags,
        })

        // After editing bookmark, automatically upload if WebDAV is enabled
        console.log("Edited bookmark data:", {
          id: bookmark.id,
          title,
          url: urlObj.toString(),
          folderId: selectedFolder,
          tags: selectedTags
        });

        try {
          // Call upload function directly, let it check if WebDAV is enabled
          console.log("Calling uploadBookmarksToWebDAV...");
          const uploadResult = await uploadBookmarksToWebDAV();
          console.log("Automatic upload result:", uploadResult);

          if (!uploadResult) {
            console.warn("Automatic upload returned false, WebDAV may not be enabled or upload failed");
          }
        } catch (syncError) {
          console.error("Failed to automatically sync bookmark data:", syncError)
        }

        onClose()
      } catch (e) {
        console.error("Invalid URL:", e)
        // Handle invalid URL error
      }
    }
  }

  const handleSuggestTags = async () => {
    if (!url) {
      setTagError(t("bookmarkModal.enterUrlFirst"))
      return
    }

    try {
      setIsLoadingTags(true)
      setTagError(null)
      setTagGenerationStatus({ status: 'pending', message: 'Initializing...' })

      // 确保URL格式正确
      const formattedUrl = url.startsWith("http") ? url : `https://${url}`

      // 调用新的标签生成API，传递API配置
      const suggestedTags = await generateTags({
        url: formattedUrl,
        filter_tags: tags // 传递已存在的标签列表
      }, {
        onProgressUpdate: (status) => {
          console.log("Tag generation progress:", status)
          // 根据API返回的状态更新进度展示
          if (status.status === 'pending') {
            setTagGenerationStatus({
              status: 'pending',
              progress: 10,
              message: 'Task submitted, waiting...'
            })
          } else if (status.status === 'processing') {
            setTagGenerationStatus({
              status: 'processing',
              progress: status.progress || 50,
              message: status.message || 'Analyzing content...'
            })
          } else if (status.status === 'completed') {
            setTagGenerationStatus({
              status: 'completed',
              progress: 100,
              message: 'Tag generation completed!'
            })
          } else if (status.status === 'failed') {
            setTagGenerationStatus({
              status: 'failed',
              message: status.error || 'Generation failed'
            })
          }
        }
      },
      // 从 settings 中获取 API 配置并传递给 generateTags
      {
        apiKey: settings?.tagApiKey,
        apiBaseUrl: settings?.tagApiUrl
      })

      // 将推荐标签添加到已选标签中（避免重复）
      setSelectedTags((prev) => {
        const newTags = [...prev]
        suggestedTags.forEach((tag) => {
          if (!newTags.includes(tag)) {
            newTags.push(tag)
          }
        })
        return newTags
      })
    } catch (error) {
      console.error("Tag generation error:", error)
      setTagError(error instanceof Error ? error.message : "Failed to get tag recommendations")
      setTagGenerationStatus({ status: 'failed', message: error instanceof Error ? error.message : "Failed to get tag recommendations" })
    } finally {
      setIsLoadingTags(false)
      // 延迟将状态重置为idle，让用户有时间看到完成状态
      setTimeout(() => {
        if (tagGenerationStatus.status === 'completed') {
          setTagGenerationStatus({ status: 'idle' })
        }
      }, 3000)
    }
  }

  // Ensure tags is an array before mapping
  const tagOptions = Array.isArray(tags)
    ? tags.map((tag) => ({
        value: tag,
        label: tag,
      }))
    : []

  const createTag = (query: string) => {
    const item = { value: query, label: query }
    setSelectedTags((prev) => [...prev, query])
    return item
  }

  // 处理AI建议文件夹
  const handleSuggestFolder = async () => {
    if (!url) {
      setFolderError(t("bookmarkModal.enterUrlFirst"))
      return
    }

    try {
      setIsLoadingFolder(true)
      setFolderError(null)
      setFolderGenerationStatus({ status: 'pending', message: 'Initializing...' })

      // 确保URL格式正确
      const formattedUrl = url.startsWith("http") ? url : `https://${url}`

      // 获取所有文件夹名称列表
      const folderNames = Array.isArray(folders)
        ? folders.map(folder => folder.name)
        : []

      // 调用文件夹建议API
      const suggestedFolder = await suggestFolder({
        url: formattedUrl,
        folders: folderNames
      }, {
        onProgressUpdate: (status) => {
          console.log("Folder generation progress:", status)
          // 根据API返回的状态更新进度展示
          if (status.status === 'pending') {
            setFolderGenerationStatus({
              status: 'pending',
              progress: 10,
              message: 'Task submitted, waiting...'
            })
          } else if (status.status === 'processing') {
            setFolderGenerationStatus({
              status: 'processing',
              progress: status.progress || 50,
              message: status.message || 'Analyzing content...'
            })
          } else if (status.status === 'completed') {
            setFolderGenerationStatus({
              status: 'completed',
              progress: 100,
              message: 'Folder suggestion completed!'
            })
          } else if (status.status === 'failed') {
            setFolderGenerationStatus({
              status: 'failed',
              message: status.error || 'Generation failed'
            })
          }
        }
      },
      {
        apiKey: settings?.tagApiKey, // 复用标签API的配置
        apiBaseUrl: settings?.tagApiUrl
      })

      // 查找匹配的文件夹ID
      if (suggestedFolder) {
        const matchedFolder = folders.find(folder => folder.name === suggestedFolder)
        if (matchedFolder) {
          setSelectedFolder(matchedFolder.id)
        } else {
          // 如果没有找到匹配的文件夹，可以根据业务需求决定是否创建新文件夹
          console.log("Suggested folder does not exist:", suggestedFolder)
        }
      }

    } catch (error) {
      console.error("Folder suggestion error:", error)
      setFolderError(error instanceof Error ? error.message : "Failed to get folder suggestion")
      setFolderGenerationStatus({ status: 'failed', message: error instanceof Error ? error.message : "Failed to get folder suggestion" })
    } finally {
      setIsLoadingFolder(false)
      // 延迟将状态重置为idle，让用户有时间看到完成状态
      setTimeout(() => {
        if (folderGenerationStatus.status === 'completed') {
          setFolderGenerationStatus({ status: 'idle' })
        }
      }, 3000)
    }
  }

  const isTagApiConfigured = !!(settings?.tagApiUrl && settings?.tagApiKey)
  const isFolderApiConfigured = !!(settings?.tagApiUrl && settings?.tagApiKey) // 复用标签API的配置

  // 新添加的TagSelector组件，使用最新的Mantine API
  function TagSelector({
    tagOptions,
    selectedTags,
    setSelectedTags,
    createTag
  }: {
    tagOptions: { value: string; label: string }[],
    selectedTags: string[],
    setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>,
    createTag: (query: string) => { value: string; label: string }
  }) {
    // 添加一个控制下拉框开关状态的状态变量
    const [opened, setOpened] = useState(false)
    const combobox = useCombobox({
      onDropdownClose: () => combobox.resetSelectedOption(),
      onDropdownOpen: () => combobox.updateSelectedOptionIndex('active'),
      opened,
      onOpenedChange: setOpened
    })

    const [search, setSearch] = useState('')

    const exactOptionMatch = tagOptions.some((item) => item.value === search)

    const handleValueSelect = (val: string) => {
      setSearch('')

      if (val === '$create') {
        // 创建新标签
        createTag(search)
        // 确保下拉框保持打开状态
        setOpened(true)
      } else {
        // 选择或取消选择现有标签
        setSelectedTags((current) =>
          current.includes(val) ? current.filter((v) => v !== val) : [...current, val]
        )
        // 确保下拉框保持打开状态
        setOpened(true)
      }
    }

    const handleValueRemove = (val: string) =>
      setSelectedTags((current) => current.filter((v) => v !== val))

    // 渲染已选择的标签
    const values = selectedTags.map((item, index) => (
      <Pill key={`${item}-${index}`} withRemoveButton onRemove={() => handleValueRemove(item)}>
        {item}
      </Pill>
    ))

    // 渲染选项列表
    const options = tagOptions
      .filter((item) => item.value.toLowerCase().includes(search.trim().toLowerCase()))
      .map((item, index) => (
        <Combobox.Option value={item.value} key={`${item.value}-${index}`} active={selectedTags.includes(item.value)}>
          <Group gap="sm">
            {selectedTags.includes(item.value) ? <IconCheck size={12} /> : null}
            <span>{item.label}</span>
          </Group>
        </Combobox.Option>
      ))

    return (
      <Combobox
        store={combobox}
        onOptionSubmit={handleValueSelect}
        withinPortal={false}
        transitionProps={{ transition: 'pop', duration: 200 }}
      >
        <Combobox.DropdownTarget>
          <PillsInput onClick={() => combobox.openDropdown()}>
            <Pill.Group>
              {values}

              <Combobox.EventsTarget>
                <PillsInput.Field
                  onFocus={() => combobox.openDropdown()}
                  // 移除onBlur事件以防止在选择选项时关闭下拉框
                  // onBlur={() => combobox.closeDropdown()}
                  value={search}
                  placeholder={t("bookmarkModal.selectOrCreateTags")}
                  onChange={(event) => {
                    combobox.updateSelectedOptionIndex()
                    setSearch(event.currentTarget.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Backspace' && search.length === 0) {
                      event.preventDefault()
                      handleValueRemove(selectedTags[selectedTags.length - 1])
                    }
                  }}
                />
              </Combobox.EventsTarget>
            </Pill.Group>
          </PillsInput>
        </Combobox.DropdownTarget>

        <Combobox.Dropdown>
          <Combobox.Options>
            {options}

            {!exactOptionMatch && search.trim().length > 0 && (
              <Combobox.Option value="$create">+ {t("bookmarkModal.create")} {search}</Combobox.Option>
            )}

            {options.length === 0 && search.trim().length > 0 && (
              <Combobox.Empty>{t("bookmarkModal.nothingFound")}</Combobox.Empty>
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    )
  }

  return (
    <Modal opened={isOpen} onClose={onClose} title={t("bookmarkModal.editTitle")} centered>
      <div className="space-y-4">
        <TextInput
          label={t("bookmarkModal.title")}
          placeholder={t("bookmarkModal.title")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <TextInput
          label={t("bookmarkModal.url")}
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">{t("bookmarkModal.folder")}</label>

              {/* 文件夹生成状态指示器 */}
              {folderGenerationStatus.status !== 'idle' && (
                <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                  {folderGenerationStatus.status === 'pending' && (
                    <IconLoader2 size={14} className="animate-spin" />
                  )}
                  {folderGenerationStatus.status === 'completed' && (
                    <IconCheck size={14} className="text-green-600" />
                  )}
                  {folderGenerationStatus.message}
                </div>
              )}
            </div>

            <Tooltip label={!url ? t("bookmarkModal.configureTags") : t("bookmarkModal.suggestFolder")}>
              <ActionIcon
                size="sm"
                color="blue"
                onClick={handleSuggestFolder}
                loading={isLoadingFolder}
                disabled={!url}
                className="disabled:opacity-40 disabled:bg-transparent dark:disabled:bg-transparent"
              >
                <IconFolder size={16} />
              </ActionIcon>
            </Tooltip>
          </div>

          {/* 进度条 */}
          {(folderGenerationStatus.status === 'pending' || folderGenerationStatus.status === 'processing') && (
            <Progress
              value={folderGenerationStatus.progress || 0}
              size="xs"
              color={folderGenerationStatus.status === 'pending' ? "blue" : "green"}
              striped
              animated
              mb="xs"
            />
          )}

          <HierarchicalFolderSelect
            value={selectedFolder}
            onChange={setSelectedFolder}
          />

          {folderError && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              mt="xs"
              p="xs"
              withCloseButton
              onClose={() => setFolderError(null)}
            >
              {folderError}
            </Alert>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">{t("bookmarkModal.tags")}</label>

              {/* 标签生成状态指示器 */}
              {tagGenerationStatus.status !== 'idle' && (
                <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                  {tagGenerationStatus.status === 'pending' && (
                    <IconLoader2 size={14} className="animate-spin" />
                  )}
                  {tagGenerationStatus.status === 'completed' && (
                    <IconCheck size={14} className="text-green-600" />
                  )}
                  {tagGenerationStatus.message}
                </div>
              )}
            </div>

            <Tooltip label={!url ? t("bookmarkModal.configureTags") : t("bookmarkModal.suggestTags")}>
              <ActionIcon
                size="sm"
                color="blue"
                onClick={handleSuggestTags}
                loading={isLoadingTags}
                disabled={!url}
                className="disabled:opacity-40 disabled:bg-transparent dark:disabled:bg-transparent"
              >
                <IconSparkles size={16} />
              </ActionIcon>
            </Tooltip>
          </div>

          {/* 进度条 */}
          {(tagGenerationStatus.status === 'pending' || tagGenerationStatus.status === 'processing') && (
            <Progress
              value={tagGenerationStatus.progress || 0}
              size="xs"
              color={tagGenerationStatus.status === 'pending' ? "blue" : "green"}
              striped
              animated
              mb="xs"
            />
          )}

          {/* 使用新的TagSelector组件替换旧的MultiSelect组件 */}
          <TagSelector
            tagOptions={tagOptions}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            createTag={createTag}
          />

          {tagError && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              mt="xs"
              p="xs"
              withCloseButton
              onClose={() => setTagError(null)}
            >
              {tagError}
            </Alert>
          )}

        </div>

        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={onClose}>
            {t("bookmarkModal.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={tagGenerationStatus.status === 'pending' || tagGenerationStatus.status === 'processing' || folderGenerationStatus.status === 'pending' || folderGenerationStatus.status === 'processing'}
          >
            {t("bookmarkModal.update")}
          </Button>
        </Group>
      </div>
    </Modal>
  )
}
