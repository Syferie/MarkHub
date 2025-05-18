"use client"

import { useState, useEffect } from "react"
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
import { db } from "@/lib/db" // 导入db实例
import { getAppConfig, saveAppConfig, migrateConfigFromIndexedDB } from "@/lib/config-storage" // 导入配置存储工具

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { settings, updateSettings, refreshAllFavicons, clearAllBookmarkData, resetToSampleData } = useBookmarks()
  const { language, setLanguage, t } = useLanguage()
  const [localSettings, setLocalSettings] = useState({
    darkMode: false,
    accentColor: "#3b82f6",
    defaultView: "all",
    language: "en",
    geminiApiBaseUrl: "",
    geminiModelName: "",
    geminiApiKey: "",
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [isRefreshingFavicons, setIsRefreshingFavicons] = useState(false)
  const [isClearingData, setIsClearingData] = useState(false)
  const [isResettingData, setIsResettingData] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  // 初始化本地设置并在打开模态框时从localStorage加载
  useEffect(() => {
    const loadSettingsAndMigrate = async () => {
      if (isOpen) {
        // 尝试从IndexedDB迁移配置到localStorage（如果还未迁移）
        // migrateConfigFromIndexedDB 现在是幂等的，只有在未迁移时才会执行实际操作
        const migrationResult = await migrateConfigFromIndexedDB(db);
        if (migrationResult) {
          console.log("配置迁移已在打开设置时执行/确认。");
        }
        
        // 从context获取基础设置
        const baseSettings = settings || { // settings可能为null
          darkMode: false,
          accentColor: "#3b82f6",
          defaultView: "all",
          language: language || "en",
        };

        // 从localStorage获取完整的应用设置
        const appConfig = getAppConfig();
        
        setLocalSettings({
          darkMode: appConfig.darkMode ?? baseSettings.darkMode,
          accentColor: appConfig.accentColor ?? baseSettings.accentColor,
          defaultView: appConfig.defaultView ?? baseSettings.defaultView,
          language: appConfig.language ?? baseSettings.language ?? "en", // 确保最终是string
          geminiApiBaseUrl: appConfig.geminiApiBaseUrl || "",
          geminiModelName: appConfig.geminiModelName || "",
          geminiApiKey: appConfig.geminiApiKey || "",
        });
        setHasChanges(false);
      }
    };
    loadSettingsAndMigrate();
  }, [isOpen, settings, language]); // settings和language作为依赖项，确保它们更新时重新加载

  // 跟踪变更
  useEffect(() => {
    const checkIfChanged = () => {
      if (isOpen) { // 只在模态框打开时比较
        const currentConfig = getAppConfig();
        const baseSettings = settings || { // 用于比较的基础设置
          darkMode: false,
          accentColor: "#3b82f6",
          defaultView: "all",
          language: language || "en",
        };

        const changed =
          localSettings.darkMode !== (currentConfig.darkMode ?? baseSettings.darkMode) ||
          localSettings.accentColor !== (currentConfig.accentColor ?? baseSettings.accentColor) ||
          localSettings.defaultView !== (currentConfig.defaultView ?? baseSettings.defaultView) ||
          localSettings.language !== (currentConfig.language ?? baseSettings.language) ||
          localSettings.geminiApiBaseUrl !== (currentConfig.geminiApiBaseUrl || "") ||
          localSettings.geminiModelName !== (currentConfig.geminiModelName || "") ||
          localSettings.geminiApiKey !== (currentConfig.geminiApiKey || "");
        
        setHasChanges(changed);
      }
    };
    // 只有当localSettings实际发生改变时才触发比较，避免无限循环
    // isOpen 确保只在模态框打开时执行
    if (isOpen) {
      checkIfChanged();
    }
  }, [localSettings, isOpen, settings, language]);


  const handleSaveChanges = async () => {
    // 从localStorage获取当前的完整设置
    const currentConfig = getAppConfig();
    
    // 构建新的配置对象
    const newConfig = {
      ...currentConfig, // 保留其他可能存在的设置
      darkMode: localSettings.darkMode,
      accentColor: localSettings.accentColor,
      defaultView: localSettings.defaultView,
      language: localSettings.language,
      geminiApiKey: localSettings.geminiApiKey,
      geminiApiBaseUrl: localSettings.geminiApiBaseUrl,
      geminiModelName: localSettings.geminiModelName,
    };

    // 保存到localStorage
    saveAppConfig(newConfig);
    
    console.log("设置已保存到localStorage", {
      darkMode: localSettings.darkMode,
      accentColor: localSettings.accentColor,
      defaultView: localSettings.defaultView,
      language: localSettings.language,
      geminiApiKey: localSettings.geminiApiKey ? "已设置" : "未设置",
      geminiApiBaseUrl: localSettings.geminiApiBaseUrl,
      geminiModelName: localSettings.geminiModelName,
    });
    
    // 更新context中的基础设置
    updateSettings({
      darkMode: localSettings.darkMode,
      accentColor: localSettings.accentColor,
      defaultView: localSettings.defaultView,
      language: localSettings.language,
    });

    // 更新语言设置
    if (localSettings.language !== language) {
      setLanguage(localSettings.language as "en" | "zh");
    }

    onClose();
  };

  const handleRefreshFavicons = async () => {
    setIsRefreshingFavicons(true)
    try {
      await refreshAllFavicons()
    } finally {
      setIsRefreshingFavicons(false)
    }
  }

  const handleClearAllData = async () => {
    if (window.confirm(t("settings.confirmClearData"))) {
      setIsClearingData(true)
      try {
        await clearAllBookmarkData()
      } finally {
        setIsClearingData(false)
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
            {t("settings.appearance")}
          </Tabs.Tab>
          <Tabs.Tab value="api" leftSection={<IconApi size={16} />}>
            {t("settings.api")}
          </Tabs.Tab>
          <Tabs.Tab value="sync" leftSection={<IconCloud size={16} />}>
            {t("settings.sync")}
          </Tabs.Tab>
          <Tabs.Tab value="data" leftSection={<IconFileExport size={16} />}>
            {t("settings.data")}
          </Tabs.Tab>
          <Tabs.Tab value="about" leftSection={<IconInfoCircle size={16} />}>
            {t("settings.about") || "About"}
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
              <WebDAVSync />
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
                  leftSection={<IconRefresh size={16} />}
                  onClick={handleRefreshFavicons}
                  loading={isRefreshingFavicons}
                >
                  {t("settings.refreshFavicons")}
                </Button>
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
