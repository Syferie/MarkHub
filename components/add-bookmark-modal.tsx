"use client"

import { useState, useEffect } from "react"
import { Modal, TextInput, MultiSelect, Button, Group, Tooltip, ActionIcon, Alert, Text } from "@mantine/core"
import { IconWand, IconAlertCircle } from "@tabler/icons-react"
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
          transitionProps={{
            transition: "pop",
            duration: 200,
          }}
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

          <MultiSelect
            placeholder="Select or create tags"
            data={tagOptions}
            value={selectedTags}
            onChange={setSelectedTags}
            searchable
            creatable={true}
            getCreateLabel={(query) => `+ Create ${query}`}
            onCreate={createTag}
            transitionProps={{
              transition: "pop",
              duration: 200,
            }}
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
