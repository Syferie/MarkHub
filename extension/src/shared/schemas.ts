/**
 * 共享的Zod Schema定义 - Chrome扩展版本
 * 与前端保持一致的类型验证
 */

import { z } from 'zod';

// 书签Schema
export const BookmarkSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "标题不能为空"),
  url: z.string().url("必须是有效的URL"),
  folderId: z.string().nullable().optional(),
  favicon: z.string().optional(),
  faviconUrl: z.string().nullable().optional(),
  isFavorite: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional().default([]),
  userId: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  chromeBookmarkId: z.string().optional(),
});

// 文件夹Schema
export const FolderSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "文件夹名不能为空"),
  parentId: z.string().nullable().optional(),
  userId: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  chromeParentId: z.string().optional(),
});

// API响应Schema
export const APIResponseSchema = z.object({
  items: z.array(z.unknown()).optional(),
});

export const BookmarkListResponseSchema = z.object({
  items: z.array(BookmarkSchema),
});

export const FolderListResponseSchema = z.object({
  items: z.array(FolderSchema),
});

// 认证响应Schema
export const AuthResponseSchema = z.object({
  token: z.string(),
  record: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().optional(),
    avatar: z.string().optional(),
  }).passthrough(),
});

// 创建书签输入Schema
export const CreateBookmarkInputSchema = BookmarkSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
});

// 更新书签输入Schema
export const UpdateBookmarkInputSchema = BookmarkSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
}).partial();

// 创建文件夹输入Schema
export const CreateFolderInputSchema = FolderSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
});

// 更新文件夹输入Schema
export const UpdateFolderInputSchema = FolderSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
}).partial();

// 导出类型
export type Bookmark = z.infer<typeof BookmarkSchema>;
export type Folder = z.infer<typeof FolderSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type CreateBookmarkInput = z.infer<typeof CreateBookmarkInputSchema>;
export type UpdateBookmarkInput = z.infer<typeof UpdateBookmarkInputSchema>;
export type CreateFolderInput = z.infer<typeof CreateFolderInputSchema>;
export type UpdateFolderInput = z.infer<typeof UpdateFolderInputSchema>;

// 验证辅助函数
export function validateBookmark(data: unknown): Bookmark {
  return BookmarkSchema.parse(data);
}

export function validateFolder(data: unknown): Folder {
  return FolderSchema.parse(data);
}

export function validateAuthResponse(data: unknown): AuthResponse {
  return AuthResponseSchema.parse(data);
}

// 安全验证函数
export function safeValidateBookmark(data: unknown): {
  success: boolean;
  data?: Bookmark;
  errors?: string[];
} {
  try {
    const bookmark = BookmarkSchema.parse(data);
    return { success: true, data: bookmark };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`)
      };
    }
    return {
      success: false,
      errors: [error instanceof Error ? error.message : '未知验证错误']
    };
  }
}

export function safeValidateFolder(data: unknown): {
  success: boolean;
  data?: Folder;
  errors?: string[];
} {
  try {
    const folder = FolderSchema.parse(data);
    return { success: true, data: folder };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`)
      };
    }
    return {
      success: false,
      errors: [error instanceof Error ? error.message : '未知验证错误']
    };
  }
}