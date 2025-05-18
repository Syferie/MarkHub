"use client"

// 添加类型声明
declare global {
  interface Window {
    webdavSyncComponent: {
      uploadBookmarks: () => Promise<boolean>;
    } | null;
  }
}

import { useState, useEffect, useCallback } from "react"
import { db } from "@/lib/db"
import { Button, Modal, TextInput, PasswordInput, Group, Text, Switch, Alert, Progress } from "@mantine/core"
import { IconCloud, IconCloudUpload, IconCloudDownload, IconAlertCircle } from "@tabler/icons-react"
import { useBookmarks } from "@/context/bookmark-context"
import { useLanguage } from "@/context/language-context"
import { getWebDAVConfig, saveWebDAVConfig } from "@/lib/config-storage" // 导入WebDAV配置工具

// 导出供外部组件使用的函数和状态
// 使用同步函数从localStorage获取最新状态
export const getWebDAVStatus = () => {
  try {
    // 从localStorage获取WebDAV配置
    const config = getWebDAVConfig();

    // 判断WebDAV状态 - 确保config存在并且所有必需字段都有值
    const isEnabled = config ? (!!config.serverUrl && !!config.username && !!config.password && !!config.autoSync) : false;
    return { isEnabled };
  } catch (e) {
    console.error('Error getting WebDAV status from localStorage:', e);
  }

  return { isEnabled: false };
};

// 辅助函数：规范化路径并添加时间戳
export const normalizePathWithTimestamp = (path: string): string => {
  if (!path) return `bookmarks_${generateTimestampStr()}.json`;
  path = path.trim();
  if (!path.startsWith("/")) {
    path = "/" + path;
  }
  if (!path.endsWith("/")) {
    path += "/";
  }
  return path + `bookmarks_${generateTimestampStr()}.json`;
};

// 辅助函数：生成时间戳字符串
export const generateTimestampStr = (): string => {
  const now = new Date();
  return now.getFullYear().toString() +
         (now.getMonth() + 1).toString().padStart(2, '0') +
         now.getDate().toString().padStart(2, '0') +
         now.getHours().toString().padStart(2, '0') +
         now.getMinutes().toString().padStart(2, '0') +
         now.getSeconds().toString().padStart(2, '0');
};

