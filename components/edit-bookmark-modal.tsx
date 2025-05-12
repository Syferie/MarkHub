"use client"

import { useState, useEffect } from "react"
import { Modal, TextInput, Button, Group, Tooltip, ActionIcon, Alert, Text, Combobox, PillsInput, Pill, useCombobox } from "@mantine/core"
import { IconWand, IconAlertCircle, IconCheck, IconSparkles } from "@tabler/icons-react"
import { useBookmarks } from "@/context/bookmark-context"
import type { Bookmark } from "@/types"
import { HierarchicalFolderSelect } from "./hierarchical-folder-select"
import { generateTags } from "@/lib/tag-api"

interface EditBookmarkModalProps {
  bookmark: Bookmark
  isOpen: boolean
  onClose: () => void
}

export default function EditBookmarkModal({ bookmark, isOpen, onClose }: EditBookmarkModalProps) {
  const { updateBookmark, tags, suggestTags, settings } = useBookmarks()
  const [title, setTitle] = useState(bookmark.title)
  const [url, setUrl] = useState(bookmark.url)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(bookmark.folderId)
  const [selectedTags, setSelectedTags] = useState<string[]>(bookmark.tags || [])
  const [isLoadingTags, setIsLoadingTags] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setTitle(bookmark.title)
      setUrl(bookmark.url)
      setSelectedFolder(bookmark.folderId)
      setSelectedTags(bookmark.tags || [])
      setTagError(null)
    }
  }, [isOpen, bookmark])

  const handleSubmit = () => {
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
        onClose()
      } catch (e) {
        console.error("Invalid URL:", e)
        // Handle invalid URL error
      }
    }
  }

  const handleSuggestTags = async () => {
    if (!url) {
      setTagError("请先输入URL")
      return
    }

    try {
      setIsLoadingTags(true)
      setTagError(null)

      // 确保URL格式正确
      const formattedUrl = url.startsWith("http") ? url : `https://${url}`

      // 调用新的标签生成API
      const suggestedTags = await generateTags({
        url: formattedUrl,
        filter_tags: tags // 传递已存在的标签列表
      }, {
        onProgressUpdate: (status) => {
          console.log("标签生成进度:", status)
        }
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
      console.error("标签生成错误:", error)
      setTagError(error instanceof Error ? error.message : "获取标签推荐失败")
    } finally {
      setIsLoadingTags(false)
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

  const isTagApiConfigured = !!(settings?.tagApiUrl && settings?.tagApiKey)
  
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
    const values = selectedTags.map((item) => (
      <Pill key={item} withRemoveButton onRemove={() => handleValueRemove(item)}>
        {item}
      </Pill>
    ))
  
    // 渲染选项列表
    const options = tagOptions
      .filter((item) => item.value.toLowerCase().includes(search.trim().toLowerCase()))
      .map((item) => (
        <Combobox.Option value={item.value} key={item.value} active={selectedTags.includes(item.value)}>
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
                  placeholder="Select or create tags"
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
              <Combobox.Option value="$create">+ Create {search}</Combobox.Option>
            )}
  
            {options.length === 0 && search.trim().length > 0 && (
              <Combobox.Empty>Nothing found</Combobox.Empty>
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    )
  }

  return (
    <Modal opened={isOpen} onClose={onClose} title="Edit Bookmark" centered>
      <div className="space-y-4">
        <TextInput
          label="Title"
          placeholder="Bookmark title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <TextInput
          label="URL"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />

        <HierarchicalFolderSelect
          value={selectedFolder}
          onChange={setSelectedFolder}
        />

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">Tags</label>
            <Tooltip label="根据URL内容生成标签">
              <ActionIcon size="sm" color="blue" onClick={handleSuggestTags} loading={isLoadingTags} disabled={!url}>
                <IconSparkles size={16} />
              </ActionIcon>
            </Tooltip>
          </div>

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
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Update Bookmark</Button>
        </Group>
      </div>
    </Modal>
  )
}
