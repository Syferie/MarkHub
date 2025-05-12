"use client"

import { useState, useEffect } from "react"
import { Modal, TextInput, Button, Group, Tooltip, ActionIcon, Alert, Text, Combobox, PillsInput, Pill, useCombobox } from "@mantine/core"
import { IconWand, IconAlertCircle, IconCheck } from "@tabler/icons-react"
import { useBookmarks } from "@/context/bookmark-context"
import { HierarchicalFolderSelect } from "./hierarchical-folder-select"

interface AddBookmarkModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AddBookmarkModal({ isOpen, onClose }: AddBookmarkModalProps) {
  const { addBookmark, tags, suggestTags, settings } = useBookmarks()
  const [title, setTitle] = useState("")
  const [url, setUrl] = useState("")
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isLoadingTags, setIsLoadingTags] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)

  // For Chrome extension, we would get the current tab info
  useEffect(() => {
    if (isOpen) {
      // In a real Chrome extension, we would use:
      // chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      //   setTitle(tabs[0].title || '');
      //   setUrl(tabs[0].url || '');
      // });

      // For demo purposes:
      setTitle("")
      setUrl("")
      setSelectedFolder(null)
      setSelectedTags([])
      setTagError(null)
    }
  }, [isOpen])

  const handleSubmit = () => {
    if (title && url) {
      try {
        const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`)
        addBookmark({
          id: `bookmark-${Date.now()}`,
          title,
          url: urlObj.toString(),
          folderId: selectedFolder,
          tags: selectedTags,
          createdAt: new Date().toISOString(),
          isFavorite: false,
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
      setTagError("Please enter a URL first")
      return
    }

    try {
      setIsLoadingTags(true)
      setTagError(null)

      // Ensure URL is properly formatted
      const formattedUrl = url.startsWith("http") ? url : `https://${url}`

      // Get tag suggestions
      const suggestedTags = await suggestTags(formattedUrl)

      // Add suggested tags to selected tags (avoiding duplicates)
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
      console.error("Error suggesting tags:", error)
      setTagError(error instanceof Error ? error.message : "Failed to get tag suggestions")
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
    <Modal opened={isOpen} onClose={onClose} title="Add Bookmark" centered>
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
            {isTagApiConfigured && (
              <Tooltip label="Get tag suggestions based on URL content">
                <ActionIcon size="sm" color="blue" onClick={handleSuggestTags} loading={isLoadingTags} disabled={!url}>
                  <IconWand size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </div>

          {/* 使用新的Combobox组件替换旧的MultiSelect组件 */}
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

          {!isTagApiConfigured && url && (
            <Text size="xs" color="dimmed" mt="xs">
              To enable tag suggestions, configure the Tag API in Settings.
            </Text>
          )}
        </div>

        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Save Bookmark</Button>
        </Group>
      </div>
    </Modal>
  )
}