// 导出上传函数，供添加和编辑书签时使用
export async function uploadBookmarksToWebDAV() {
  console.log("uploadBookmarksToWebDAV 被调用 - 验证过程开始");

  try {
    // 1. 从localStorage加载WebDAV配置
    const config = getWebDAVConfig();

    // 2. 检查配置是否有效
    console.log("从localStorage加载的WebDAV配置:", {
      ...config,
      password: config?.password ? "******" : null
    });

    if (!config) {
      console.log("未找到WebDAV配置，跳过上传");
      return false;
    }

    const isEnabled = !!config.serverUrl && !!config.username && !!config.password && !!config.autoSync;

    if (!isEnabled) {
      console.log("WebDAV未启用或配置不完整，跳过上传");
      return false;
    }

    if (!config.autoSync) {
      console.log("WebDAV auto-sync未启用，跳过上传");
      return false;
    }

    console.log("WebDAV auto-sync已启用，开始准备上传...");

    // 3. 准备上传数据 - 直接加载数据而不依赖组件引用
    const bookmarks = await db.getAllBookmarks();
    const folders = await db.getAllFolders();
    const tags = await db.getTags();
    const favoriteFolders = await db.getFavoriteFolders();
    const settings = await db.getAppSettings();

    console.log("从数据库加载的数据:", {
      bookmarksCount: bookmarks.length,
      foldersCount: folders.length,
      tagsCount: tags?.length || 0,
      favoriteFoldersCount: favoriteFolders?.length || 0,
      hasSettings: !!settings
    });

    // 4. 准备API请求数据
    const data = {
      bookmarks,
      folders,
      tags,
      favoriteFolders,
      settings,
      syncDate: new Date().toISOString(),
    };

    // 5. 生成上传文件路径
    const fileName = normalizePathWithTimestamp(config.storagePath);
    console.log(`准备上传到文件: ${fileName}`);

    // 6. 执行上传请求
    const requestBody: any = {
      operation: 'upload',
      serverUrl: config.serverUrl,
      username: config.username,
      password: config.password,
      storagePath: config.storagePath,
      data: data
    };

    // 解析路径获取文件名
    if (fileName && fileName.includes('bookmarks_')) {
      const pathParts = fileName.split('/');
      const fileNamePart = pathParts[pathParts.length - 1];
      if (fileNamePart && fileNamePart !== 'bookmarks.json') {
        requestBody.fileName = fileNamePart;
      }
    }

    console.log(`准备向API代理发送upload请求...`);
    console.log('请求体信息:', {
      operation: requestBody.operation,
      serverUrl: config.serverUrl,
      username: config.username,
      hasPassword: !!config.password,
      storagePath: config.storagePath,
      hasFileName: !!requestBody.fileName,
      dataIncluded: !!requestBody.data
    });

    // 7. 发送请求
    const response = await fetch('/api/webdav', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`API代理响应状态: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      throw new Error(`API proxy error: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();

    // 8. 处理响应
    if (responseData.error) {
      throw new Error(`WebDAV operation failed: ${responseData.error}`);
    }

    if (responseData.success) {
      console.log(`Bookmarks uploaded with timestamped filename: ${fileName}`);
      return true;
    } else {
      throw new Error(`WebDAV upload failed: ${responseData.status} ${responseData.statusText}`);
    }
  } catch (error) {
    console.error("WebDAV上传错误:", error);
    return false;
  }
}

export default function WebDAVSync() {
  const { bookmarks, folders, tags, favoriteFolders, settings, importBookmarks } = useBookmarks()
  const { t } = useLanguage()
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [serverUrl, setServerUrl] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [storagePath, setStoragePath] = useState("/bookmarks/")
  const [autoSync, setAutoSync] = useState(false)
  
  const [initialConfig, setInitialConfig] = useState<ReturnType<typeof getWebDAVConfig> | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncMessage, setMessage] = useState("")
  const [syncError, setSyncError] = useState("")
  const [syncSuccess, setSyncSuccess] = useState("")

  // 从localStorage加载WebDAV配置并设置初始状态
  useEffect(() => {
    const loadAndSetInitialConfig = () => {
      try {
        console.log("正在从localStorage加载WebDAV配置...")
        const config = getWebDAVConfig();
        if (config) {
          console.log("已从localStorage加载WebDAV配置:", { ...config, password: config.password ? "******" : null });
          setServerUrl(config.serverUrl || "");
          setUsername(config.username || "");
          setPassword(config.password || ""); // 直接设置密码，PasswordInput会处理显示
          setStoragePath(config.storagePath || "/bookmarks/");
          setAutoSync(config.autoSync || false);
          setInitialConfig(config); // 保存初始配置用于比较
        } else {
          console.log("localStorage中没有找到WebDAV配置，使用默认值。");
          const defaultConfig = { serverUrl: "", username: "", password: "", storagePath: "/bookmarks/", autoSync: false };
          setInitialConfig(defaultConfig);
        }
        setHasChanges(false); // 重置更改状态
      } catch (error) {
        console.error("加载WebDAV配置失败:", error);
      }
    };

    if (syncModalOpen) { // 只在模态框打开时加载/重新加载配置
      loadAndSetInitialConfig();
    }
  }, [syncModalOpen]);

  // 检测配置更改
  useEffect(() => {
    if (!initialConfig) return;

    const currentConfigState = {
      serverUrl,
      username,
      password,
      storagePath,
      autoSync,
    };

    const changed =
      currentConfigState.serverUrl !== (initialConfig.serverUrl || "") ||
      currentConfigState.username !== (initialConfig.username || "") ||
      currentConfigState.password !== (initialConfig.password || "") ||
      currentConfigState.storagePath !== (initialConfig.storagePath || "/bookmarks/") ||
      currentConfigState.autoSync !== (initialConfig.autoSync || false);
    
    setHasChanges(changed);
  }, [serverUrl, username, password, storagePath, autoSync, initialConfig]);


  // 保存WebDAV配置到localStorage
  const handleSaveWebDAVConfig = useCallback(() => {
    const configToSave = {
      serverUrl,
      username,
      password,
      storagePath,
      autoSync,
    };
    saveWebDAVConfig(configToSave);
    setInitialConfig(configToSave); // 更新初始配置为当前已保存状态
    setHasChanges(false); // 重置更改状态
    console.log("WebDAV配置已手动保存到localStorage:", { ...configToSave, password: password ? "******" : null });
    // 可以添加一个toast通知用户保存成功
  }, [serverUrl, username, password, storagePath, autoSync]);

  // Helper function to normalize URL
  const normalizeUrl = (url: string) => {
    if (!url) return ""
    url = url.trim()
    if (!url.endsWith("/")) {
      url += "/"
    }
    return url
  }

  // Helper function to normalize path
  const normalizePath = (path: string, withTimestamp: boolean = false) => {
    if (!path) return withTimestamp ? `bookmarks_${generateTimestamp()}.json` : "bookmarks.json"
    path = path.trim()
    if (!path.startsWith("/")) {
      path = "/" + path
    }
    if (!path.endsWith("/")) {
      path += "/"
    }
    return path + (withTimestamp ? `bookmarks_${generateTimestamp()}.json` : "bookmarks.json")
  }

  // Helper function to generate timestamp YYYYMMDDHHMMSS
  const generateTimestamp = () => {
    const now = new Date()
    return now.getFullYear().toString() +
           (now.getMonth() + 1).toString().padStart(2, '0') +
           now.getDate().toString().padStart(2, '0') +
           now.getHours().toString().padStart(2, '0') +
           now.getMinutes().toString().padStart(2, '0') +
           now.getSeconds().toString().padStart(2, '0')
  }

  // WebDAV request helper - 通过Next.js API路由代理请求，避免CORS问题
  const webdavRequest = async (method: string, path: string, data?: any) => {
    try {
      console.log(`WebDAV ${method} request via API proxy - 路径: ${path}`)

      // 准备要发送到API代理的数据
      let operation: string;
      if (method === 'GET') {
        operation = 'download';
      } else if (method === 'PROPFIND') {
        operation = 'check';
      } else {
        operation = 'upload';
      }

      console.log(`WebDAV操作类型: ${operation}`);

      const requestBody: any = {
        operation,
        serverUrl,
        username,
        password,
        storagePath
      }

      // 如果路径中包含文件名且不仅仅是基础路径，将其作为fileName参数传递
      if (path && path.includes('bookmarks_')) {
        const pathParts = path.split('/');
        const fileName = pathParts[pathParts.length - 1];
        if (fileName && fileName !== 'bookmarks.json') {
          requestBody.fileName = fileName;
          console.log(`Using custom filename: ${fileName}`);
        }
      }

      // 如果是上传操作，添加数据
      if (data && ["PUT", "POST", "PATCH"].includes(method)) {
        requestBody.data = data
      }

      // 通过API代理发送请求
      console.log(`准备向API代理发送${operation}请求...`);
      console.log('请求体信息:', {
        operation,
        serverUrl,
        username,
        hasPassword: !!password,
        storagePath,
        hasFileName: !!requestBody.fileName,
        dataIncluded: !!data
      });

      const response = await fetch('/api/webdav', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      console.log(`API代理响应状态: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`API proxy error: ${response.status} ${response.statusText}`)
      }

      const responseData = await response.json()

      // 处理错误情况
      if (responseData.error) {
        throw new Error(`WebDAV operation failed: ${responseData.error}`)
      }

      // 处理下载操作的响应
      if (method === 'GET') {
        if (responseData.success && responseData.data) {
          return responseData.data;
        } else {
          throw new Error(`WebDAV download failed: ${responseData.error || 'Unknown error'}`);
        }
      }

      // 处理检查文件操作的响应
      if (method === 'PROPFIND') {
        return responseData;
      }

      // 处理上传操作的响应
      if (responseData.success) {
        return true
      } else {
        throw new Error(`WebDAV ${method} failed: ${responseData.status} ${responseData.statusText}`)
      }
    } catch (error) {
      console.error(`WebDAV ${method} error:`, error)
      throw error
    }
  }

  // Check if file exists - 通过API代理检查文件是否存在
  const checkFileExists = async () => {
    try {
      console.log("Checking if file exists using API proxy...")

      // 使用PROPFIND方法通过API代理检查文件是否存在
      const response = await webdavRequest("PROPFIND", normalizePath(storagePath))

      // API代理会返回一个包含exists字段的对象
      return response.exists === true
    } catch (error) {
      console.error("Error checking file existence:", error)
      return false
    }
  }

  // 移除组件引用逻辑，因为我们已经重构了uploadBookmarksToWebDAV函数，不再依赖它

  // (移除了根据state变化自动保存的useEffect)

  // Upload bookmarks to WebDAV - 改进了错误处理和调试信息
  const uploadBookmarks = async () => {
    console.log("组件内uploadBookmarks函数被调用");
    if (!serverUrl || !username || !password) {
      setSyncError(t("webdav.fillAllFields"))
      console.log("WebDAV字段未完整填写，上传取消");
      return false
    }

    setIsSyncing(true)
    setSyncProgress(10)
    setMessage("Preparing data for upload...")
    setSyncError("")
    setSyncSuccess("")

    // 在上传前保存WebDAV配置，确保最新配置被存储
    // 上传/下载前不再自动保存，期望用户已通过“保存配置”按钮保存
    // 如果需要，可以提示用户保存未保存的更改
    if (hasChanges) {
      // 可以选择弹窗提示用户保存，或者自动保存
      // 为简单起见，这里先不处理，依赖用户手动保存
      console.warn("WebDAV配置有未保存的更改，执行同步操作可能使用旧配置。");
    }
    // const currentConfig = getWebDAVConfig(); // 确保使用最新的已保存配置
    // console.log("WebDAV configuration loaded for upload/download", currentConfig);

    console.log("当前书签数据状态:", {
      bookmarksCount: bookmarks.length,
      foldersCount: folders.length,
      tagsCount: tags.length
    })

    try {
      // 准备数据
      const data = {
        bookmarks,
        folders,
        tags,
        favoriteFolders,
        settings,
        syncDate: new Date().toISOString(),
      }
      console.log("Data prepared for upload", {
        bookmarksCount: bookmarks.length,
        foldersCount: folders.length,
        tagsCount: tags.length
      })

      setSyncProgress(30)
      setMessage("Connecting to WebDAV server...")

      // 在上传前测试连接
      console.log("Testing WebDAV server connection...")
      try {
        const exists = await checkFileExists()
        console.log("WebDAV file check result:", exists ? "File exists" : "File does not exist")
      } catch (connectionError) {
        console.error("WebDAV connection test failed:", connectionError)
        // 连接测试失败但继续尝试上传
      }

      // 上传数据
      console.log("Starting data upload to WebDAV server...")
      setSyncProgress(50)
      setMessage("Uploading data...")

      // 使用带时间戳的文件名进行上传
      const fileName = normalizePath(storagePath, true)
      console.log(`准备上传到文件: ${fileName}`)

      try {
        console.log("发起webdavRequest...");
        const result = await webdavRequest("PUT", fileName, data)
        console.log("webdavRequest返回结果:", result);

        console.log(`Bookmarks uploaded with timestamped filename: ${fileName}`)
        setSyncProgress(100)
        setMessage("Upload complete!")
        setSyncSuccess("Bookmarks successfully uploaded to WebDAV server with timestamp")
        return true
      } catch (uploadError) {
        console.error("WebDAV API请求失败:", uploadError);
        throw uploadError;
      }
    } catch (error) {
      console.error("Error uploading bookmarks:", error)

      // 提供更详细的错误信息
      let errorMessage = "Upload failed: "
      if (error instanceof Error) {
        errorMessage += error.message
        console.error("Error stack:", error.stack)
      } else {
        errorMessage += String(error)
      }

      // 添加更有用的错误提示
      if (errorMessage.includes("Failed to fetch") || errorMessage.includes("Network error")) {
        errorMessage += ". Please check your network connection and WebDAV server address."
      } else if (errorMessage.includes("401")) {
        errorMessage += ". Username or password may be incorrect."
      } else if (errorMessage.includes("403")) {
        errorMessage += ". You may not have permission to write to this path."
      } else if (errorMessage.includes("CORS")) {
        errorMessage += ". The WebDAV server may not allow cross-domain requests from this application."
      }

      setSyncError(errorMessage)
      setSyncProgress(0)
      return false
    } finally {
      setTimeout(() => {
        setIsSyncing(false)
        setMessage("")
      }, 1000)
    }
  }

  // Download bookmarks from WebDAV - 改进错误处理和日志
  const downloadBookmarks = async () => {
    if (!serverUrl || !username || !password) {
      setSyncError(t("webdav.fillAllFields"))
      return false
    }

    setIsSyncing(true)
    setSyncProgress(10)
    setMessage("Connecting to WebDAV server...")
    setSyncError("")
    setSyncSuccess("")

    // 在下载前保存WebDAV配置，确保最新配置被存储
    // 下载前不再自动保存
    if (hasChanges) {
      console.warn("WebDAV配置有未保存的更改，执行同步操作可能使用旧配置。");
    }
    // const currentConfig = getWebDAVConfig();
    // console.log("WebDAV configuration loaded for upload/download", currentConfig);

    try {
      // 检查文件是否存在
      console.log("Checking if bookmarks file exists on WebDAV server...")
      const exists = await checkFileExists()
      if (!exists) {
        // 即使直接的书签文件不存在，我们仍然尝试下载，因为服务器端会查找备份文件
        console.log("Bookmark file not directly found, proceeding to try download anyway (server will search for backups)...")
      }

      setSyncProgress(40)
      setMessage("Downloading bookmarks...")
      console.log("Starting bookmark data download from WebDAV server...")

      // 下载数据
      const data = await webdavRequest("GET", normalizePath(storagePath))
      console.log("Bookmark data download complete")

      setSyncProgress(70)
      setMessage("Processing downloaded data...")
      console.log("Processing downloaded bookmark data...")

      // 导入书签
      if (data && typeof data === "object") {
        // 添加类型断言解决TypeScript错误
        type BackupData = {
          bookmarks: any[];
          folders: any[];
          tags: string[];
          favoriteFolders: string[];
          settings: any;
          syncDate?: string;
        };

        const typedData = data as BackupData;

        console.log("Importing downloaded bookmark data", {
          bookmarksCount: typedData.bookmarks?.length || 0,
          foldersCount: typedData.folders?.length || 0,
          tagsCount: typedData.tags?.length || 0
        })
        importBookmarks(data)
        setSyncProgress(100)
        setMessage("Download complete!")
        setSyncSuccess("Bookmarks successfully downloaded from WebDAV server")
        return true
      } else {
        throw new Error("Invalid data format received from server")
      }
    } catch (error) {
      console.error("Error downloading bookmarks:", error)

      // 提供更详细的错误信息
      let errorMessage = "Download failed: "
      if (error instanceof Error) {
        errorMessage += error.message
        console.error("Error stack:", error.stack)
      } else {
        errorMessage += String(error)
      }

      // 添加更有用的错误提示
      if (errorMessage.includes("Failed to fetch") || errorMessage.includes("Network error")) {
        errorMessage += ". Please check your network connection and WebDAV server address."
      } else if (errorMessage.includes("401")) {
        errorMessage += ". Username or password may be incorrect."
      } else if (errorMessage.includes("403")) {
        errorMessage += ". You may not have permission to read from this path."
      } else if (errorMessage.includes("CORS")) {
        errorMessage += ". The WebDAV server may not allow cross-domain requests from this application."
      } else if (errorMessage.includes("parse")) {
        errorMessage += ". The data format returned by the server may be incorrect."
      }

      setSyncError(errorMessage)
      setSyncProgress(0)
      return false
    } finally {
      setTimeout(() => {
        setIsSyncing(false)
        setMessage("")
      }, 1000)
    }
  }

  return (
    <>
      <Button leftSection={<IconCloud size={16} />} variant="light" onClick={() => setSyncModalOpen(true)}>
        {t("webdav.configure")}
      </Button>

      <Modal opened={syncModalOpen} onClose={() => setSyncModalOpen(false)} title={t("webdav.configure")} centered size="lg" classNames={{ header: 'border-none' }}>
        <div className="space-y-4">
          <Text size="sm" color="dimmed">
            {t("webdav.webdavDescription")}
          </Text>

          <TextInput
            label={t("webdav.serverUrl")}
            placeholder="https://example.com/webdav/"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            required
          />

          <TextInput
            label={t("webdav.username")}
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <PasswordInput
            label={t("webdav.password")}
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <TextInput
            label={t("webdav.path")}
            placeholder="/bookmarks/"
            description={t("webdav.pathDescription")}
            value={storagePath}
            onChange={(e) => setStoragePath(e.target.value)}
          />

          <Switch
            label={t("webdav.autoSync")}
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
            mt="md"
            description={t("webdav.autoSyncDescription")}
          />

          {isSyncing && (
            <div className="mt-4">
              <Text size="sm" mb={5}>
                {syncMessage}
              </Text>
              <Progress value={syncProgress} striped animated />
            </div>
          )}

          {syncError && (
            <Alert icon={<IconAlertCircle size={16} />} title={t("importExport.error")} color="red" variant="light">
              {syncError}
            </Alert>
          )}

          {syncSuccess && (
            <Alert title={t("importExport.success")} color="green" variant="light">
              {syncSuccess}
            </Alert>
          )}

          <Group mt="xl">
            <Button
              variant="light"
              onClick={handleSaveWebDAVConfig}
              disabled={!hasChanges || isSyncing}
              className="flex-grow sm:flex-grow-0"
            >
              {t("webdav.saveChanges") || "Save Changes"}
              {/* TODO: Add 'webdav.saveChanges' to language files, e.g., { "en": "Save Changes", "zh-CN": "保存更改" } */}
            </Button>
            <Button
              leftSection={<IconCloudUpload size={16} />}
              variant="light"
              onClick={uploadBookmarks}
              loading={isSyncing}
              disabled={!serverUrl || !username || !password || hasChanges} // 如果有未保存更改则禁用同步
              className="flex-grow sm:flex-grow-0"
            >
              {t("webdav.upload")}
            </Button>
            <Button
              leftSection={<IconCloudDownload size={16} />}
              variant="light"
              onClick={downloadBookmarks}
              loading={isSyncing}
              disabled={!serverUrl || !username || !password || hasChanges} // 如果有未保存更改则禁用同步
              className="flex-grow sm:flex-grow-0"
            >
              {t("webdav.download")}
            </Button>
          </Group>
          {hasChanges && (
            <Text size="xs" color="orange" mt="xs" ta="right">
              {t("webdav.unsavedChangesWarning") || "您有未保存的更改。请先保存配置。"}
            </Text>
          )}
        </div>
      </Modal>
    </>
  )
}
