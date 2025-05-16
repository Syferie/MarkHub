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
} from "@mantine/core"
import { IconPalette, IconCloud, IconFileExport, IconRefresh, IconApi } from "@tabler/icons-react"
import ImportExport from "./import-export"
import WebDAVSync from "./webdav-sync"
import { useBookmarks } from "@/context/bookmark-context"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { settings, updateSettings, refreshAllFavicons, clearAllBookmarkData, resetToSampleData } = useBookmarks()
  const [localSettings, setLocalSettings] = useState({
    darkMode: false,
    accentColor: "#3b82f6",
    defaultView: "all",
    tagApiUrl: "",
    tagApiKey: "",
    tagConcurrencyLimit: 5,
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
      })
      setHasChanges(false)
    }
  }, [isOpen, settings])

  // Track changes
  useEffect(() => {
    if (settings) {
      const changed =
        localSettings.darkMode !== settings.darkMode ||
        localSettings.accentColor !== settings.accentColor ||
        localSettings.defaultView !== settings.defaultView ||
        localSettings.tagApiUrl !== (settings.tagApiUrl || "") ||
        localSettings.tagApiKey !== (settings.tagApiKey || "") ||
        localSettings.tagConcurrencyLimit !== (settings.tagConcurrencyLimit || 5)

      setHasChanges(changed)
    }
  }, [localSettings, settings])

  const handleSaveChanges = () => {
    updateSettings(localSettings)
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
    if (window.confirm("确定要清除所有书签数据吗？此操作不可恢复！")) {
      setIsClearingData(true)
      try {
        await clearAllBookmarkData()
      } finally {
        setIsClearingData(false)
      }
    }
  }

  const handleResetToSampleData = async () => {
    if (window.confirm("确定要重置为示例数据吗？当前所有书签数据将被替换！")) {
      setIsResettingData(true)
      try {
        await resetToSampleData()
      } finally {
        setIsResettingData(false)
      }
    }
  }

  return (
    <Modal opened={isOpen} onClose={onClose} title="Settings" size="lg" centered>
      <Tabs defaultValue="appearance">
        <Tabs.List>
          <Tabs.Tab value="appearance" leftSection={<IconPalette size={16} />}>
            Appearance
          </Tabs.Tab>
          <Tabs.Tab value="api" leftSection={<IconApi size={16} />}>
            API
          </Tabs.Tab>
          <Tabs.Tab value="sync" leftSection={<IconCloud size={16} />}>
            Sync
          </Tabs.Tab>
          <Tabs.Tab value="data" leftSection={<IconFileExport size={16} />}>
            Data
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="appearance" pt="md">
          <div className="space-y-6">
            <div>
              <Switch
                label="Dark Mode"
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
                label="Accent Color"
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
                label="Default View"
                placeholder="Select default view"
                data={[
                  { value: "all", label: "All Bookmarks" },
                  { value: "favorites", label: "Favorites" },
                  { value: "folders", label: "Folders" },
                  { value: "tags", label: "Tags" },
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
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="api" pt="md">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Tag Generation API</h3>
              <p className="text-sm text-gray-500 mb-4">
                Configure API connection information for the automatic tag generation service. This feature can analyze bookmark URLs
                and generate relevant tags automatically. The system will send requests to the tag generation service based on the
                following configuration.
              </p>

              <div className="space-y-4">
                <TextInput
                  label="API Base URL"
                  placeholder="https://api.tag-service.example.com"
                  value={localSettings.tagApiUrl}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      tagApiUrl: e.target.value,
                    })
                  }
                  description="Enter the base URL of the tag generation service, e.g. https://api.tag-service.example.com"
                />

                <PasswordInput
                  label="API Key"
                  placeholder="Your API key"
                  value={localSettings.tagApiKey}
                  visible={showApiKey}
                  onVisibilityChange={setShowApiKey}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      tagApiKey: e.target.value,
                    })
                  }
                  description="This key will be used in the Authorization header of API requests as Bearer <API_KEY>"
                />

                <TextInput
                  label="AI 标签生成并发数"
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
                  description="同时处理的书签数量，建议值：3-10 (默认: 5)"
                />
              </div>

              <Divider my="md" />

              <div className="text-sm text-gray-500">
                <h4 className="font-medium mb-2">API Specification:</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li>The system will send a POST request to <code>{"{Your Base URL}/api/v1/tags/generate-from-url"}</code></li>
                  <li>
                    Request body format: <code>{"{ url: string, filter_tags?: string[], fetch_options?: {...} }"}</code>
                  </li>
                  <li>
                    Upon success, a task ID is returned, and the system will automatically poll the task status until completion
                  </li>
                  <li>
                    Completed response format: <code>{"{ status: 'completed', tags: string[], url: string, ... }"}</code>
                  </li>
                  <li>
                    All requests include the header <code>Authorization: Bearer &lt;Your API Key&gt;</code>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="sync" pt="md">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-2">WebDAV Sync</h3>
              <p className="text-sm text-gray-500 mb-4">
                Sync your bookmarks across devices using WebDAV protocol. This allows you to access your bookmarks from
                any device that can connect to your WebDAV server.
              </p>
              <WebDAVSync />
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="data" pt="md">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Import/Export</h3>
              <p className="text-sm text-gray-500 mb-4">Export your bookmarks to a file or import from a file.</p>
              <ImportExport />
            </div>

            <div className="pt-4 border-t">
              <h3 className="text-lg font-medium mb-2">Data Management</h3>
              <p className="text-sm text-gray-500 mb-4">Manage your bookmark data.</p>
              <Group>
                <Button
                  variant="light"
                  leftSection={<IconRefresh size={16} />}
                  onClick={handleRefreshFavicons}
                  loading={isRefreshingFavicons}
                >
                  Refresh All Favicons
                </Button>
                <Button
                  variant="light"
                  color="red"
                  onClick={handleClearAllData}
                  loading={isClearingData}
                >
                  Clear All Data
                </Button>
                <Button
                  variant="light"
                  color="yellow"
                  onClick={handleResetToSampleData}
                  loading={isResettingData}
                >
                  Reset to Sample Data
                </Button>
              </Group>
            </div>
          </div>
        </Tabs.Panel>
      </Tabs>

      <Group justify="flex-end" mt="xl">
        <Button variant="light" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSaveChanges} disabled={!hasChanges}>
          Save Changes
        </Button>
      </Group>
    </Modal>
  )
}
