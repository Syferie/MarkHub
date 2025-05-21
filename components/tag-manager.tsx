"use client"

import { useState } from "react"
import { ActionIcon, TextInput, Button, Badge } from "@mantine/core"
import { IconPlus, IconX } from "@tabler/icons-react"
import { useBookmarks } from "@/context/bookmark-context"
import { useLanguage } from "@/context/language-context"

export default function TagManager() {
  const { tags, addTag, deleteTag, selectedTags, setSelectedTags } = useBookmarks()
  const { t } = useLanguage()
  const [newTag, setNewTag] = useState("")
  const [isAddingTag, setIsAddingTag] = useState(false)

  const handleAddTag = async () => {
    if (newTag.trim() && addTag) {
      try {
        await addTag(newTag); // 直接传递原始字符串
      } catch (error) {
        console.error("Error adding tags:", error);
        // 可以在这里添加用户反馈，例如使用 toast 通知
      }
    }
    // 无论是否成功添加标签，都清空输入框并关闭添加界面
    setNewTag("");
    setIsAddingTag(false);
  }

  const toggleTag = (tag: string) => {
    if (setSelectedTags && Array.isArray(selectedTags)) {
      setSelectedTags(selectedTags.includes(tag) ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag])
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500">{t("tags.title")}</span>
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
            placeholder={t("tags.enterTags")}
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
              {t("tags.add")}
            </Button>
            <Button size="xs" variant="light" onClick={() => setIsAddingTag(false)}>
              {t("tags.cancel")}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-2 pb-16">
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
