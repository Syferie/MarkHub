"use client"

import { forwardRef } from "react"
import { Select, type SelectProps } from "@mantine/core"
import { useBookmarks } from "@/context/bookmark-context"

interface HierarchicalFolderSelectProps extends Omit<SelectProps, "data"> {
  value: string | null
  onChange: (value: string | null) => void
}

export const HierarchicalFolderSelect = forwardRef<HTMLInputElement, HierarchicalFolderSelectProps>(
  ({ value, onChange, ...props }, ref) => {
    const { folders } = useBookmarks()

    // Create hierarchical data structure
    const getFolderOptions = () => {
      // Ensure folders is an array
      if (!Array.isArray(folders)) {
        return []
      }

      // Get root folders
      const rootFolders = folders.filter((folder) => !folder.parentId)

      // Function to build options recursively
      const buildOptions = (parentFolders: typeof folders, level = 0) => {
        if (!Array.isArray(parentFolders)) {
          return []
        }

        return parentFolders.flatMap((folder) => {
          if (!folder) return []

          // Create indentation based on level
          const prefix = level > 0 ? "─ ".padStart(level * 2 + 2, "  ") : ""

          // Find children
          const children = folders.filter((f) => f && f.parentId === folder.id)

          // Create option for current folder
          const option = {
            value: folder.id,
            label: `${prefix}${folder.name}`,
          }

          // If has children, add them with increased level
          if (children.length > 0) {
            return [option, ...buildOptions(children, level + 1)]
          }

          return option
        })
      }

      return buildOptions(rootFolders)
    }

    const folderOptions = getFolderOptions()

    return (
      <Select
        ref={ref}
        label="Folder"
        placeholder="Select a folder"
        data={folderOptions || []}
        value={value}
        onChange={onChange}
        clearable
        searchable
        maxDropdownHeight={280}
        nothingFoundMessage="No folders found"
        transitionProps={{
          transition: "pop",
          duration: 200,
        }}
        {...props}
      />
    )
  },
)

HierarchicalFolderSelect.displayName = "HierarchicalFolderSelect"
