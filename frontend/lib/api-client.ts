import { UserSetting } from '../types'; // 新增导入
import { getApiBaseUrl } from './config'; // 导入配置
import {
  BookmarkSchema,
  FolderSchema,
  UserSettingSchema,
  AuthResponseSchema,
  BookmarkListResponseSchema,
  FolderListResponseSchema,
  CreateBookmarkInputSchema,
  UpdateBookmarkInputSchema,
  CreateFolderInputSchema,
  UpdateFolderInputSchema,
  safeValidateBookmark,
  safeValidateFolder,
  type Bookmark,
  type Folder,
  type AuthResponse
} from './schemas';
import { z, ZodError } from 'zod';

const API_BASE_URL = getApiBaseUrl(); // 使用配置中的API基础URL

interface FetchAPIOptions extends RequestInit {
  token?: string;
}

export async function fetchAPI<T = any>( // 添加 export
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: any,
  options?: FetchAPIOptions
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (options?.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const config: RequestInit = {
    method,
    headers,
    ...options,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    if (response.status === 401 || response.status === 403) {
      // Dispatch a custom event to be caught by AuthContext
      window.dispatchEvent(new CustomEvent('auth-error'));
    }
    throw new Error(errorData.message || `API request failed with status ${response.status}`);
  }

  // For DELETE requests or responses with no content
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// 带验证的API请求函数
export async function fetchAPIWithValidation<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: any,
  options?: FetchAPIOptions,
  validator?: (data: unknown) => T
): Promise<T> {
  const response = await fetchAPI<unknown>(endpoint, method, body, options);
  
  if (validator) {
    try {
      return validator(response);
    } catch (error) {
      if (error instanceof ZodError) {
        console.error('API Response validation failed:', error.errors);
        throw new Error(`API响应格式验证失败: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }
  
  return response as T;
}

export async function loginUser(identity: string, password: string): Promise<AuthResponse> {
  return fetchAPIWithValidation(
    '/api/collections/users/auth-with-password',
    'POST',
    { identity, password },
    undefined,
    (data) => AuthResponseSchema.parse(data)
  );
}

export async function registerUser(email: string, password: string, passwordConfirm: string): Promise<any> {
  // 验证输入参数
  const inputSchema = z.object({
    email: z.string().email('请输入有效的邮箱地址'),
    password: z.string().min(6, '密码至少需要6个字符'),
    passwordConfirm: z.string()
  }).refine((data) => data.password === data.passwordConfirm, {
    message: "密码确认不匹配",
    path: ["passwordConfirm"],
  });

  const validatedInput = inputSchema.parse({ email, password, passwordConfirm });

  return fetchAPI<any>(
    '/api/collections/users/records',
    'POST',
    validatedInput
  );
}

// Import types from schemas instead of defining them here
export type { Bookmark, Folder } from '@/lib/schemas';


export async function getBookmarks(token: string): Promise<Bookmark[]> {
  const response = await fetchAPIWithValidation(
    '/api/collections/bookmarks/records?perPage=5000',
    'GET',
    undefined,
    { token },
    (data) => {
      // 处理null或undefined的情况
      if (data === null || data === undefined) {
        return { items: [] };
      }
      
      // PocketBase 可能返回 {items: [...]} 或直接返回数组
      if (Array.isArray(data)) {
        return { items: z.array(BookmarkSchema).parse(data) };
      }
      return BookmarkListResponseSchema.parse(data);
    }
  );
  return response.items || [];
}

export async function getFolders(token: string): Promise<Folder[]> {
  const response = await fetchAPIWithValidation(
    '/api/collections/folders/records?perPage=5000',
    'GET',
    undefined,
    { token },
    (data) => {
      // 处理null或undefined的情况
      if (data === null || data === undefined) {
        return { items: [] };
      }
      
      // PocketBase 可能返回 {items: [...]} 或直接返回数组
      if (Array.isArray(data)) {
        return { items: z.array(FolderSchema).parse(data) };
      }
      return FolderListResponseSchema.parse(data);
    }
  );
  return response.items || [];
}

// New API functions for Bookmarks
export async function createBookmark(
  token: string,
  bookmarkData: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { tags?: string[] }
): Promise<Bookmark> {
  const inputData = {
    ...bookmarkData,
    tags: bookmarkData.tags || [],
    description: bookmarkData.description || "",
    img: bookmarkData.img || ""
  };
  
  const validatedInput = CreateBookmarkInputSchema.parse(inputData);
  
  // 过滤掉任何特殊控制标志
  const dataToSend = { ...validatedInput };
  if ('_skipAiClassification' in dataToSend) {
    delete (dataToSend as any)._skipAiClassification;
  }
  if ('_preventAutoTagging' in dataToSend) {
    delete (dataToSend as any)._preventAutoTagging;
  }
  
  console.log("创建书签:", { title: dataToSend.title, url: dataToSend.url, tags: dataToSend.tags });
  
  return fetchAPIWithValidation(
    '/api/collections/bookmarks/records',
    'POST',
    dataToSend,
    { token },
    (data) => BookmarkSchema.parse(data)
  );
}

export async function updateBookmark(
  token: string,
  bookmarkId: string,
  bookmarkData: Partial<Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'userId'>> & { tags?: string[] }
): Promise<Bookmark> {
  const validatedInput = UpdateBookmarkInputSchema.parse(bookmarkData);
  
  // 构造要发送的数据，只包含实际传入的字段
  const dataToSend: any = { ...validatedInput };

  // 如果 bookmarkData 中没有显式提供 tags，则从 dataToSend 中删除它
  if (!('tags' in bookmarkData)) {
    delete dataToSend.tags;
  } else {
    dataToSend.tags = bookmarkData.tags;
  }
  
  // 过滤掉任何特殊控制标志
  if ('_skipAiClassification' in dataToSend) {
    delete dataToSend._skipAiClassification;
  }
  if ('_preventAutoTagging' in dataToSend) {
    delete dataToSend._preventAutoTagging;
  }

  console.log("更新书签:", { id: bookmarkId, changes: Object.keys(dataToSend) });
  
  return fetchAPIWithValidation(
    `/api/collections/bookmarks/records/${bookmarkId}`,
    'PATCH',
    dataToSend,
    { token },
    (data) => BookmarkSchema.parse(data)
  );
}

export async function deleteBookmark(token: string, bookmarkId: string): Promise<void> {
  await fetchAPI<void>(
    `/api/collections/bookmarks/records/${bookmarkId}`,
    'DELETE',
    undefined,
    { token }
  );
}

export async function setBookmarkFavoriteStatus(
  token: string,
  bookmarkId: string,
  isFavorite: boolean
): Promise<Bookmark> {
  return fetchAPI<Bookmark>(
    `/api/collections/bookmarks/records/${bookmarkId}`,
    'PATCH',
    { isFavorite },
    { token }
  );
}

// New API function for adding tags in batch to a bookmark
export async function addTagsBatchToBookmark(
  token: string,
  bookmarkId: string,
  tagsInput: string
): Promise<Bookmark> {
  return fetchAPI<Bookmark>(
    `/api/custom/bookmarks/${bookmarkId}/add-tags-batch`,
    'POST',
    { tagsInput },
    { token }
  );
}

// New API functions for Folders
export async function createFolder(
  token: string,
  folderData: Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'userId'>
): Promise<Folder> {
  // 验证输入数据
  const validatedInput = CreateFolderInputSchema.parse(folderData);
  
  return fetchAPIWithValidation(
    '/api/collections/folders/records',
    'POST',
    validatedInput,
    { token },
    (data) => FolderSchema.parse(data)
  );
}

export async function updateFolder(
  token: string,
  folderId: string,
  folderData: Partial<Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>
): Promise<Folder> {
  // 验证输入数据
  const validatedInput = UpdateFolderInputSchema.parse(folderData);
  
  return fetchAPIWithValidation(
    `/api/collections/folders/records/${folderId}`,
    'PATCH',
    validatedInput,
    { token },
    (data) => FolderSchema.parse(data)
  );
}

export async function deleteFolder(token: string, folderId: string): Promise<void> {
  await fetchAPI<void>(
    `/api/collections/folders/records/${folderId}`,
    'DELETE',
    undefined,
    { token }
  );
}

// User Settings API Functions
export async function getUserSettings(token: string, userId: string): Promise<UserSetting | null> {
  const filter = `filter="userId='${userId}'"`;
  const response = await fetchAPIWithValidation(
    `/api/collections/user_settings/records?${encodeURIComponent(filter)}`,
    'GET',
    undefined,
    { token },
    (data) => {
      // 处理null或undefined的情况
      if (data === null || data === undefined) {
        return { items: [] };
      }
      
      // PocketBase 可能返回 {items: [...]} 或直接返回数组
      if (Array.isArray(data)) {
        return { items: z.array(UserSettingSchema).parse(data) };
      }
      
      // 创建一个临时的UserSettingListResponseSchema
      const UserSettingListResponseSchema = z.object({
        items: z.array(UserSettingSchema),
        page: z.number().optional(),
        perPage: z.number().optional(),
        totalItems: z.number().optional(),
        totalPages: z.number().optional(),
      });
      return UserSettingListResponseSchema.parse(data);
    }
  );
  return response.items && response.items.length > 0 ? response.items[0] : null;
}

export async function updateUserSettings(
  token: string,
  userSettingsId: string,
  settingsData: Partial<UserSetting>
): Promise<UserSetting> {
  // 验证输入数据
  const validatedInput = UserSettingSchema.partial().parse(settingsData);
  
  return fetchAPIWithValidation(
    `/api/collections/user_settings/records/${userSettingsId}`,
    'PATCH',
    validatedInput,
    { token },
    (data) => UserSettingSchema.parse(data)
  );
}

export async function createUserSettings(
  token: string,
  settingsData: Partial<UserSetting> & { userId: string }
): Promise<UserSetting> {
  // 验证输入数据
  const inputSchema = UserSettingSchema.omit({ id: true, createdAt: true, updatedAt: true });
  const validatedInput = inputSchema.parse(settingsData);
  
  return fetchAPIWithValidation(
    '/api/collections/user_settings/records',
    'POST',
    validatedInput,
    { token },
    (data) => UserSettingSchema.parse(data)
  );
}

// WebDAV API 函数 - 新增用于备份的函数
export async function webdavBackup(token: string): Promise<any> {
  return fetchAPI<any>(
    '/api/custom/webdav/backup',
    'POST',
    {},
    { token }
  );
}

// WebDAV API 函数 - 新增用于恢复的函数
export async function webdavRestore(token: string, options?: any): Promise<{ success: boolean; message: string; restored_bookmarks?: number; restored_folders?: number; }> {
  return fetchAPI<{ success: boolean; message: string; restored_bookmarks?: number; restored_folders?: number; }>(
    '/api/custom/webdav/restore',
    'POST',
    options || {},
    { token }
  );
}

// New API function to clear all user data (bookmarks, folders)
export async function clearAllUserData(token: string): Promise<void> {
  await fetchAPI<void>(
    '/api/custom/user-data/clear-all', // Assuming this endpoint will be created in the backend
    'POST', // Using POST for actions that modify server state significantly, could also be DELETE
    {}, // No body needed, action is identified by endpoint and token
    { token }
  );
}
// The refreshBookmarkFaviconAPI function has been removed as per requirements.

export async function fetchFaviconForUrlAPI(token: string, pageUrl: string): Promise<{ requested_url: string; faviconUrl: string | null }> {
  return fetchAPI<{ requested_url: string; faviconUrl: string | null }>(
    '/api/custom/get-favicon',
    'POST',
    { url: pageUrl },
    { token }
  );
}