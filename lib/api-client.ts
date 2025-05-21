import { UserSetting } from '../types'; // 新增导入
const API_BASE_URL = 'http://127.0.0.1:8090';

interface FetchAPIOptions extends RequestInit {
  token?: string;
}

async function fetchAPI<T = any>(
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
    throw new Error(errorData.message || `API request failed with status ${response.status}`);
  }

  // For DELETE requests or responses with no content
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

interface AuthResponse {
  token: string;
  record: any; // Replace 'any' with a more specific user type if available
}

export async function loginUser(identity: string, password: string): Promise<AuthResponse> {
  return fetchAPI<AuthResponse>(
    '/api/collections/users/auth-with-password',
    'POST',
    { identity, password }
  );
}

export async function registerUser(email: string, password: string, passwordConfirm: string): Promise<any> {
  return fetchAPI<any>(
    '/api/collections/users/records',
    'POST',
    { email, password, passwordConfirm }
  );
}

// Updated Bookmark and Folder types
export interface Bookmark {
  id: string;
  title: string;
  url: string;
  folderId?: string | null; // Pocketbase might return null for empty optional relations
  favicon?: string;
  isFavorite?: boolean;
  tags?: string[]; // Assuming tags are an array of strings (tag IDs or names)
  userId: string;
  createdAt: string;
  updatedAt: string;
  // Add other bookmark properties based on your API response
  [key: string]: any; // Keep for flexibility if other fields exist
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string | null; // Pocketbase might return null for empty optional relations
  userId: string;
  createdAt: string;
  updatedAt: string;
  // Add other folder properties based on your API response
  [key: string]: any; // Keep for flexibility if other fields exist
}


export async function getBookmarks(token: string): Promise<Bookmark[]> {
  const response = await fetchAPI<{ items: Bookmark[] }>('/api/collections/bookmarks/records', 'GET', undefined, { token });
  return response.items || [];
}

export async function getFolders(token: string): Promise<Folder[]> {
  const response = await fetchAPI<{ items: Folder[] }>('/api/collections/folders/records', 'GET', undefined, { token });
  return response.items || [];
}

// New API functions for Bookmarks
export async function createBookmark(
  token: string,
  bookmarkData: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { tags?: string[] }
): Promise<Bookmark> {
  // 确保我们提供明确的tags数组，即使是空的
  const dataToSend = {
    ...bookmarkData,
    tags: bookmarkData.tags || []
  };
  
  // 过滤掉任何特殊控制标志
  if ('_skipAiClassification' in dataToSend) {
    delete dataToSend._skipAiClassification;
  }
  if ('_preventAutoTagging' in dataToSend) {
    delete dataToSend._preventAutoTagging;
  }
  
  // 记录调试信息
  console.log("创建书签: 发送到API的数据:", dataToSend);
  
  return fetchAPI<Bookmark>(
    '/api/collections/bookmarks/records',
    'POST',
    dataToSend,
    { token }
  );
}

export async function updateBookmark(
  token: string,
  bookmarkId: string,
  bookmarkData: Partial<Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'userId'>> & { tags?: string[] }
): Promise<Bookmark> {
  // 确保我们提供明确的tags数组，即使是空的
  const dataToSend = {
    ...bookmarkData,
    tags: bookmarkData.tags || []
  };
  
  // 过滤掉任何特殊控制标志
  if ('_skipAiClassification' in dataToSend) {
    delete dataToSend._skipAiClassification;
  }
  if ('_preventAutoTagging' in dataToSend) {
    delete dataToSend._preventAutoTagging;
  }
  
  // 记录调试信息
  console.log("更新书签: 发送到API的数据:", dataToSend);
  
  return fetchAPI<Bookmark>(
    `/api/collections/bookmarks/records/${bookmarkId}`,
    'PATCH',
    dataToSend,
    { token }
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
  return fetchAPI<Folder>(
    '/api/collections/folders/records',
    'POST',
    folderData,
    { token }
  );
}

export async function updateFolder(
  token: string,
  folderId: string,
  folderData: Partial<Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>
): Promise<Folder> {
  return fetchAPI<Folder>(
    `/api/collections/folders/records/${folderId}`,
    'PATCH',
    folderData,
    { token }
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
  const response = await fetchAPI<{ items: UserSetting[] }>(
    `/api/collections/user_settings/records?${encodeURIComponent(filter)}`,
    'GET',
    undefined,
    { token }
  );
  return response.items && response.items.length > 0 ? response.items[0] : null;
}

export async function updateUserSettings(
  token: string,
  userSettingsId: string,
  settingsData: Partial<UserSetting>
): Promise<UserSetting> {
  return fetchAPI<UserSetting>(
    `/api/collections/user_settings/records/${userSettingsId}`,
    'PATCH',
    settingsData,
    { token }
  );
}

export async function createUserSettings(
  token: string,
  settingsData: Partial<UserSetting> & { userId: string }
): Promise<UserSetting> {
  return fetchAPI<UserSetting>(
    '/api/collections/user_settings/records',
    'POST',
    settingsData,
    { token }
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
export async function webdavRestore(token: string, options?: any): Promise<any> {
  return fetchAPI<any>(
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