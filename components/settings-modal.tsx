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

  // Initialize local settings when modal opens
  useEffect(() => {
    const loadSettings = async () => {
      if (isOpen) {
        // 从 context 获取基础设置
        const baseSettings = settings || { // settings 可能为 null
          darkMode: false,
          accentColor: "#3b82f6",
          defaultView: "all",
          language: language || "en",
        };

        // 从 IndexedDB 获取完整的应用设置，包括Gemini配置
        const storedAppSettings = await db.getAppSettings();
        
        setLocalSettings({
          darkMode: storedAppSettings?.darkMode ?? baseSettings.darkMode,
          accentColor: storedAppSettings?.accentColor ?? baseSettings.accentColor,
          defaultView: storedAppSettings?.defaultView ?? baseSettings.defaultView,
          language: storedAppSettings?.language ?? baseSettings.language ?? "en", // 确保最终是string
          geminiApiBaseUrl: storedAppSettings?.geminiApiBaseUrl || "",
          geminiModelName: storedAppSettings?.geminiModelName || "",
          geminiApiKey: storedAppSettings?.geminiApiKey || "",
        });
        setHasChanges(false);
      }
    };
    loadSettings();
  }, [isOpen, settings, language]); // settings 和 language 作为依赖项，确保它们更新时重新加载

  // Track changes
  useEffect(() => {
    const checkIfChanged = async () => {
      if (isOpen) { // 只在模态框打开时比较
        const currentDbSettings = await db.getAppSettings();
        const baseSettings = settings || { // 用于比较的基础设置
          darkMode: false,
          accentColor: "#3b82f6",
          defaultView: "all",
          language: language || "en",
        };

        const changed =
          localSettings.darkMode !== (currentDbSettings?.darkMode ?? baseSettings.darkMode) ||
          localSettings.accentColor !== (currentDbSettings?.accentColor ?? baseSettings.accentColor) ||
          localSettings.defaultView !== (currentDbSettings?.defaultView ?? baseSettings.defaultView) ||
          localSettings.language !== (currentDbSettings?.language ?? baseSettings.language) ||
          localSettings.geminiApiBaseUrl !== (currentDbSettings?.geminiApiBaseUrl || "") ||
          localSettings.geminiModelName !== (currentDbSettings?.geminiModelName || "") ||
          localSettings.geminiApiKey !== (currentDbSettings?.geminiApiKey || "");
        
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
    // 从 IndexedDB 获取当前的完整设置，以确保我们不会覆盖其他未在此模态框中管理的设置
    const currentStoredSettings = await db.getAppSettings() || {};
    
    const newSettingsToSave = {
      ...currentStoredSettings, // 保留其他可能存在的设置
      darkMode: localSettings.darkMode,
      accentColor: localSettings.accentColor,
      defaultView: localSettings.defaultView,
      language: localSettings.language,
      geminiApiKey: localSettings.geminiApiKey,
      geminiApiBaseUrl: localSettings.geminiApiBaseUrl,
      geminiModelName: localSettings.geminiModelName,
    };

    // updateSettings 来自 context，它应该内部调用 db.saveAppSettings
    // 我们需要确保 updateSettings 会传递完整的 AppSettings 对象
    // 或者，我们在这里直接调用 db.saveAppSettings
    // 为了更直接地控制，我们在这里调用 db.saveAppSettings
    // 然后通知 context 更新其内部状态（如果 context 不直接从db读取的话）

    await db.saveAppSettings(newSettingsToSave);
    
    // 手动调用 context 的 updateSettings 来同步 context 中的 settings state
    // 假设 updateSettings 只是更新内存中的状态，或者它自己会再次从db加载
    // 最安全的做法是让 updateSettings 能够接受一个完整的 AppSettings 对象
    // 并触发全局状态的更新。
    // 如果 updateSettings 仅用于部分更新，则需要调整。
    // 这里我们假设 updateSettings 能够正确处理传递给它的 localSettings 的所有相关字段
    // 并更新 context 中的状态。
    // 对于Gemini字段，context的settings对象可能没有这些字段，所以updateSettings可能需要调整
    // 或者我们不通过context的updateSettings来持久化gemini字段，db.saveAppSettings已完成持久化。
    // context中的settings主要用于UI主题等，AI配置由API调用时直接从db读取。

    // 更新 context 中的基础设置（非Gemini部分）
    updateSettings({
      darkMode: localSettings.darkMode,
      accentColor: localSettings.accentColor,
      defaultView: localSettings.defaultView,
      language: localSettings.language,
      // 不传递gemini字段给旧的updateSettings，除非它已更新以处理它们
    });


    // 更新语言设置 (如果语言 context 不直接从 db 读取)
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
