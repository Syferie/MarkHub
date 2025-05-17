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
    tagApiUrl: "",
    tagApiKey: "",
    tagConcurrencyLimit: 5,
    language: "en",
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [isRefreshingFavicons, setIsRefreshingFavicons] = useState(false)
  const [isClearingData, setIsClearingData] = useState(false)
  const [isResettingData, setIsResettingData] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  // Initialize local settings when modal opens
  useEffect(() => {
    if (isOpen && settings) {
      setLocalSettings({
        darkMode: settings.darkMode,
        accentColor: settings.accentColor,
        defaultView: settings.defaultView,
        tagApiUrl: settings.tagApiUrl || "",
        tagApiKey: settings.tagApiKey || "",
        tagConcurrencyLimit: settings.tagConcurrencyLimit || 5,
        language: settings.language || language,
      })
      setHasChanges(false)
    }
  }, [isOpen, settings, language])

  // Track changes
  useEffect(() => {
    if (settings) {
      const changed =
        localSettings.darkMode !== settings.darkMode ||
        localSettings.accentColor !== settings.accentColor ||
        localSettings.defaultView !== settings.defaultView ||
        localSettings.tagApiUrl !== (settings.tagApiUrl || "") ||
        localSettings.tagApiKey !== (settings.tagApiKey || "") ||
        localSettings.tagConcurrencyLimit !== (settings.tagConcurrencyLimit || 5) ||
        localSettings.language !== (settings.language || language)

      setHasChanges(changed)
    }
  }, [localSettings, settings, language])

  const handleSaveChanges = () => {
    updateSettings(localSettings)

    // 更新语言设置
    if (localSettings.language !== language) {
      setLanguage(localSettings.language as "en" | "zh")
    }

    onClose()
  }

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
              <h3 className="text-lg font-medium mb-2">{t("settings.api")}</h3>
              <p className="text-sm text-gray-500 mb-4">
                {t("settings.apiUrlDescription")}
              </p>

              <div className="space-y-4">
                <TextInput
                  label={t("settings.apiBaseUrl")}
                  placeholder={t("settings.apiUrlPlaceholder")}
                  value={localSettings.tagApiUrl}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      tagApiUrl: e.target.value,
                    })
                  }
                  description={t("settings.apiUrlDescription")}
                />

                <PasswordInput
                  label={t("settings.apiKey")}
                  placeholder={t("settings.apiKeyPlaceholder")}
                  value={localSettings.tagApiKey}
                  visible={showApiKey}
                  onVisibilityChange={setShowApiKey}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      tagApiKey: e.target.value,
                    })
                  }
                  description={t("settings.apiKeyDescription")}
                />

                <TextInput
                  label={t("settings.concurrencyLimit")}
                  placeholder="5"
                  type="number"
                  value={String(localSettings.tagConcurrencyLimit || 5)}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setLocalSettings({
                      ...localSettings,
                      tagConcurrencyLimit: !isNaN(value) && value > 0 ? value : 5,
                    });
                  }}
                  description={t("settings.concurrencyDescription")}
                />
              </div>

              <Divider my="md" />

              <div className="text-sm text-gray-500">
                <h4 className="font-medium mb-2">{t("settings.apiSpecification")}</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li>{t("settings.apiEndpointInfo")} <code>{"{Your Base URL}/api/v1/tags/generate-from-url"}</code></li>
                  <li>
                    {t("settings.apiRequestFormat")}: <code>{"{ url: string, filter_tags?: string[], fetch_options?: {...} }"}</code>
                  </li>
                  <li>
                    {t("settings.apiTaskIdInfo")}
                  </li>
                  <li>
                    {t("settings.apiResponseFormat")}: <code>{"{ status: 'completed', tags: string[], url: string, ... }"}</code>
                  </li>
                  <li>
                    {t("settings.apiAuthHeader")} <code>Authorization: Bearer &lt;Your API Key&gt;</code>
                  </li>
                </ul>
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
