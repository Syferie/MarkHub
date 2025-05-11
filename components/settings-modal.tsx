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
  const { settings, updateSettings, refreshAllFavicons } = useBookmarks()
  const [localSettings, setLocalSettings] = useState({
    darkMode: false,
    accentColor: "#3b82f6",
    defaultView: "all",
    tagApiUrl: "",
    tagApiKey: "",
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [isRefreshingFavicons, setIsRefreshingFavicons] = useState(false)
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
        localSettings.tagApiKey !== (settings.tagApiKey || "")

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
              <h3 className="text-lg font-medium mb-2">Tag Recommendation API</h3>
              <p className="text-sm text-gray-500 mb-4">
                Configure an API endpoint that will suggest tags based on bookmark URLs. The API should accept a URL and
                optionally a list of existing tags, and return a list of recommended tags.
              </p>

              <div className="space-y-4">
                <TextInput
                  label="API Endpoint URL"
                  placeholder="https://api.example.com/suggest-tags"
                  value={localSettings.tagApiUrl}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      tagApiUrl: e.target.value,
                    })
                  }
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
                  description="This key will be sent in the Authorization header"
                />
              </div>

              <Divider my="md" />

              <div className="text-sm text-gray-500">
                <h4 className="font-medium mb-2">API Requirements:</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Endpoint must accept POST requests</li>
                  <li>
                    Request body should include <code>{"{ url: string, existingTags?: string[] }"}</code>
                  </li>
                  <li>
                    Response should be <code>{"{ tags: string[] }"}</code>
                  </li>
                  <li>
                    Authorization header will be set as <code>Bearer &lt;YOUR_API_KEY&gt;</code>
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
                <Button variant="light" color="red">
                  Clear All Data
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
