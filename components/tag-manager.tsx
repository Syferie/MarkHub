"use client"

import { useState } from "react"
import { ActionIcon, TextInput, Button, Badge } from "@mantine/core"
import { IconPlus, IconX } from "@tabler/icons-react"
import { useBookmarks } from "@/context/bookmark-context"

export default function TagManager() {
  const { tags, addTag, deleteTag, selectedTags, setSelectedTags } = useBookmarks()
  const [newTag, setNewTag] = useState("")
  const [isAddingTag, setIsAddingTag] = useState(false)

  const handleAddTag = () => {
    if (newTag.trim() && addTag) {
      // 使用英文逗号分隔标签
      const tagArray = newTag.split(',')
      
      // 处理每个标签：去除空格并过滤掉空字符串
      const validTags = tagArray
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)
      
      // 添加每一个有效的标签
      validTags.forEach(tag => addTag(tag))
      
      setNewTag("")
      setIsAddingTag(false)
    }
  }

  const toggleTag = (tag: string) => {
    if (setSelectedTags && Array.isArray(selectedTags)) {
      setSelectedTags(selectedTags.includes(tag) ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag])
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500">Tags</span>
        <ActionIcon
          variant="light"
          color="blue"
          onClick={() => setIsAddingTag(true)}
          className="transition-all duration-200 hover:scale-110"
        >
          <IconPlus size={16} />
        </ActionIcon>
      </div>

      {isAddingTag && (
        <div className="mb-3 space-y-2 slide-in">
          <TextInput
            placeholder="Enter tags, separated by commas."
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            size="xs"
            className="w-full"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddTag()
              if (e.key === "Escape") setIsAddingTag(false)
            }}
          />
          <div className="flex justify-end space-x-2">
            <Button size="xs" onClick={handleAddTag} className="transition-all duration-200 hover:scale-105">
              Add
            </Button>
            <Button size="xs" variant="light" onClick={() => setIsAddingTag(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-2">
        {Array.isArray(tags) &&
          tags.map((tag, index) => (
            <Badge
              key={`${tag}-${index}`}
              size="sm"
              color={Array.isArray(selectedTags) && selectedTags.includes(tag) ? "blue" : "gray"}
              variant={Array.isArray(selectedTags) && selectedTags.includes(tag) ? "filled" : "light"}
              className="cursor-pointer tag-item transition-all duration-200 hover:scale-105"
              onClick={() => toggleTag(tag)}
              rightSection={
                <ActionIcon
                  size="xs"
                  color={Array.isArray(selectedTags) && selectedTags.includes(tag) ? "blue" : "gray"}
                  variant="transparent"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteTag && deleteTag(tag)
                  }}
                  className="transition-opacity duration-200 hover:opacity-70"
                >
                  <IconX size={10} />
                </ActionIcon>
              }
              styles={{
                root: {
                  cursor: "pointer",
                },
              }}
            >
              {tag}
            </Badge>
          ))}
      </div>
    </div>
  )
}
