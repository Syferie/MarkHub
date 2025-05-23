"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { useAuth } from "@/context/auth-context"

// 支持的语言
export type Language = "en" | "zh"

// 语言上下文类型
interface LanguageContextType {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: string, params?: Record<string, string>) => string
}

// 创建上下文
const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

// 翻译数据
const translations: Record<Language, Record<string, string>> = {
  en: {
    // 通用
    "app.name": "MarkHub",
    "app.description": "A modern bookmark manager",
    "common.close": "Close",
    "dashboard.tagsButton": "Tags",

    // 日期格式
    "dateFormat.today": "Today",
    "dateFormat.yesterday": "Yesterday",
    "dateFormat.daysAgo": "{days} days ago",
    "dateFormat.unknown": "Unknown date",

    // 书签面板
    "dashboard.addBookmark": "Add Bookmark",
    "dashboard.search": "Search bookmarks...",
    "dashboard.filteredBy": "Filtered by:",
    "dashboard.folder": "Folder:",
    "dashboard.tag": "Tag:",
    "dashboard.clearFilters": "Clear Filters",
    "dashboard.noFilters": "No filters applied",
    "dashboard.collections": "Collections",
    "dashboard.tags": "Tags",
    "dashboard.searchFilters": "Search Filters",
    "dashboard.title": "Title",
    "dashboard.url": "URL",
    "dashboard.tagsField": "Tags",
    "dashboard.allBookmarks": "All Bookmarks",
    "dashboard.favorites": "Favorites",

    // 文件夹树
    "folders.title": "Folders",
    "folders.addRootFolder": "Add root folder",
    "folders.addSubfolder": "Add subfolder",
    "folders.newFolder": "New Folder",
    "folders.add": "Add",
    "folders.cancel": "Cancel",
    "folders.edit": "Edit",
    "folders.delete": "Delete",
    "folders.confirmDelete": "Are you sure you want to delete this folder and all its subfolders?",
    "folders.confirmDeleteWithBookmarks": "This folder contains bookmarks. They will be moved to the root level. Continue?",
    "folder.selectFolder": "Select a folder",
    "folder.noFoldersFound": "No folders found",

    // 标签管理
    "tags.title": "Tags",
    "tags.addTag": "Add tag",
    "tags.enterTags": "Enter tags, separated by commas.",
    "tags.add": "Add",
    "tags.cancel": "Cancel",
    "tags.manageTags": "Manage Tags",
    "tags.searchTags": "Search tags...",
    "tags.batchEdit": "Batch Edit",
    "tags.cancelBatchEdit": "Cancel Batch Edit",
    "tags.deleteSelected": "Delete Selected",
 
    // 书签列表
    "bookmarks.noBookmarks": "No bookmarks found",
    "bookmarks.addYourFirst": "Add your first bookmark",
    "bookmarks.sortBy": "Sort by:",
    "bookmarks.bulkEdit": "Bulk Edit",
    "bookmarks.bulkActions": "Bulk Actions",
    "bookmarks.selectAll": "Select All",
    "bookmarks.deselectAll": "Deselect All",
    "bookmarks.selected": "{count} of {total} selected",
    "bookmarks.addToFavorites": "Add to Favorites",
    "bookmarks.removeFromFavorites": "Remove from Favorites",
    "bookmarks.delete": "Delete Selected",
    "bookmarks.edit": "Edit",
    "bookmarks.open": "Open",
    "bookmarks.confirmDelete": "Are you sure you want to delete this bookmark?",
    "bookmarks.confirmBulkDelete": "Are you sure you want to delete the selected bookmarks?",
    "bookmarks.generateTags": "Generate Tags (AI)",
    "bookmarks.suggestFolder": "Suggest Folder (AI)",
    "bookmarks.actions": "Actions",
    "bookmarks.cancel": "Cancel",
    "bookmarks.refreshingFavicons": "Refreshing favicons for {count} bookmarks...",
    "bookmarks.refreshFaviconsComplete": "Favicon refresh complete for {count} bookmarks.",
    "bookmarks.refreshFaviconsAttempted": "Favicon refresh attempted for {count} bookmarks. Success: {success}, Failed: {failed}.",
    "bookmarks.refreshFaviconsAction": "Refresh Favicons",

    // 添加/编辑书签模态框
    "bookmarkModal.addTitle": "Add Bookmark",
    "bookmarkModal.editTitle": "Edit Bookmark",
    "bookmarkModal.title": "Title",
    "bookmarkModal.url": "URL",
    "bookmarkModal.folder": "Folder",
    "bookmarkModal.tags": "Tags",
    "bookmarkModal.enterTags": "Enter tags",
    "bookmarkModal.suggestTags": "Suggest Tags (AI)",
    "bookmarkModal.suggestFolder": "Suggest Folder (AI)",
    "bookmarkModal.save": "Save",
    "bookmarkModal.cancel": "Cancel",
    "bookmarkModal.apiNotConfigured": "API not configured",
    "bookmarkModal.configureTags": "Please configure the tag API in settings",
    "bookmarkModal.configureFolder": "Please configure the folder API in settings",
    "bookmarkModal.enterUrlFirst": "Please enter URL first",
    "bookmarkModal.selectOrCreateTags": "Select or create tags",
    "bookmarkModal.create": "Create",
    "bookmarkModal.nothingFound": "Nothing found",
    "bookmarkModal.update": "Update Bookmark",

    // 设置模态框
    "settings.title": "Settings",
    "settings.appearance": "Appearance",
    "settings.api": "API",
    "settings.sync": "Sync",
    "settings.data": "Data",
    "settings.language": "Language",
    "settings.darkMode": "Dark Mode",
    "settings.accentColor": "Accent Color",
    "settings.defaultView": "Default View",
    "settings.allBookmarks": "All Bookmarks",
    "settings.favorites": "Favorites",
    "settings.apiBaseUrl": "API Base URL",
    "settings.apiUrlPlaceholder": "https://api.tag-service.example.com",
    "settings.apiUrlDescription": "Enter the base URL of the tag generation service, e.g. https://api.tag-service.example.com",
    "settings.apiKey": "API Key",
    "settings.apiKeyPlaceholder": "Your API key",
    "settings.apiKeyDescription": "This key will be used in the Authorization header of API requests as Bearer <API_KEY>",
    "settings.geminiDescription": "Configure custom parameters for API (optional)",
    "settings.geminiBaseUrlDescription": "Using OpenAI compatible endpoint, ensure the URL ends with /v1 suffix",
    "settings.geminiModelDescription": "Default model gemini-2.0-flash provides a good balance of price and quality",
    "settings.geminiApiKeyPlaceholder": "Enter your API Key",
    "settings.geminiApiKeyDescription": "Your API Key and settings are stored locally only and not transmitted to the cloud, ensuring data security",
    "ai.taskProcessing": "Task is processing",
    "settings.concurrencyLimit": "Concurrency Limit",
    "settings.concurrencyDescription": "Maximum number of simultaneous API requests",
    "settings.save": "Save Changes",
    "settings.webdavSync": "WebDAV Sync",
    "settings.webdavDescription": "Sync your bookmarks across devices using WebDAV protocol. This allows you to access your bookmarks from any device that can connect to your WebDAV server.",
    "settings.importExport": "Import/Export",
    "settings.importExportDescription": "Export your bookmarks to a file or import from a file.",
    "settings.dataManagement": "Data Management",
    "settings.refreshFavicons": "Refresh All Favicons",
    "settings.clearData": "Clear All Data",
    "settings.resetData": "Reset to Sample Data",
    "settings.confirmClearData": "Are you sure you want to clear all bookmark data? This action cannot be undone!",
    "settings.confirmResetData": "Are you sure you want to reset to sample data? All current bookmark data will be replaced!",
    "settings.apiSpecification": "API Specification:",
    "settings.apiEndpointInfo": "The system will send a POST request to",
    "settings.apiRequestFormat": "Request body format",
    "settings.apiTaskIdInfo": "Upon success, a task ID is returned, and the system will automatically poll the task status until completion",
    "settings.apiResponseFormat": "Completed response format",
    "settings.apiAuthHeader": "All requests include the header",

    // 关于页面
    "settings.about": "About",
    "settings.aboutTitle": "About MarkHub",
    "settings.aboutDescription": "MarkHub is a modern bookmark management application that combines local storage with cloud synchronization capabilities.",
    "settings.licenseTitle": "License",
    "settings.licenseDescription": "MarkHub is licensed under the CC BY-NC 4.0 License:",
    "settings.viewFullLicense": "View Full License",
    "settings.versionTitle": "Version",
    "settings.versionInfo": "Version",
    "settings.linksTitle": "Links",
    "settings.githubRepo": "GitHub Repository",
    "settings.officialWebsite": "Official Website",

    // WebDAV同步
    "webdav.configure": "Configure WebDAV",
    "webdav.serverUrl": "Server URL",
    "webdav.username": "Username",
    "webdav.password": "Password",
    "webdav.path": "Storage Path",
    "webdav.autoSync": "Auto-sync on changes",
    "webdav.save": "Save Configuration",
    "webdav.upload": "Upload to WebDAV",
    "webdav.download": "Download from WebDAV",
    "webdav.fillAllFields": "Please fill in all WebDAV connection fields",
    "webdav.pathDescription": "Path where bookmarks will be stored on the server",
    "webdav.autoSyncDescription": "When enabled, your bookmarks will be automatically backed up to your cloud storage when you add or edit a bookmark.",
    "webdav.webdavDescription": "Sync your bookmarks with a WebDAV server to access them from any device.",
    "webdav.saveChanges": "Save Changes",

    // 导入/导出
    "importExport.export": "Export",
    "importExport.import": "Import",
    "importExport.uploadFile": "Upload File",
    "importExport.preview": "Preview",
    "importExport.dragDrop": "Drag and drop a file here, or click to select a file",
    "importExport.fileType": "Supported file types: .json, .html",
    "importExport.importSummary": "Import Summary",
    "importExport.bookmarks": "Bookmarks",
    "importExport.folders": "Folders",
    "importExport.tags": "Tags",
    "importExport.importButton": "Import",
    "importExport.cancel": "Cancel",
    "importExport.selectFileDescription": "Select a file to import your bookmarks. You'll be able to preview the data before importing.",
    "importExport.importFormat": "Import Format",
    "importExport.selectFile": "Select {format} file",
    "importExport.selectedFile": "Selected file:",
    "importExport.importBookmarks": "Import Bookmarks",
    "importExport.error": "Error",
    "importExport.success": "Success",
    "importExport.importCompleted": "Import completed successfully! Your data has been saved to IndexedDB.",
    "importExport.warning": "Warning",
    "importExport.importWarning": "Importing will replace your current bookmarks, folders, tags, and settings. This action cannot be undone.",
    "importExport.currentData": "Current Data",
    "importExport.exportDate": "Export Date",
    "importExport.bookmarksPreview": "Bookmarks Preview",
    "importExport.foldersPreview": "Folders Preview",
    "importExport.tagsPreview": "Tags Preview",
    "importExport.settings": "Settings",
    "importExport.darkMode": "Dark Mode",
    "importExport.enabled": "Enabled",
    "importExport.disabled": "Disabled",
    "importExport.accentColor": "Accent Color",
    "importExport.defaultView": "Default View",
    "importExport.subfolder": "Subfolder",
    "importExport.andMore": "And {count} more...",
    "importExport.confirmImport": "Confirm Import",
    "importExport.importing": "Importing...",

    // AI分类指示器
    "ai.processing": "Processing",
    "ai.processingEllipsis": "Processing...",
    "ai.concurrent": "concurrent",
    "ai.canceled": "Canceled",
    "ai.completed": "completed",
    "ai.succeeded": "Succeeded",
    "ai.failed": "Failed",
    "ai.pending": "Pending",
    "ai.tagGeneration": "AI Tag Generation",
    "ai.folderSuggestion": "AI Folder Suggestion",
    "ai.tagGenerationStatus": "AI Tag Generation Status",
    "ai.folderSuggestionStatus": "AI Folder Suggestion Status",
    "ai.overallProgress": "Overall Progress",
    "ai.warningMessage": "Warning: Please do not refresh or close this page while tasks are in progress, as it will cancel the current operation.",
    "ai.cancel": "Cancel",
    "ai.tagsInProgress": "Generating tags",
    "ai.foldersInProgress": "Suggesting folders",
    "ai.viewDetails": "View Details",
    "ai.classification": "AI Classification",
    "ai.classificationStatus": "AI Classification Status",
    "ai.processed": "Processed",
    "ai.clearCompletedTasks": "Clear Completed Tasks",
    "ai.clearAllTasks": "Clear All Tasks",
    "ai.generating": "Generating...",
    "ai.suggesting": "Suggesting...",
    "ai.folderError": "Folder Error",
    "ai.tagError": "Tag Error",
    "ai.tagGenerationFailed": "Tag generation failed",
    "ai.folderSuggestionFailed": "Folder suggestion failed",

    // 错误信息
    "error.fetchFailed": "Fetch failed",
    "error.apiError": "API Error",
    "error.networkError": "Network Error",
    "error.importError": "Import Error",
  },
  zh: {
    // 通用
    "app.name": "MarkHub",
    "app.description": "现代书签管理器",
    "common.close": "关闭",
    "dashboard.tagsButton": "标签",

    // 日期格式
    "dateFormat.today": "今天",
    "dateFormat.yesterday": "昨天",
    "dateFormat.daysAgo": "{days}天前",
    "dateFormat.unknown": "未知日期",

    // 书签面板
    "dashboard.addBookmark": "添加书签",
    "dashboard.search": "搜索书签...",
    "dashboard.filteredBy": "筛选条件：",
    "dashboard.folder": "文件夹：",
    "dashboard.tag": "标签：",
    "dashboard.clearFilters": "清除筛选",
    "dashboard.noFilters": "未应用筛选",
    "dashboard.collections": "收藏集",
    "dashboard.tags": "标签",
    "dashboard.searchFilters": "搜索过滤器",
    "dashboard.title": "标题",
    "dashboard.url": "网址",
    "dashboard.tagsField": "标签",
    "dashboard.allBookmarks": "所有书签",
    "dashboard.favorites": "收藏夹",

    // 文件夹树
    "folders.title": "文件夹",
    "folders.addRootFolder": "添加根文件夹",
    "folders.addSubfolder": "添加子文件夹",
    "folders.newFolder": "新文件夹",
    "folders.add": "添加",
    "folders.cancel": "取消",
    "folders.edit": "编辑",
    "folders.delete": "删除",
    "folders.confirmDelete": "确定要删除此文件夹及其所有子文件夹吗？",
    "folders.confirmDeleteWithBookmarks": "此文件夹包含书签。它们将被移动到根级别。是否继续？",
    "folder.selectFolder": "选择文件夹",
    "folder.noFoldersFound": "未找到文件夹",

    // 标签管理
    "tags.title": "标签",
    "tags.addTag": "添加标签",
    "tags.enterTags": "输入标签，用逗号分隔。",
    "tags.add": "添加",
    "tags.cancel": "取消",
    "tags.manageTags": "管理标签",
    "tags.searchTags": "搜索标签...",
    "tags.batchEdit": "批量编辑",
    "tags.cancelBatchEdit": "取消批量编辑",
    "tags.deleteSelected": "删除选中标签",
 
    // 书签列表
    "bookmarks.noBookmarks": "未找到书签",
    "bookmarks.addYourFirst": "添加您的第一个书签",
    "bookmarks.sortBy": "排序方式：",
    "bookmarks.bulkEdit": "批量编辑",
    "bookmarks.bulkActions": "批量操作",
    "bookmarks.selectAll": "全选",
    "bookmarks.deselectAll": "取消全选",
    "bookmarks.selected": "已选择 {count}/{total}",
    "bookmarks.addToFavorites": "添加到收藏",
    "bookmarks.removeFromFavorites": "从收藏中移除",
    "bookmarks.delete": "删除所选",
    "bookmarks.edit": "编辑",
    "bookmarks.open": "打开",
    "bookmarks.confirmDelete": "确定要删除此书签吗？",
    "bookmarks.confirmBulkDelete": "确定要删除所选书签吗？",
    "bookmarks.generateTags": "生成标签 (AI)",
    "bookmarks.suggestFolder": "推荐文件夹 (AI)",
    "bookmarks.actions": "操作",
    "bookmarks.cancel": "取消",
    "bookmarks.refreshingFavicons": "正在为 {count} 个书签刷新 Favicon...",
    "bookmarks.refreshFaviconsComplete": "{count} 个书签的 Favicon 已刷新完成。",
    "bookmarks.refreshFaviconsAttempted": "已尝试为 {count} 个书签刷新 Favicon。成功: {success}，失败: {failed}。",
    "bookmarks.refreshFaviconsAction": "刷新图标",

    // 添加/编辑书签模态框
    "bookmarkModal.addTitle": "添加书签",
    "bookmarkModal.editTitle": "编辑书签",
    "bookmarkModal.title": "标题",
    "bookmarkModal.url": "网址",
    "bookmarkModal.folder": "文件夹",
    "bookmarkModal.tags": "标签",
    "bookmarkModal.enterTags": "输入标签",
    "bookmarkModal.suggestTags": "推荐标签 (AI)",
    "bookmarkModal.suggestFolder": "推荐文件夹 (AI)",
    "bookmarkModal.save": "保存",
    "bookmarkModal.cancel": "取消",
    "bookmarkModal.apiNotConfigured": "API未配置",
    "bookmarkModal.configureTags": "请在设置中配置标签API",
    "bookmarkModal.configureFolder": "请在设置中配置文件夹API",
    "bookmarkModal.enterUrlFirst": "请先输入网址",
    "bookmarkModal.selectOrCreateTags": "选择或创建标签",
    "bookmarkModal.create": "创建",
    "bookmarkModal.nothingFound": "未找到结果",
    "bookmarkModal.update": "更新书签",

    // 设置模态框
    "settings.title": "设置",
    "settings.appearance": "外观",
    "settings.api": "API",
    "settings.sync": "同步",
    "settings.data": "数据",
    "settings.language": "语言",
    "settings.darkMode": "深色模式",
    "settings.accentColor": "强调色",
    "settings.defaultView": "默认视图",
    "settings.allBookmarks": "所有书签",
    "settings.favorites": "收藏夹",
    "settings.apiBaseUrl": "API基础URL",
    "settings.apiUrlPlaceholder": "https://api.tag-service.example.com",
    "settings.apiUrlDescription": "输入标签生成服务的基础URL，例如 https://api.tag-service.example.com",
    "settings.apiKey": "API密钥",
    "settings.apiKeyPlaceholder": "您的API密钥",
    "settings.apiKeyDescription": "此密钥将用于API请求的Authorization头部，格式为Bearer <API_KEY>",
    "settings.geminiDescription": "配置 PI的自定义参数（可选）",
    "settings.geminiBaseUrlDescription": "使用OpenAI兼容端口，请确保URL末尾包含/v1后缀",
    "settings.geminiModelDescription": "默认使用gemini-2.0-flash模型，能够平衡价格与质量",
    "settings.geminiApiKeyPlaceholder": "输入您的API Key",
    "settings.geminiApiKeyDescription": "您的API Key和设置仅存储在本地，不会向云端传输，确保数据安全",
    "ai.taskProcessing": "任务正在处理中",
    "settings.concurrencyLimit": "并发限制",
    "settings.concurrencyDescription": "同时API请求的最大数量",
    "settings.save": "保存更改",
    "settings.webdavSync": "WebDAV同步",
    "settings.webdavDescription": "使用WebDAV协议在多个设备间同步您的书签。这允许您从任何可以连接到WebDAV服务器的设备访问您的书签。",
    "settings.importExport": "导入/导出",
    "settings.importExportDescription": "将您的书签导出到文件或从文件导入。",
    "settings.dataManagement": "数据管理",
    "settings.refreshFavicons": "刷新所有图标",
    "settings.clearData": "清除所有数据",
    "settings.resetData": "重置为示例数据",
    "settings.confirmClearData": "确定要清除所有书签数据吗？此操作不可恢复！",
    "settings.confirmResetData": "确定要重置为示例数据吗？当前所有书签数据将被替换！",
    "settings.apiSpecification": "API规范：",
    "settings.apiEndpointInfo": "系统将发送POST请求到",
    "settings.apiRequestFormat": "请求体格式",
    "settings.apiTaskIdInfo": "成功后，将返回任务ID，系统将自动轮询任务状态直至完成",
    "settings.apiResponseFormat": "完成响应格式",
    "settings.apiAuthHeader": "所有请求都包含头部",

    // 关于页面
    "settings.about": "关于",
    "settings.aboutTitle": "关于 MarkHub",
    "settings.aboutDescription": "MarkHub 是一个现代书签管理应用，结合了本地存储的便捷性和云同步的灵活性。",
    "settings.licenseTitle": "许可证",
    "settings.licenseDescription": "MarkHub 使用 CC BY-NC 4.0 知识共享署名-非商业性使用许可证：",
    "settings.viewFullLicense": "查看完整许可证",
    "settings.versionTitle": "版本",
    "settings.versionInfo": "版本",
    "settings.linksTitle": "链接",
    "settings.githubRepo": "GitHub 仓库",
    "settings.officialWebsite": "官方网站",

    // WebDAV同步
    "webdav.configure": "配置WebDAV",
    "webdav.serverUrl": "服务器URL",
    "webdav.username": "用户名",
    "webdav.password": "密码",
    "webdav.path": "存储路径",
    "webdav.autoSync": "变更时自动同步",
    "webdav.save": "保存配置",
    "webdav.upload": "上传到WebDAV",
    "webdav.download": "从WebDAV下载",
    "webdav.fillAllFields": "请填写所有WebDAV连接字段",
    "webdav.pathDescription": "书签将存储在服务器上的路径",
    "webdav.autoSyncDescription": "启用后，当您添加或编辑书签时，您的书签将自动备份到云存储。",
    "webdav.webdavDescription": "通过WebDAV服务器同步您的书签，以便从任何设备访问它们。",
    "webdav.saveChanges": "保存更改",

    // 导入/导出
    "importExport.export": "导出",
    "importExport.import": "导入",
    "importExport.uploadFile": "上传文件",
    "importExport.preview": "预览",
    "importExport.dragDrop": "拖放文件到此处，或点击选择文件",
    "importExport.fileType": "支持的文件类型：.json, .html",
    "importExport.importSummary": "导入摘要",
    "importExport.bookmarks": "书签",
    "importExport.folders": "文件夹",
    "importExport.tags": "标签",
    "importExport.importButton": "导入",
    "importExport.cancel": "取消",
    "importExport.selectFileDescription": "选择一个文件导入您的书签。您可以在导入前预览数据。",
    "importExport.importFormat": "导入格式",
    "importExport.selectFile": "选择 {format} 文件",
    "importExport.selectedFile": "已选择文件：",
    "importExport.importBookmarks": "导入书签",
    "importExport.error": "错误",
    "importExport.success": "成功",
    "importExport.importCompleted": "导入成功完成！您的数据已保存到IndexedDB。",
    "importExport.warning": "警告",
    "importExport.importWarning": "导入将替换您当前的书签、文件夹、标签和设置。此操作无法撤消。",
    "importExport.currentData": "当前数据",
    "importExport.exportDate": "导出日期",
    "importExport.bookmarksPreview": "书签预览",
    "importExport.foldersPreview": "文件夹预览",
    "importExport.tagsPreview": "标签预览",
    "importExport.settings": "设置",
    "importExport.darkMode": "深色模式",
    "importExport.enabled": "已启用",
    "importExport.disabled": "已禁用",
    "importExport.accentColor": "强调色",
    "importExport.defaultView": "默认视图",
    "importExport.subfolder": "子文件夹",
    "importExport.andMore": "还有 {count} 个更多...",
    "importExport.confirmImport": "确认导入",
    "importExport.importing": "导入中...",

    // AI分类指示器
    "ai.processing": "处理中",
    "ai.processingEllipsis": "处理中...",
    "ai.concurrent": "并发",
    "ai.canceled": "已取消",
    "ai.completed": "已完成",
    "ai.succeeded": "成功",
    "ai.failed": "失败",
    "ai.pending": "等待中",
    "ai.tagGeneration": "AI标签生成",
    "ai.folderSuggestion": "AI文件夹推荐",
    "ai.tagGenerationStatus": "AI标签生成状态",
    "ai.folderSuggestionStatus": "AI文件夹推荐状态",
    "ai.overallProgress": "总体进度",
    "ai.warningMessage": "警告：任务处理过程中请勿刷新或关闭页面，否则将取消当前操作。",
    "ai.cancel": "取消",
    "ai.tagsInProgress": "生成标签中",
    "ai.foldersInProgress": "推荐文件夹中",
    "ai.viewDetails": "查看详情",
    "ai.classification": "AI分类",
    "ai.classificationStatus": "AI分类任务状态",
    "ai.processed": "已处理",
    "ai.clearCompletedTasks": "清除已完成任务",
    "ai.clearAllTasks": "清除所有任务",
    "ai.generating": "生成中...",
    "ai.suggesting": "推荐中...",
    "ai.folderError": "文件夹错误",
    "ai.tagError": "标签错误",
    "ai.tagGenerationFailed": "标签生成失败",
    "ai.folderSuggestionFailed": "文件夹推荐失败",

    // 错误信息
    "error.fetchFailed": "获取失败",
    "error.apiError": "API错误",
    "error.networkError": "网络错误",
    "error.importError": "导入错误",
  }
}

