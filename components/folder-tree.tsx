"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { ActionIcon, TextInput, Button, Tooltip } from "@mantine/core"
import {
  IconFolder,
  IconFolderPlus,
  IconChevronRight,
  IconChevronDown,
  IconPencil,
  IconTrash,
  IconPlus,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react"
import { useBookmarks } from "@/context/bookmark-context"
import { useLanguage } from "@/context/language-context"
import type { Folder } from "@/types"

export default function FolderTree() {
  const {
    folders,
    addFolder,
    deleteFolder,
    updateFolder,
    selectedFolderId,
    setSelectedFolderId,
    favoriteFolders,
    toggleFavoriteFolder,
  } = useBookmarks()
  const { t } = useLanguage()
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [newFolderName, setNewFolderName] = useState("")
  const [isAddingFolder, setIsAddingFolder] = useState(false)
  const [addingParentId, setAddingParentId] = useState<string | null>(null)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState("")

  // Auto-expand parent folders when a child is selected
  useEffect(() => {
    if (selectedFolderId && Array.isArray(folders)) {
      // Find the folder
      const folder = folders.find((f) => f && f.id === selectedFolderId)
      if (folder && folder.parentId) {
        // Expand the parent folder
        setExpandedFolders((prev) => ({
          ...prev,
          [folder.parentId!]: true,
        }))

        // Check if the parent folder also has a parent
        const parentFolder = folders.find((f) => f && f.id === folder.parentId)
        if (parentFolder && parentFolder.parentId) {
          setExpandedFolders((prev) => ({
            ...prev,
            [parentFolder.parentId!]: true,
          }))
        }
      }
    }
  }, [selectedFolderId, folders])

  const toggleFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }))
  }

  const selectFolder = (folderId: string) => {
    setSelectedFolderId && setSelectedFolderId(selectedFolderId === folderId ? null : folderId)
  }

  const handleAddFolder = () => {
    if (newFolderName.trim() && addFolder) {
      addFolder({
        id: `folder-${Date.now()}`,
        name: newFolderName,
        parentId: addingParentId,
      })
      setNewFolderName("")
      setIsAddingFolder(false)
      setAddingParentId(null)

      // If adding a subfolder, make sure the parent is expanded
      if (addingParentId) {
        setExpandedFolders((prev) => ({
          ...prev,
          [addingParentId]: true,
        }))
      }
    }
  }

  const startEditingFolder = (folder: Folder, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingFolderId(folder.id)
    setEditingFolderName(folder.name)
  }

  const handleEditFolder = (folderId: string) => {
    if (editingFolderName.trim() && updateFolder) {
      const folderToUpdate = Array.isArray(folders) ? folders.find((f) => f && f.id === folderId) : null
      if (folderToUpdate) {
        const updatedFolder = {
          ...folderToUpdate,
          name: editingFolderName,
        }
        updateFolder(updatedFolder)
        setEditingFolderId(null)
        setEditingFolderName("")
      }
    }
  }

  const handleToggleFavorite = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavoriteFolder && toggleFavoriteFolder(folderId)
  }

  // Check if a folder can have subfolders (limit to 3 levels)
  const canHaveSubfolders = (folder: Folder): boolean => {
    if (!Array.isArray(folders)) return false

    // Count the folder's level
    let level = 1
    let currentFolder = folder

    while (currentFolder.parentId) {
      level++
      const parentFolder = folders.find((f) => f && f.id === currentFolder.parentId)
      if (!parentFolder) break
      currentFolder = parentFolder
    }

    return level < 3
  }

  // Get root level folders
  const rootFolders = Array.isArray(folders) ? folders.filter((folder) => folder && !folder.parentId) : []

  // Recursive function to render folder tree
  const renderFolder = (folder: Folder) => {
    if (!folder || !Array.isArray(folders)) return null

    const childFolders = folders.filter((f) => f && f.parentId === folder.id)
    const isExpanded = expandedFolders[folder.id]
    const isSelected = selectedFolderId === folder.id
    const isEditing = editingFolderId === folder.id
    const isFavorite = Array.isArray(favoriteFolders) && favoriteFolders.includes(folder.id)

    return (
      <div key={folder.id} className="mb-1 folder-item">
        <div className="flex items-center group">
          <ActionIcon
            variant="subtle"
            onClick={(e) => toggleFolder(folder.id, e)}
            className={`transition-transform duration-200 ${childFolders.length === 0 ? "opacity-0" : ""} ${
              isExpanded ? "rotate-0" : "-rotate-90"
            }`}
          >
            {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          </ActionIcon>

          {isEditing ? (
            <div className="flex items-center flex-grow">
              <TextInput
                value={editingFolderName}
                onChange={(e) => setEditingFolderName(e.target.value)}
                size="xs"
                className="flex-grow"
                autoFocus
                onBlur={() => handleEditFolder(folder.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEditFolder(folder.id)
                  if (e.key === "Escape") setEditingFolderId(null)
                }}
              />
            </div>
          ) : (
            <div
              className={`flex items-center w-full overflow-hidden p-1 rounded cursor-pointer transition-colors duration-200 ${
                isSelected ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
              }`}
              onClick={() => selectFolder(folder.id)}
            >
              <IconFolder size={18} className={isSelected ? "text-blue-600 mr-2" : "text-blue-500 mr-2"} />
              <span className="text-sm truncate flex-1 min-w-0">{folder.name}</span>
            </div>
          )}

          <div className="hidden group-hover:flex items-center flex-shrink-0">
            <Tooltip label={isFavorite ? t("bookmarks.removeFromFavorites") : t("bookmarks.addToFavorites")} withArrow position="top">
              <ActionIcon
                variant="subtle"
                size="sm"
                color={isFavorite ? "yellow" : "gray"}
                onClick={(e) => handleToggleFavorite(folder.id, e)}
              >
                {isFavorite ? <IconStarFilled size={14} /> : <IconStar size={14} />}
              </ActionIcon>
            </Tooltip>
            <ActionIcon variant="subtle" size="sm" onClick={(e) => startEditingFolder(folder, e)}>
              <IconPencil size={14} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              size="sm"
              color="red"
              onClick={(e) => {
                e.stopPropagation()
                deleteFolder && deleteFolder(folder.id)
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </div>
        </div>

        <div
          className={`ml-6 mt-1 border-l-2 border-gray-100 pl-2 folder-children ${
            isExpanded && childFolders.length > 0 ? "expanded" : ""
          }`}
          style={{
            maxHeight: isExpanded && childFolders.length > 0 ? 1000 : 0,
            overflow: "hidden",
            transition: "max-height 0.2s ease-in-out",
          }}
        >
          {childFolders.map((childFolder) => renderFolder(childFolder))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500">{t("folders.title")}</span>
        <div className="flex space-x-1">
          <Tooltip label={t("folders.addRootFolder")} withArrow position="top">
            <ActionIcon
              variant="light"
              color="blue"
              onClick={() => {
                setIsAddingFolder(true)
                setAddingParentId(null)
              }}
              className="transition-all duration-200 hover:scale-110"
            >
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
          {selectedFolderId &&
            Array.isArray(folders) &&
            folders.find((f) => f && f.id === selectedFolderId) &&
            canHaveSubfolders(folders.find((f) => f && f.id === selectedFolderId)!) && (
              <Tooltip
                label={t("folders.addSubfolder")}
                withArrow
                position="top"
              >
                <ActionIcon
                  variant="light"
                  color="blue"
                  onClick={() => {
                    setIsAddingFolder(true)
                    setAddingParentId(selectedFolderId)
                  }}
                  className="transition-all duration-200 hover:scale-110"
                >
                  <IconFolderPlus size={16} />
                </ActionIcon>
              </Tooltip>
            )}
        </div>
      </div>

      {isAddingFolder && (
        <div className="mb-3 space-y-2 slide-in">
          <TextInput
            placeholder={t("folders.newFolder")}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            size="xs"
            className="w-full"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddFolder()
              if (e.key === "Escape") setIsAddingFolder(false)
            }}
          />
          <div className="flex justify-end space-x-2">
            <Button size="xs" onClick={handleAddFolder} className="transition-all duration-200 hover:scale-105">
              {t("folders.add")}
            </Button>
            <Button size="xs" variant="light" onClick={() => setIsAddingFolder(false)}>
              {t("folders.cancel")}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-2">
        <div
          className={`flex items-center w-full overflow-hidden p-1 rounded mb-2 cursor-pointer transition-colors duration-200 ${
            selectedFolderId === null ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
          }`}
          onClick={() => setSelectedFolderId && setSelectedFolderId(null)}
        >
          <IconFolder size={18} className={selectedFolderId === null ? "text-blue-600 mr-2" : "text-gray-500 mr-2"} />
          <span className="text-sm truncate flex-1 min-w-0">{t("settings.allBookmarks")}</span>
        </div>
        {rootFolders.map((folder) => renderFolder(folder))}
      </div>
    </div>
  )
}
