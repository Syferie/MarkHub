"use client"

import { useState } from "react"
import { ActionIcon, TextInput, Button, Badge, Modal, Group } from "@mantine/core"
import { IconPlus, IconX, IconSearch, IconEdit } from "@tabler/icons-react"
import { useBookmarks } from "@/context/bookmark-context"
import { useLanguage } from "@/context/language-context"
import { useAuth } from "@/context/auth-context" // 新增导入
import { batchDeleteTagsAPI, type BatchDeleteTagsSuccessResponse } from "@/lib/tag-api" // 新增导入
import { toast } from "sonner" // 新增导入 for toast notifications

interface TagPanelProps {
  opened: boolean;
  onClose: () => void;
}

export default function TagPanel({ opened, onClose }: TagPanelProps) {
  const { tags, addTag, deleteTag, selectedTags, setSelectedTags, loadInitialData } = useBookmarks() // 添加 loadInitialData
  const { token, userSettings, updateGlobalSettings } = useAuth() // 从 useAuth 获取 userSettings 和 updateGlobalSettings
  const { t } = useLanguage()
  const [newTag, setNewTag] = useState("")
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [isBatchEditModeActive, setIsBatchEditModeActive] = useState(false)
  const [selectedTagIdsForBatch, setSelectedTagIdsForBatch] = useState<Set<string>>(new Set())

  const handleAddTag = async () => {
    if (newTag.trim() && addTag) {
      try {
        await addTag(newTag);
      } catch (error) {
        console.error("Error adding tags:", error);
      }
    }
    setNewTag("");
    setIsAddingTag(false);
  }

  const toggleTag = (tag: string) => {
    if (setSelectedTags && Array.isArray(selectedTags)) {
      setSelectedTags(selectedTags.includes(tag) ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag])
    }
  }

  const handleBatchSelectTag = (tag: string) => {
    setSelectedTagIdsForBatch(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(tag)) {
        newSelected.delete(tag);
      } else {
        newSelected.add(tag);
      }
      return newSelected;
    });
  }

  const filteredTags = Array.isArray(tags)
    ? tags.filter((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];

  const handleDeleteSelectedTags = async () => {
    if (!token) {
      toast.error(t("errors.notAuthenticated"));
      return;
    }

    if (selectedTagIdsForBatch.size > 0) {
      const tagNamesToDelete = Array.from(selectedTagIdsForBatch);
      try {
        const response = await batchDeleteTagsAPI(token, tagNamesToDelete);

        if (response.success) {
          // 首先重新加载书签和文件夹数据
          if (loadInitialData) {
            await loadInitialData();
          }

          // 如果API返回了从全局列表中删除的标签，则更新全局设置
          if (response.deleted_tags_from_global_list && response.deleted_tags_from_global_list.length > 0 && userSettings && updateGlobalSettings) {
            const currentGlobalTags = userSettings.tagList || [];
            const newGlobalTagList = currentGlobalTags.filter(
              (tag) => !response.deleted_tags_from_global_list!.includes(tag)
            );
            try {
              await updateGlobalSettings({ tagList: newGlobalTagList });
              console.log("Global tag list updated after batch delete.");
            } catch (settingsError) {
              console.error("Failed to update global tag list after batch delete:", settingsError);
              // 即使全局标签列表更新失败，也继续执行UI更新，因为核心删除操作已成功
            }
          }

          // 然后更新本地组件状态并显示提示
          setSelectedTagIdsForBatch(new Set());
          setIsBatchEditModeActive(false);
          toast.success(response.message || t("tags.batchDeleteSuccess"));
        } else {
          // API 调用成功但业务逻辑失败 (e.g., response.success === false)
          toast.error(response.message || t("tags.batchDeleteFailed"));
        }
      } catch (error: any) {
        console.error("Error during batch tag deletion API call:", error);
        const errorMessage = error?.message || t("tags.batchDeleteError");
        toast.error(errorMessage);
        // 此时不清除选中或退出编辑模式，以便用户重试
      }
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("tags.manageTags")} centered size="xl">
      <div className="flex flex-col space-y-4" style={{ minHeight: '550px', height: 'calc(100vh - 200px)', maxHeight: '70vh' }}> {/* 调整高度以适应 flex 布局，并设置最大高度 */}
        <TextInput
          placeholder={t("tags.searchTags")}
          leftSection={<IconSearch size={16} />}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.currentTarget.value)}
        />

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              leftSection={<IconEdit size={16} />}
              variant="outline"
              size="xs"
              onClick={() => {
                const newMode = !isBatchEditModeActive;
                setIsBatchEditModeActive(newMode);
                if (!newMode) {
                  setSelectedTagIdsForBatch(new Set());
                }
              }}
            >
              {isBatchEditModeActive ? t("tags.cancelBatchEdit") : t("tags.batchEdit")}
            </Button>
            {isBatchEditModeActive && selectedTagIdsForBatch.size > 0 && (
              <Button
                leftSection={<IconX size={16} />} // Using IconX for delete, can be changed
                variant="filled"
                color="red"
                size="xs"
                onClick={handleDeleteSelectedTags}
              >
                {t("tags.deleteSelected")} ({selectedTagIdsForBatch.size})
              </Button>
            )}
          </div>
          {!isBatchEditModeActive && ( // Hide Add Tag button in batch edit mode
            <ActionIcon
              variant="light"
              color="blue"
              onClick={() => setIsAddingTag(true)}
              className="transition-all duration-200 hover:scale-110"
            >
              <IconPlus size={16} />
            </ActionIcon>
          )}
        </div>

        {isAddingTag && (
          <div className="my-3 space-y-2 p-3 border rounded-md bg-gray-50 dark:bg-gray-800">
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
            <div className="flex justify-end space-x-2 mt-2">
              <Button size="xs" onClick={handleAddTag} className="transition-all duration-200 hover:scale-105">
                {t("tags.add")}
              </Button>
              <Button size="xs" variant="light" onClick={() => setIsAddingTag(false)}>
                {t("tags.cancel")}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-2 flex-grow overflow-y-auto pr-1"> {/* 添加 flex-grow 并移除 max-h-60 */}
          {filteredTags.map((tag, index) => {
            const isSelectedForBatch = isBatchEditModeActive && selectedTagIdsForBatch.has(tag);
            const isSelectedForFilter = !isBatchEditModeActive && Array.isArray(selectedTags) && selectedTags.includes(tag);

            return (
              <Badge
                key={`${tag}-${index}`}
                size="xl"
                color={isSelectedForFilter ? "blue" : "gray"}
                variant={isSelectedForFilter ? "filled" : "light"}
                className={`cursor-pointer tag-item transition-all duration-200 hover:scale-105 ${
                  isSelectedForBatch ? "border border-red-500" : ""
                }`}
                style={isSelectedForBatch ? { textDecorationLine: 'line-through', backgroundColor: 'rgba(239, 68, 68, 0.1)' } : {}}
                onClick={() => {
                  if (isBatchEditModeActive) {
                    handleBatchSelectTag(tag);
                  } else {
                    toggleTag(tag);
                  }
                }}
                styles={{
                  root: {
                    cursor: "pointer",
                  },
                }}
              >
                {tag}
              </Badge>
            );
          })}
          {filteredTags.length === 0 && !isAddingTag && (
            <p className="text-sm text-gray-500 w-full text-center">{t("tags.noTagsFound")}</p>
          )}
        </div>
        <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={onClose}>
                {t("common.close")}
            </Button>
        </Group>
      </div>
    </Modal>
  )
}