"use client"

import { useState, useEffect, useContext } from "react"
import {
  Modal,
  Tabs,
  Switch,
  ColorInput,
  Select,
  Button,
  Group,
  TextInput,
  PasswordInput,
  Divider,
  Text,
  Anchor,
} from "@mantine/core"
import { IconPalette, IconCloud, IconFileExport, IconRefresh, IconApi, IconLanguage, IconInfoCircle } from "@tabler/icons-react"
import ImportExport from "./import-export"
import WebDAVSync from "./webdav-sync"
import { useBookmarks } from "@/context/bookmark-context"
import { useLanguage } from "@/context/language-context"
import { clearAllUserData } from "@/lib/api-client" // 导入 clearAllUserData
// import { db } from "@/lib/db" // 不再需要直接操作 IndexedDB 进行配置迁移
// import { getAppConfig, saveAppConfig, migrateConfigFromIndexedDB } from "@/lib/config-storage" // 不再需要
import { AuthContext } from "@/context/auth-context" // 导入 AuthContext
import { toast } from "sonner" // 用于显示通知

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { resetToSampleData, loadInitialData } = useBookmarks() // 移除了 clearAllBookmarkData, 添加了 loadInitialData, 移除了 refreshAllFavicons
  const { language: currentLanguageContext, setLanguage, t } = useLanguage()
  const authContext = useContext(AuthContext)
  if (!authContext) {
    // 理论上不应该发生，因为 SettingsModal 应该在 AuthProvider 内部
    console.error("AuthContext not found in SettingsModal")
    // 可以返回一个加载状态或者错误提示
    return null;
  }
  const { userSettings, updateGlobalSettings, isLoading: authLoading } = authContext;

  const [localSettings, setLocalSettings] = useState({
    darkMode: userSettings?.darkMode ?? false,
    accentColor: userSettings?.accentColor ?? "#3b82f6",
    defaultView: userSettings?.defaultView ?? "all",
    language: userSettings?.language ?? "en",
    geminiApiBaseUrl: userSettings?.geminiApiBaseUrl ?? "",
    geminiModelName: userSettings?.geminiModelName ?? "",
    geminiApiKey: userSettings?.geminiApiKey ?? "",
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [isClearingData, setIsClearingData] = useState(false)
  const [isResettingData, setIsResettingData] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  // 初始化本地设置并在打开模态框时从localStorage加载
  useEffect(() => {
    if (isOpen && userSettings) {
      setLocalSettings({
        darkMode: userSettings.darkMode ?? false,
        accentColor: userSettings.accentColor ?? "#3b82f6",
        defaultView: userSettings.defaultView ?? "all",
        language: userSettings.language ?? currentLanguageContext ?? "en",
        geminiApiBaseUrl: userSettings.geminiApiBaseUrl ?? "",
        geminiModelName: userSettings.geminiModelName ?? "",
        geminiApiKey: userSettings.geminiApiKey ?? "",
      });
      setHasChanges(false);
    }
  }, [isOpen, userSettings, currentLanguageContext]);

  // 跟踪变更
  useEffect(() => {
    if (isOpen && userSettings) {
      const changed =
        localSettings.darkMode !== (userSettings.darkMode ?? false) ||
        localSettings.accentColor !== (userSettings.accentColor ?? "#3b82f6") ||
        localSettings.defaultView !== (userSettings.defaultView ?? "all") ||
        localSettings.language !== (userSettings.language ?? currentLanguageContext ?? "en") ||
        localSettings.geminiApiBaseUrl !== (userSettings.geminiApiBaseUrl ?? "") ||
        localSettings.geminiModelName !== (userSettings.geminiModelName ?? "") ||
        localSettings.geminiApiKey !== (userSettings.geminiApiKey ?? "");
      setHasChanges(changed);
    }
  }, [localSettings, isOpen, userSettings, currentLanguageContext]);


  const handleSaveChanges = async () => {
    if (!updateGlobalSettings) {
      toast.error(t("settings.saveError") || "Failed to save settings. Auth context not available.");
      return;
    }

    const changedSettings: Partial<typeof localSettings> = {};
    if (userSettings) {
        if (localSettings.darkMode !== (userSettings.darkMode ?? false)) {
            changedSettings.darkMode = localSettings.darkMode;
        }
        if (localSettings.accentColor !== (userSettings.accentColor ?? "#3b82f6")) {
            changedSettings.accentColor = localSettings.accentColor;
        }
        if (localSettings.defaultView !== (userSettings.defaultView ?? "all")) {
            changedSettings.defaultView = localSettings.defaultView;
        }
        if (localSettings.language !== (userSettings.language ?? currentLanguageContext ?? "en")) {
            changedSettings.language = localSettings.language;
        }
        if (localSettings.geminiApiBaseUrl !== (userSettings.geminiApiBaseUrl ?? "")) {
            changedSettings.geminiApiBaseUrl = localSettings.geminiApiBaseUrl;
        }
        if (localSettings.geminiModelName !== (userSettings.geminiModelName ?? "")) {
            changedSettings.geminiModelName = localSettings.geminiModelName;
        }
        if (localSettings.geminiApiKey !== (userSettings.geminiApiKey ?? "")) {
            changedSettings.geminiApiKey = localSettings.geminiApiKey;
        }
    } else { // 如果 userSettings 为 null，则所有 localSettings 都是更改
        Object.assign(changedSettings, localSettings);
    }


    if (Object.keys(changedSettings).length > 0) {
      try {
        await updateGlobalSettings(changedSettings);
        toast.success(t("settings.saveSuccess") || "Settings saved successfully!");
        
        // 如果语言更改了，也需要更新 LanguageContext
        if (changedSettings.language && changedSettings.language !== currentLanguageContext) {
          setLanguage(changedSettings.language as "en" | "zh");
        }
        setHasChanges(false); // 保存成功后重置 hasChanges
      } catch (error) {
        console.error("Failed to save settings:", error);
        toast.error(t("settings.saveError") || "Failed to save settings.");
      }
    } else {
      toast.info(t("settings.noChanges") || "No changes to save.");
    }
    
    onClose();
  };

  const handleClearAllData = async () => {
    if (!authContext || !authContext.token) {
      toast.error(t("errors.notAuthenticated") || "User not authenticated");
      return;
    }
    if (window.confirm(t("settings.confirmClearData"))) {
      setIsClearingData(true);
      const token = authContext.token;
      try {
        await clearAllUserData(token);
        toast.success(t("settings.clearDataSuccess") || "All data cleared successfully!");
        await loadInitialData(); // 重新加载数据以更新前端状态
        // 可能还需要关闭模态框或执行其他UI更新
        onClose(); // 清除数据后通常关闭设置模态框
      } catch (error) {
        console.error("Failed to clear all data:", error);
        toast.error(t("settings.clearDataError") + (error instanceof Error ? `: ${error.message}` : ""));
      } finally {
        setIsClearingData(false);
      }
    }
  }

  const handleResetToSampleData = async () => {
    if (window.confirm(t("settings.confirmResetData"))) {
      setIsResettingData(true)
      try {
        await resetToSampleData()
      } finally {
        setIsResettingData(false)
      }
    }
  }

  return (
    <Modal opened={isOpen} onClose={onClose} title={t("settings.title")} size="lg" centered classNames={{ header: 'border-none' }}>
      <Tabs defaultValue="appearance">
        <Tabs.List>
          <Tabs.Tab value="appearance" leftSection={<IconPalette size={16} />}>
            {t("settings.appearance") || "外观"}
          </Tabs.Tab>
          <Tabs.Tab value="api" leftSection={<IconApi size={16} />}>
            {t("settings.api") || "API"}
          </Tabs.Tab>
          <Tabs.Tab value="sync" leftSection={<IconCloud size={16} />}>
            {t("settings.sync") || "同步"}
          </Tabs.Tab>
          <Tabs.Tab value="data" leftSection={<IconFileExport size={16} />}>
            {t("settings.data") || "数据"}
          </Tabs.Tab>
          <Tabs.Tab value="about" leftSection={<IconInfoCircle size={16} />}>
            {t("settings.about") || "关于"}
          </Tabs.Tab>
        </Tabs.List>


        <Tabs.Panel value="appearance" pt="md">
          <div className="space-y-6">
            <div>
              <Switch
                label={t("settings.darkMode")}
                checked={localSettings.darkMode}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    darkMode: e.currentTarget.checked,
                  })
                }
              />
            </div>

            <div>
              <ColorInput
                label={t("settings.accentColor")}
                value={localSettings.accentColor}
                onChange={(color) =>
                  setLocalSettings({
                    ...localSettings,
                    accentColor: color,
                  })
                }
                swatches={["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"]}
                format="hex"
              />
            </div>

            <div>
              <Select
                label={t("settings.defaultView")}
                placeholder={t("settings.defaultView")}
                data={[
                  { value: "all", label: t("settings.allBookmarks") },
                  { value: "favorites", label: t("settings.favorites") },
                  { value: "folders", label: t("folders.title") },
                  { value: "tags", label: t("tags.title") },
                ]}
                value={localSettings.defaultView}
                onChange={(value) =>
                  setLocalSettings({
                    ...localSettings,
                    defaultView: value || "all",
                  })
                }
              />
            </div>

            <div>
              <Select
                label={t("settings.language")}
                placeholder={t("settings.language")}
                leftSection={<IconLanguage size={16} />}
                data={[
                  { value: "en", label: "English" },
                  { value: "zh", label: "中文" },
                ]}
                value={localSettings.language}
                onChange={(value) =>
                  setLocalSettings({
                    ...localSettings,
                    language: value || "en",
                  })
                }
              />
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="api" pt="md">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-2">OpenAI Compatible {t("settings.api") || "配置"}</h3>
              <p className="text-sm text-gray-500 mb-4">
                {t("settings.geminiDescription") || "配置API的自定义参数（可选）"}
              </p>
              
              <div className="space-y-4">
                <TextInput
                  label="API Base URL"
                  placeholder="https://generativelanguage.googleapis.com/v1beta/openai/v1"
                  value={localSettings.geminiApiBaseUrl}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      geminiApiBaseUrl: e.target.value,
                    })
                  }
                  description={t("settings.geminiBaseUrlDescription") || "使用OpenAI兼容端口，请确保URL末尾包含/v1后缀"}
                />
                
                <TextInput
                  label="Model Name"
                  placeholder="gemini-2.0-flash"
                  value={localSettings.geminiModelName}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      geminiModelName: e.target.value,
                    })
                  }
                  description={t("settings.geminiModelDescription") || "默认使用gemini-2.0-flash模型，能够平衡价格与质量"}
                />
                
                <PasswordInput
                  label="API Key"
                  placeholder={t("settings.geminiApiKeyPlaceholder") || "输入您的API Key"}
                  value={localSettings.geminiApiKey}
                  visible={showApiKey}
                  onVisibilityChange={setShowApiKey}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      geminiApiKey: e.target.value,
                    })
                  }
                  description={t("settings.geminiApiKeyDescription") || "您的API Key和设置仅存储在本地，不会向云端传输，确保数据安全"}
                />
              </div>
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="sync" pt="md">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-2">{t("settings.webdavSync")}</h3>
              <p className="text-sm text-gray-500 mb-4">
                {t("settings.webdavDescription")}
              </p>
              {authLoading ? (
                <p>加载中...</p>
              ) : (
                <WebDAVSync userSettings={userSettings} updateSettings={updateGlobalSettings} />
              )}
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="data" pt="md">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-2">{t("settings.importExport")}</h3>
              <p className="text-sm text-gray-500 mb-4">{t("settings.importExportDescription")}</p>
              <ImportExport />
            </div>

            <div className="pt-4 border-t">
              <h3 className="text-lg font-medium mb-2">{t("settings.dataManagement")}</h3>
              <p className="text-sm text-gray-500 mb-4">{t("settings.dataManagement")}</p>
              <Group>
                <Button
                  variant="light"
                  color="red"
                  onClick={handleClearAllData}
                  loading={isClearingData}
                >
                  {t("settings.clearData")}
                </Button>
                <Button
                  variant="light"
                  color="yellow"
                  onClick={handleResetToSampleData}
                  loading={isResettingData}
                >
                  {t("settings.resetData")}
                </Button>
              </Group>
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="about" pt="md">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-2">{t("settings.aboutTitle") || "About MarkHub"}</h3>
              <p className="text-sm mb-4">
                {t("settings.aboutDescription") || "MarkHub is a modern bookmark management application that combines local storage with cloud synchronization capabilities."}
              </p>

              <Divider my="md" />

              <h4 className="text-md font-medium mb-2">{t("settings.licenseTitle") || "License"}</h4>
              <p className="text-sm mb-2">
                {t("settings.licenseDescription") || "MarkHub is licensed under the CC BY-NC 4.0 License:"}
              </p>

              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md text-sm mb-4">
                <p className="mb-2"><strong>CC BY-NC 4.0 License</strong></p>
                <p className="mb-2">Copyright (c) 2024 MarkHub</p>

                <p className="mb-2">Main terms:</p>
                <ul className="list-disc pl-5 mb-2">
                  <li>You are free to share and adapt the project</li>
                  <li>You must provide appropriate attribution</li>
                  <li>You may not use the material for commercial purposes</li>
                  <li>Derivative works must remain open source</li>
                  <li>Must clearly indicate it is a derivative work based on MarkHub</li>
                  <li>Must include a link to the original project</li>
                </ul>

                <Anchor href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener noreferrer">
                  {t("settings.viewFullLicense") || "View Full License"}
                </Anchor>
              </div>

              <Divider my="md" />

              <h4 className="text-md font-medium mb-2">{t("settings.versionTitle") || "Version"}</h4>
              <p className="text-sm mb-4">
                {t("settings.versionInfo") || "Version"}: 1.0.0
              </p>

              <h4 className="text-md font-medium mb-2">{t("settings.linksTitle") || "Links"}</h4>
              <div className="flex flex-col space-y-2">
                <Anchor href="https://github.com/Syferie/MarkHub" target="_blank" rel="noopener noreferrer">
                  {t("settings.githubRepo") || "GitHub Repository"}
                </Anchor>
                <Anchor href="https://markhub.app" target="_blank" rel="noopener noreferrer">
                  {t("settings.officialWebsite") || "Official Website"}
                </Anchor>
              </div>
            </div>
          </div>
        </Tabs.Panel>
      </Tabs>

      <Group justify="flex-end" mt="xl">
        <Button variant="light" onClick={onClose}>
          {t("bookmarkModal.cancel")}
        </Button>
        <Button onClick={handleSaveChanges} disabled={!hasChanges}>
          {t("settings.save")}
        </Button>
      </Group>
    </Modal>
  )
}
