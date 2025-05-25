/**
 * 应用配置管理
 * 
 * 统一管理环境变量和应用配置
 */

// 动态获取API基础URL的函数
const getApiBaseUrl = (): string => {
  // 优先从运行时注入的 window._env_ 对象中获取
  if (typeof window !== 'undefined' && (window as any)._env_ && (window as any)._env_.APP_API_BASE_URL) {
    return (window as any)._env_.APP_API_BASE_URL;
  }
  
  // 回退到环境变量或默认值
  return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8090';
};

// API基础URL配置
export const API_CONFIG = {
  // 使用getter确保每次访问时都是最新的值
  get BASE_URL() {
    return getApiBaseUrl();
  },
  
  // API端点前缀
  ENDPOINTS: {
    AUTH: '/api/collections/users',
    BOOKMARKS: '/api/collections/bookmarks/records',
    FOLDERS: '/api/collections/folders/records',
    USER_SETTINGS: '/api/collections/user_settings/records',
    CUSTOM_TAGS: '/api/custom/suggest-tags-for-bookmark',
    CUSTOM_FOLDER: '/api/custom/suggest-folder',
    WEBDAV_BACKUP: '/api/custom/webdav/backup',
    WEBDAV_RESTORE: '/api/custom/webdav/restore',
    BATCH_DELETE_TAGS: '/api/custom/tags/batch-delete',
    CLEAR_DATA: '/api/custom/clear-all-user-data',
    FETCH_FAVICON: '/api/custom/fetch-favicon',
  }
};

// 应用配置
export const APP_CONFIG = {
  // 应用名称
  NAME: 'MarkHub',
  
  // 版本
  VERSION: '1.0.0',
  
  // 官方网站
  WEBSITE: 'https://markhub.app',
  
  // 默认配置
  DEFAULTS: {
    THEME: 'light',
    LANGUAGE: 'zh',
    ACCENT_COLOR: 'blue',
  }
};

// 导出完整的API基础URL，方便其他模块使用
export { getApiBaseUrl };

// 构建完整的API端点URL
export const buildApiUrl = (endpoint: keyof typeof API_CONFIG.ENDPOINTS) => {
  return `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS[endpoint]}`;
};

// 构建自定义API端点URL
export const buildCustomApiUrl = (customPath: string) => {
  // 确保路径以 / 开头
  const path = customPath.startsWith('/') ? customPath : `/${customPath}`;
  return `${API_CONFIG.BASE_URL}${path}`;
};

// 导出环境相关的配置
export const ENV_CONFIG = {
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isClient: typeof window !== 'undefined',
};