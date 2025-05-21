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
import { UserSetting, WebDAVConfigType } from "@/types"
import { webdavBackup, webdavRestore } from "@/lib/api-client"
import { useAuth } from "@/context/auth-context"

// 导出供外部组件使用的函数和状态
// 从用户设置获取WebDAV状态
export const getWebDAVStatus = (userSettings: UserSetting | null) => {
  try {
    // 从用户设置获取WebDAV配置
    const config = userSettings?.webdav_config;

    // 判断WebDAV状态 - 确保config存在并且所有必需字段都有值
    const isEnabled = config ? (!!config.Url && !!config.Username && !!config.Password && !!config.AutoSync) : false;
    return { isEnabled };
  } catch (e) {
    console.error('Error getting WebDAV status from user settings:', e);
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

// 全局引用，用于存储当前书签数据
let globalBookmarkData = {
  bookmarks: [],
  folders: [],
  tags: [],
  favoriteFolders: [],
  settings: {},
};

// 更新全局书签数据的函数，供BookmarkContext使用
export function updateGlobalBookmarkData(data) {
  globalBookmarkData = {...data};
  console.log("全局书签数据已更新:", {
    bookmarksCount: globalBookmarkData.bookmarks.length,
    foldersCount: globalBookmarkData.folders.length,
    tagsCount: globalBookmarkData.tags?.length || 0,
    favoriteFoldersCount: globalBookmarkData.favoriteFolders?.length || 0
  });
}

// 导出上传函数，供添加和编辑书签时使用
export async function uploadBookmarksToWebDAV(userSettings: UserSetting | null, token?: string) {
  console.log("uploadBookmarksToWebDAV 被调用 - 验证过程开始");

  try {
    // 1. 从用户设置获取WebDAV配置
    const config = userSettings?.webdav_config;

    // 2. 检查配置是否有效
    console.log("从用户设置获取的WebDAV配置:", {
      ...config,
      Password: config?.Password ? "******" : null
    });

    if (!config) {
      console.log("未找到WebDAV配置，跳过上传");
      return false;
    }

    const isEnabled = !!config.Url && !!config.Username && !!config.Password && !!config.AutoSync;

    if (!isEnabled) {
      console.log("WebDAV未启用或配置不完整，跳过上传");
      return false;
    }

    if (!config.AutoSync) {
      console.log("WebDAV auto-sync未启用，跳过上传");
      return false;
    }

    if (!token) {
      console.log("未提供身份验证令牌，跳过上传");
      return false;
    }

    console.log("WebDAV auto-sync已启用，开始准备上传...");

    // 调用新的 Go 后端 API
    const response = await webdavBackup(token);
    console.log("WebDAV 备份 API 响应:", response);

    if (response && response.success) {
      console.log("书签备份成功");
      return true;
    } else {
      throw new Error("WebDAV 备份失败");
    }
  } catch (error) {
    console.error("WebDAV上传错误:", error);
    return false;
  }
}

interface WebDAVSyncProps {
  userSettings: UserSetting | null;
  updateSettings: (settings: Partial<UserSetting>) => Promise<void>;
}

export default function WebDAVSync({ userSettings, updateSettings }: WebDAVSyncProps) {
  const { bookmarks, folders, tags, favoriteFolders, settings, importBookmarks } = useBookmarks()
  const { t } = useLanguage()
  const { token } = useAuth()
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  
  // WebDAV 配置表单字段
  const [serverUrl, setServerUrl] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [storagePath, setStoragePath] = useState("/bookmarks/")
  const [autoSync, setAutoSync] = useState(false)
  
  // 跟踪初始配置和变更状态
  const [initialConfig, setInitialConfig] = useState<WebDAVConfigType | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // 同步状态
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncMessage, setMessage] = useState("")
  const [syncError, setSyncError] = useState("")
  const [syncSuccess, setSyncSuccess] = useState("")

  // 从用户设置加载WebDAV配置并设置初始状态
  useEffect(() => {
    const loadConfigFromUserSettings = () => {
      try {
        console.log("正在从用户设置加载WebDAV配置...")
        const config = userSettings?.webdav_config;
        if (config) {
          console.log("已从用户设置加载WebDAV配置:", { 
            ...config, 
            Password: config.Password ? "******" : null 
          });
          setServerUrl(config.Url || "");
          setUsername(config.Username || "");
          setPassword(config.Password || "");
          setStoragePath(config.Path || "/bookmarks/");
          setAutoSync(config.AutoSync || false);
          setInitialConfig(config); // 保存初始配置用于比较
        } else {
          console.log("用户设置中没有找到WebDAV配置，使用默认值。");
          const defaultConfig: WebDAVConfigType = { 
            Url: "", 
            Username: "", 
            Password: "", 
            Path: "/bookmarks/", 
            AutoSync: false 
          };
          setInitialConfig(defaultConfig);
        }
        setHasChanges(false); // 重置更改状态
      } catch (error) {
        console.error("加载WebDAV配置失败:", error);
      }
    };

    if (syncModalOpen) { // 只在模态框打开时加载/重新加载配置
      loadConfigFromUserSettings();
    }
  }, [syncModalOpen, userSettings]);

  // 检测配置更改
  useEffect(() => {
    if (!initialConfig) return;

    const currentConfigState: WebDAVConfigType = {
      Url: serverUrl,
      Username: username,
      Password: password,
      Path: storagePath,
      AutoSync: autoSync,
    };

    const changed =
      currentConfigState.Url !== (initialConfig.Url || "") ||
      currentConfigState.Username !== (initialConfig.Username || "") ||
      currentConfigState.Password !== (initialConfig.Password || "") ||
      currentConfigState.Path !== (initialConfig.Path || "/bookmarks/") ||
      currentConfigState.AutoSync !== (initialConfig.AutoSync || false);
    
    setHasChanges(changed);
  }, [serverUrl, username, password, storagePath, autoSync, initialConfig]);

  // 保存WebDAV配置到用户设置
  const handleSaveWebDAVConfig = useCallback(async () => {
    const configToSave: WebDAVConfigType = {
      Url: serverUrl,
      Username: username,
      Password: password,
      Path: storagePath,
      AutoSync: autoSync,
    };
    
    try {
      await updateSettings({ webdav_config: configToSave });
      console.log("WebDAV配置已保存到用户设置:", { 
        ...configToSave, 
        Password: password ? "******" : null 
      });
      setInitialConfig(configToSave); // 更新初始配置为当前已保存状态
      setHasChanges(false); // 重置更改状态
      setSyncSuccess(t("webdav.configSaved") || "WebDAV 配置已保存");
      
      // 清除成功提示
      setTimeout(() => {
        setSyncSuccess("");
      }, 3000);
    } catch (error) {
      console.error("保存WebDAV配置失败:", error);
      setSyncError(t("webdav.saveError") || "保存WebDAV配置失败");
    }
  }, [serverUrl, username, password, storagePath, autoSync, updateSettings, t]);

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

  // 以下代码块被删除:
  // - webdavRequest 函数
  // - checkFileExists 函数

  // Upload bookmarks to WebDAV - 使用新的 Go 后端 API
  const uploadBookmarks = async () => {
    console.log("组件内uploadBookmarks函数被调用");
    if (!serverUrl || !username || !password) {
      setSyncError(t("webdav.fillAllFields"))
      console.log("WebDAV字段未完整填写，上传取消");
      return false
    }

    if (!token) {
      setSyncError("未登录或会话已过期")
      console.log("未提供认证令牌，上传取消");
      return false
    }

    setIsSyncing(true)
    setSyncProgress(10)
    setMessage("正在准备数据...")
    setSyncError("")
    setSyncSuccess("")

    console.log("当前书签数据状态:", {
      bookmarksCount: bookmarks.length,
      foldersCount: folders.length,
      tagsCount: tags.length
    })

    try {
      // 开始上传
      console.log("开始上传数据到 WebDAV 服务器...")
      setSyncProgress(50)
      setMessage("正在上传数据...")

      const result = await webdavBackup(token);
      console.log("WebDAV 备份 API 响应:", result);

      if (result && result.success) {
        setSyncProgress(100)
        setMessage("上传完成!")
        setSyncSuccess(t("webdav.uploadSuccess") || "书签成功备份到 WebDAV 服务器")
        return true
      } else {
        throw new Error("WebDAV 备份失败: " + (result.message || "未知错误"))
      }
    } catch (error) {
      console.error("上传书签时出错:", error)

      // 提供更详细的错误信息
      let errorMessage = "上传失败: "
      if (error instanceof Error) {
        errorMessage += error.message
        console.error("错误堆栈:", error.stack)
      } else {
        errorMessage += String(error)
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

  // Download bookmarks from WebDAV - 使用新的 Go 后端 API
  const downloadBookmarks = async () => {
    if (!serverUrl || !username || !password) {
      setSyncError(t("webdav.fillAllFields"))
      return false
    }

    if (!token) {
      setSyncError("未登录或会话已过期")
      console.log("未提供认证令牌，恢复取消");
      return false
    }

    setIsSyncing(true)
    setSyncProgress(10)
    setMessage("正在连接到 WebDAV 服务器...")
    setSyncError("")
    setSyncSuccess("")

    try {
      // 开始下载
      setSyncProgress(40)
      setMessage("正在下载书签...")
      console.log("正在从 WebDAV 服务器恢复书签数据...")

      // 使用新的 API 恢复数据
      const responseData = await webdavRestore(token);
      console.log("WebDAV 恢复 API 响应:", responseData);
      
      if (!responseData || !responseData.success) {
        throw new Error("WebDAV 恢复失败: " + (responseData.message || "未知错误"));
      }

      setSyncProgress(70)
      setMessage("正在处理下载的数据...")
      console.log("正在处理下载的书签数据...");

      // 导入书签
      if (responseData.data && typeof responseData.data === "object") {
        // 添加类型断言解决TypeScript错误
        type BackupData = {
          bookmarks: any[];
          folders: any[];
          tags: string[];
          favoriteFolders: string[];
          settings: any;
          syncDate?: string;
        };

        const typedData = responseData.data as BackupData;

        console.log("正在导入下载的书签数据", {
          bookmarksCount: typedData.bookmarks?.length || 0,
          foldersCount: typedData.folders?.length || 0,
          tagsCount: typedData.tags?.length || 0
        })
        
        importBookmarks(responseData.data)
        setSyncProgress(100)
        setMessage("下载完成!")
        setSyncSuccess(t("webdav.downloadSuccess") || "成功从 WebDAV 服务器恢复书签")
        return true
      } else {
        throw new Error("从服务器接收到的数据格式无效")
      }
    } catch (error) {
      console.error("下载书签时出错:", error)

      // 提供更详细的错误信息
      let errorMessage = "下载失败: "
      if (error instanceof Error) {
        errorMessage += error.message
        console.error("错误堆栈:", error.stack)
      } else {
        errorMessage += String(error)
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
              {t("webdav.saveChanges") || "保存更改"}
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
