"use client"

import { forwardRef } from "react"
import { Select, type SelectProps } from "@mantine/core"
import { useBookmarks } from "@/context/bookmark-context"

// 定义内部使用的类型
interface Folder {
  id: string
  name: string
  parentId: string | null
}

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

    // Create hierarchical data structure
    const getFolderOptions = (): SelectOption[] => {
      // Ensure folders is an array
      if (!Array.isArray(folders)) {
        return []
      }

      // Get root folders
      const rootFolders = folders.filter((folder) => !folder.parentId)

      // Function to build options recursively
      const buildOptions = (parentFolders: Folder[], level = 0): SelectOption[] => {
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
        placeholder="Select a folder"
        data={folderOptions || []}
        value={value}
        onChange={onChange}
        clearable
        searchable
        maxDropdownHeight={280}
        nothingFoundMessage="No folders found"
        // 移除transitionProps属性，因为它会导致React错误
        {...Object.fromEntries(
          Object.entries(props).filter(([key]) => key !== 'transitionProps')
        )}
      />
    )
  },
)

HierarchicalFolderSelect.displayName = "HierarchicalFolderSelect"
