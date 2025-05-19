"use client"

import { db, type Folder } from "@/lib/db"
import { v4 as uuidv4 } from "uuid"

/**
 * 根据文件夹名称查找或创建MarkHub文件夹
 * 
 * @param folderName 文件夹名称
 * @returns 文件夹ID
 */
export async function findOrCreateFolderByName(folderName: string): Promise<string> {
  try {
    // 1. 获取所有文件夹
    const folders: Folder[] = await db.getAllFolders()
    
    // 2. 查找匹配的文件夹（不区分大小写）
    const existingFolder = folders.find(
      folder => folder.name.toLowerCase() === folderName.toLowerCase()
    )
    
    // 3. 如果找到匹配的文件夹，返回其ID
    if (existingFolder) {
      return existingFolder.id
    }
    
    // 4. 如果没找到，创建新文件夹
    const newFolder: Folder = {
      id: `folder-${uuidv4()}`,
      name: folderName,
      parentId: null
    }
    
    // 5. 保存新文件夹
    await db.saveFolder(newFolder)
    
    // 6. 返回新文件夹的ID
    return newFolder.id
  } catch (error) {
    console.error("查找或创建文件夹失败:", error)
    throw error
  }
}