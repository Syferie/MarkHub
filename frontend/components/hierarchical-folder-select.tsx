"use client"

import { forwardRef } from "react"
import { Select, type SelectProps } from "@mantine/core"
import { useBookmarks } from "@/context/bookmark-context"
import { useLanguage } from "@/context/language-context"
import type { Folder } from "@/lib/api-client"; // 导入统一的 Folder 类型

// 内部 Folder 类型定义已移除，使用导入的类型

// 定义选项类型
interface SelectOption {
  value: string
  label: string
}

interface HierarchicalFolderSelectProps extends Omit<SelectProps, "data"> {
  value: string | null
  onChange: (value: string | null) => void
}

export const HierarchicalFolderSelect = forwardRef<HTMLInputElement, HierarchicalFolderSelectProps>(
  ({ value, onChange, ...props }, ref) => {
    const { folders } = useBookmarks()
    const { t } = useLanguage()

    // Create hierarchical data structure
    const getFolderOptions = (): SelectOption[] => {
      // Ensure folders is an array
      if (!Array.isArray(folders)) {
        return []
      }

      // Get root folders
      const rootFolders = folders.filter((folder) => !folder.parentId)

      // Function to build options recursively
      const buildOptions = (parentFolders: Folder[], level = 0): SelectOption[] => { // Folder 类型现在是导入的
        if (!Array.isArray(parentFolders)) {
          return []
        }

        return parentFolders.flatMap((folder): SelectOption[] => {
          if (!folder) return []

          // Create indentation based on level
          const prefix = level > 0 ? "─ ".padStart(level * 2 + 2, "  ") : ""

          // Find children
          const children = folders.filter((f) => f && f.parentId === folder.id)

          // Create option for current folder
          const option: SelectOption = {
            value: folder.id,
            label: `${prefix}${folder.name}`,
          }

          // If has children, add them with increased level
          if (children.length > 0) {
            return [option, ...buildOptions(children, level + 1)]
          }

          return [option]
        })
      }

      return buildOptions(rootFolders)
    }

    const folderOptions = getFolderOptions()

    return (
      <Select
        ref={ref}
        placeholder={t("folder.selectFolder")}
        data={folderOptions || []}
        value={value}
        onChange={onChange}
        clearable
        searchable
        maxDropdownHeight={280}
        nothingFoundMessage={t("folder.noFoldersFound")}
        // 移除transitionProps属性，因为它会导致React错误
        {...Object.fromEntries(
          Object.entries(props).filter(([key]) => key !== 'transitionProps')
        )}
      />
    )
  },
)

HierarchicalFolderSelect.displayName = "HierarchicalFolderSelect"
