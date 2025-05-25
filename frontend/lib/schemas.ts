/**
 * 共享的Zod Schema定义
 * 用于前端和扩展的运行时类型验证
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
  isFavorite: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  description: z.string().optional(), // 书签描述信息
  img: z.string().optional(), // 书签图片 URL 或路径
  userId: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  chromeBookmarkId: z.string().optional(),
  // PocketBase 字段
  collectionId: z.string().optional(),
  collectionName: z.string().optional(),
  // 兼容性字段
  created: z.string().optional(),
  updated: z.string().optional(),
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
  // PocketBase 字段
  collectionId: z.string().optional(),
  collectionName: z.string().optional(),
  // 兼容性字段
  created: z.string().optional(),
  updated: z.string().optional(),
});

// 用户设置Schema
export const UserSettingSchema = z.object({
  id: z.string(),
  userId: z.string(),
  darkMode: z.boolean().optional().default(false),
  accentColor: z.string().optional().default('#007bff'),
  defaultView: z.string().optional(),
  language: z.string().optional().default('en'),
  geminiApiKey: z.string().optional().default(''),
  geminiApiBaseUrl: z.string().optional().default(''),
  geminiModelName: z.string().optional().default(''),
  webdav_config: z.object({
    Url: z.string().optional().default(''),
    Username: z.string().optional().default(''),
    Password: z.string().optional().default(''),
    Path: z.string().optional().default('/bookmarks/'),
    AutoSync: z.boolean().optional().default(false),
  }).optional(),
  favoriteFolderIds: z.array(z.string()).optional().default([]),
  tagList: z.array(z.string()).optional().default([]),
  sortOption: z.string().optional().default('createdAt_desc'),
  searchFields: z.array(z.string()).optional().default(['title', 'url', 'tags']),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  // PocketBase 字段
  collectionId: z.string().optional(),
  collectionName: z.string().optional(),
  // 兼容性字段
  created: z.string().optional(),
  updated: z.string().optional(),
});

// WebDAV配置类型
export const WebDAVConfigSchema = z.object({
  Url: z.string().optional().default(''),
  Username: z.string().optional().default(''),
  Password: z.string().optional().default(''),
  Path: z.string().optional().default('/bookmarks/'),
  AutoSync: z.boolean().optional().default(false),
});

// API响应Schema
export const APIResponseSchema = z.object({
  items: z.array(z.unknown()).optional(),
});

export const BookmarkListResponseSchema = z.object({
  items: z.array(BookmarkSchema),
  page: z.number().optional(),
  perPage: z.number().optional(),
  totalItems: z.number().optional(),
  totalPages: z.number().optional(),
});

export const FolderListResponseSchema = z.object({
  items: z.array(FolderSchema),
  page: z.number().optional(),
  perPage: z.number().optional(),
  totalItems: z.number().optional(),
  totalPages: z.number().optional(),
});

// 认证响应Schema
export const AuthResponseSchema = z.object({
  token: z.string(),
  record: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().optional(),
    avatar: z.string().optional(),
  }).passthrough(), // 允许其他字段
});

// 创建书签输入Schema（不包含自动生成的字段）
export const CreateBookmarkInputSchema = BookmarkSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  collectionId: true,
  collectionName: true,
});

// 更新书签输入Schema（所有字段都是可选的）
export const UpdateBookmarkInputSchema = BookmarkSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  collectionId: true,
  collectionName: true,
}).partial();

// 创建文件夹输入Schema
export const CreateFolderInputSchema = FolderSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  collectionId: true,
  collectionName: true,
});

// 更新文件夹输入Schema
export const UpdateFolderInputSchema = FolderSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  collectionId: true,
  collectionName: true,
}).partial();

// 导出类型
export type Bookmark = z.infer<typeof BookmarkSchema>;
export type Folder = z.infer<typeof FolderSchema>;
export type UserSetting = z.infer<typeof UserSettingSchema>;
export type WebDAVConfigType = z.infer<typeof WebDAVConfigSchema>;
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

export function validateUserSetting(data: unknown): UserSetting {
  return UserSettingSchema.parse(data);
}

export function validateAuthResponse(data: unknown): AuthResponse {
  return AuthResponseSchema.parse(data);
}

// 安全验证函数（返回结果而不是抛出错误）
export function safeValidateBookmark(data: unknown): {
  success: boolean;
  data?: Bookmark;
  errors?: string[];
} {
  try {
    const bookmark = BookmarkSchema.parse(data);
    return { success: true, data: bookmark };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      };
    }
    return {
      success: false,
      errors: [error instanceof Error ? error.message : '未知验证错误']
    };
  }
}