// 提供者组件
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { userSettings, updateGlobalSettings } = useAuth()
  const [language, setLanguage] = useState<Language>(userSettings?.language as Language || "en")
  const [isClient, setIsClient] = useState(false)

  // 确保只在客户端执行
  useEffect(() => {
    setIsClient(true)
  }, [])

  // 从 AuthContext 同步语言设置
  useEffect(() => {
    if (isClient && userSettings?.language) {
      setLanguage(userSettings.language as Language)
    } else if (isClient) {
      // 如果 AuthContext 中没有语言设置，则使用默认或当前状态的语言，并尝试更新到后端
      // 这通常发生在首次加载或用户设置尚未完全同步时
      const currentDefaultLanguage = "en"; // 或者从某个全局配置读取
      setLanguage(currentDefaultLanguage);
      // 只有在 AuthContext 中的 userSettings 和 userSettings.id 都已加载，
      // 并且语言设置 userSettings.language 确实缺失时，才尝试将本地设置的默认语言同步到后端。
      if (updateGlobalSettings && userSettings && typeof userSettings.id === 'string' && !userSettings.language) {
        // console.log("LanguageProvider: 用户设置已加载但无语言偏好，尝试设置默认语言到后端。"); // 保留此日志或按需移除
        updateGlobalSettings({ language: currentDefaultLanguage }).catch(error => {
          console.error("尝试将默认语言设置同步到后端失败:", error);
        });
      }
    }
  }, [isClient, userSettings?.language, updateGlobalSettings])

  // 更新语言设置
  const handleSetLanguage = async (newLanguage: Language) => {
    setLanguage(newLanguage)

    // 保存到后端通过 AuthContext
    if (updateGlobalSettings) {
      try {
        await updateGlobalSettings({ language: newLanguage })
      } catch (error) {
        console.error("保存语言设置到后端失败:", error)
        // 可选: 如果后端保存失败，回滚本地状态或提示用户
        // setLanguage(language); // 回滚示例
      }
    } else {
      console.warn("updateGlobalSettings is not available from AuthContext for saving language.")
    }
  }

  // 翻译函数
  const t = (key: string, params?: Record<string, string>): string => {
    let text = translations[language][key] || key

    // 如果有参数，替换文本中的占位符
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        text = text.replace(`{${paramKey}}`, paramValue)
      })
    }

    return text
  }

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage: handleSetLanguage,
        t
      }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

// 自定义钩子
export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}
