"use client"

import { useState } from "react"
import { Button, Modal, TextInput, PasswordInput, Group, Text, Switch, Alert, Progress } from "@mantine/core"
import { IconCloud, IconCloudUpload, IconCloudDownload, IconAlertCircle } from "@tabler/icons-react"
import { useBookmarks } from "@/context/bookmark-context"

export default function WebDAVSync() {
  const { bookmarks, folders, tags, favoriteFolders, settings, importBookmarks } = useBookmarks()
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [serverUrl, setServerUrl] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [storagePath, setStoragePath] = useState("/bookmarks/")
  const [autoSync, setAutoSync] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncMessage, setMessage] = useState("")
  const [syncError, setSyncError] = useState("")
  const [syncSuccess, setSyncSuccess] = useState("")

  // Load saved WebDAV credentials from localStorage
  useState(() => {
    const savedWebDAV = localStorage.getItem("webdav_config")
    if (savedWebDAV) {
      try {
        const config = JSON.parse(savedWebDAV)
        setServerUrl(config.serverUrl || "")
        setUsername(config.username || "")
        setStoragePath(config.storagePath || "/bookmarks/")
        setAutoSync(config.autoSync || false)
      } catch (e) {
        console.error("Error loading WebDAV config:", e)
      }
    }
  })

  // Save WebDAV config
  const saveWebDAVConfig = () => {
    const config = {
      serverUrl,
      username,
      storagePath,
      autoSync,
    }
    localStorage.setItem("webdav_config", JSON.stringify(config))
  }

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
  const normalizePath = (path: string) => {
    if (!path) return "bookmarks.json"
    path = path.trim()
    if (!path.startsWith("/")) {
      path = "/" + path
    }
    if (!path.endsWith("/")) {
      path += "/"
    }
    return path + "bookmarks.json"
  }

  // WebDAV request helper
  const webdavRequest = async (method: string, path: string, data?: any) => {
    const normalizedUrl = normalizeUrl(serverUrl)
    const normalizedPath = normalizePath(storagePath)
    const url = normalizedUrl + normalizedPath.substring(1) // Remove leading slash for URL

    const headers = new Headers({
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(`${username}:${password}`),
    })

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
      })

      if (!response.ok) {
        throw new Error(`WebDAV ${method} failed: ${response.status} ${response.statusText}`)
      }

      if (method === "GET") {
        return await response.json()
      }

      return true
    } catch (error) {
      console.error(`WebDAV ${method} error:`, error)
      throw error
    }
  }

  // Check if file exists
  const checkFileExists = async () => {
    try {
      const normalizedUrl = normalizeUrl(serverUrl)
      const normalizedPath = normalizePath(storagePath)
      const url = normalizedUrl + normalizedPath.substring(1)

      const headers = new Headers({
        Authorization: "Basic " + btoa(`${username}:${password}`),
        Depth: "0",
      })

      const response = await fetch(url, {
        method: "PROPFIND",
        headers,
      })

      return response.status === 207 || response.status === 200
    } catch (error) {
      console.error("Error checking file existence:", error)
      return false
    }
  }

  // Upload bookmarks to WebDAV
  const uploadBookmarks = async () => {
    if (!serverUrl || !username || !password) {
      setSyncError("Please fill in all WebDAV connection fields")
      return false
    }

    setIsSyncing(true)
    setSyncProgress(10)
    setMessage("Preparing data for upload...")
    setSyncError("")
    setSyncSuccess("")

    try {
      // Prepare data
      const data = {
        bookmarks,
        folders,
        tags,
        favoriteFolders,
        settings,
        syncDate: new Date().toISOString(),
      }

      setSyncProgress(30)
      setMessage("Connecting to WebDAV server...")

      // Upload data
      await webdavRequest("PUT", normalizePath(storagePath), data)

      setSyncProgress(100)
      setMessage("Upload complete!")
      setSyncSuccess("Bookmarks successfully uploaded to WebDAV server")
      saveWebDAVConfig()
      return true
    } catch (error) {
      console.error("Error uploading bookmarks:", error)
      setSyncError(`Upload failed: ${error instanceof Error ? error.message : String(error)}`)
      setSyncProgress(0)
      return false
    } finally {
      setTimeout(() => {
        setIsSyncing(false)
        setMessage("")
      }, 1000)
    }
  }

  // Download bookmarks from WebDAV
  const downloadBookmarks = async () => {
    if (!serverUrl || !username || !password) {
      setSyncError("Please fill in all WebDAV connection fields")
      return false
    }

    setIsSyncing(true)
    setSyncProgress(10)
    setMessage("Connecting to WebDAV server...")
    setSyncError("")
    setSyncSuccess("")

    try {
      // Check if file exists
      const exists = await checkFileExists()
      if (!exists) {
        setSyncError("No bookmarks file found on the server. Upload your bookmarks first.")
        setSyncProgress(0)
        return false
      }

      setSyncProgress(40)
      setMessage("Downloading bookmarks...")

      // Download data
      const data = await webdavRequest("GET", normalizePath(storagePath))

      setSyncProgress(70)
      setMessage("Processing downloaded data...")

      // Import bookmarks
      if (data && typeof data === "object") {
        importBookmarks(data)
        setSyncProgress(100)
        setMessage("Download complete!")
        setSyncSuccess("Bookmarks successfully downloaded from WebDAV server")
        saveWebDAVConfig()
        return true
      } else {
        throw new Error("Invalid data format received from server")
      }
    } catch (error) {
      console.error("Error downloading bookmarks:", error)
      setSyncError(`Download failed: ${error instanceof Error ? error.message : String(error)}`)
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
        WebDAV Sync
      </Button>

      <Modal opened={syncModalOpen} onClose={() => setSyncModalOpen(false)} title="WebDAV Sync" centered size="lg">
        <div className="space-y-4">
          <Text size="sm" color="dimmed">
            Sync your bookmarks with a WebDAV server to access them from any device.
          </Text>

          <TextInput
            label="Server URL"
            placeholder="https://example.com/webdav/"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            required
          />

          <TextInput
            label="Username"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <PasswordInput
            label="Password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <TextInput
            label="Storage Path"
            placeholder="/bookmarks/"
            description="Path where bookmarks will be stored on the server"
            value={storagePath}
            onChange={(e) => setStoragePath(e.target.value)}
          />

          <Switch
            label="Auto-sync on startup"
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
            mt="md"
          />

          {isSyncing && (
            <div className="mt-4">
              <Text size="sm" mb={5}>
                {syncMessage}
              </Text>
              <Progress value={syncProgress} striped animate />
            </div>
          )}

          {syncError && (
            <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" variant="light">
              {syncError}
            </Alert>
          )}

          {syncSuccess && (
            <Alert title="Success" color="green" variant="light">
              {syncSuccess}
            </Alert>
          )}

          <Group mt="xl">
            <Button
              leftSection={<IconCloudUpload size={16} />}
              variant="light"
              onClick={uploadBookmarks}
              loading={isSyncing}
              disabled={!serverUrl || !username || !password}
              className="flex-1"
            >
              Upload
            </Button>
            <Button
              leftSection={<IconCloudDownload size={16} />}
              variant="light"
              onClick={downloadBookmarks}
              loading={isSyncing}
              disabled={!serverUrl || !username || !password}
              className="flex-1"
            >
              Download
            </Button>
          </Group>
        </div>
      </Modal>
    </>
  )
}
