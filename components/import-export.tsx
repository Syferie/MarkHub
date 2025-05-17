"use client"

import { useState, useEffect } from "react"
import {
  Button,
  Modal,
  Group,
  Text,
  FileButton,
  Tabs,
  Badge,
  Accordion,
  Divider,
  Alert,
  SegmentedControl,
} from "@mantine/core"
import {
  IconUpload,
  IconDownload,
  IconAlertCircle,
  IconCheck,
  IconX,
  IconFolder,
  IconTag,
  IconFile,
  IconFileCode,
} from "@tabler/icons-react"
import { useBookmarks } from "@/context/bookmark-context"
import { useLanguage } from "@/context/language-context"
// 直接使用 bookmark-context.tsx 中定义的接口，确保类型一致
interface Bookmark {
  id: string
  title: string
  url: string
  folderId: string | null
  tags?: string[]
  createdAt: string
  favicon?: string
  isFavorite?: boolean
}

interface Folder {
  id: string
  name: string
  parentId: string | null
}

export default function ImportExport() {
  const { exportBookmarks, importBookmarks, bookmarks: currentBookmarks } = useBookmarks()
  const { t } = useLanguage()
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  // 明确定义 ImportData 接口，与 importBookmarks 函数接口保持一致
  interface ImportData {
    bookmarks?: Bookmark[]
    folders?: Folder[]
    tags?: string[]
    favoriteFolders?: string[]
    settings?: any
    exportDate?: string
  }

  const [previewData, setPreviewData] = useState<ImportData | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string | null>("upload")
  const [importFormat, setImportFormat] = useState<string>("json")
  const [isImporting, setIsImporting] = useState<boolean>(false)
  const [importSuccess, setImportSuccess] = useState<boolean>(false)

  const handleFileSelect = async (selectedFile: File | null) => {
    if (!selectedFile) return
    setFile(selectedFile)
    setImportError(null)

    try {
      const text = await selectedFile.text()

      // 根据选择的格式处理文件
      if (importFormat === "json") {
        handleJsonImport(text)
      } else if (importFormat === "html") {
        handleHtmlImport(text)
      }
    } catch (error) {
      console.error("Error parsing import file:", error)
      setImportError(`Error parsing file: ${error instanceof Error ? error.message : "Invalid format"}`)
      setPreviewData(null)
    }
  }

  const handleJsonImport = (text: string) => {
    try {
      const data = JSON.parse(text)

      // Validate the imported data
      if (!data.bookmarks || !Array.isArray(data.bookmarks)) {
        throw new Error("Invalid bookmark data format")
      }

      setPreviewData(data)
      setActiveTab("preview")
    } catch (error) {
      setImportError(`Invalid JSON format: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  const handleHtmlImport = (text: string) => {
    try {
      // 创建一个临时的DOM元素来解析HTML
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, "text/html")

      // 查找所有书签链接
      const links = doc.querySelectorAll("a")

      if (links.length === 0) {
        throw new Error("No bookmarks found in HTML file")
      }

      // 提取文件夹结构
      const folders: Folder[] = [
        {
          id: "folder-import",
          name: "Imported",
          parentId: null,
        },
      ]

      // 从HTML中提取书签
      const bookmarks: Bookmark[] = []
      const tags: string[] = []

      links.forEach((link, index) => {
        const url = link.getAttribute("href")
        const title = link.textContent || url || `Bookmark ${index + 1}`

        if (url && !url.startsWith("javascript:")) {
          // 创建书签对象
          const bookmark: Bookmark = {
            id: `bookmark-import-${index}`,
            title: title,
            url: url,
            folderId: "folder-import",
            tags: [],
            createdAt: new Date().toISOString(),
            isFavorite: false,
          }

          // 尝试从父元素获取文件夹信息
          const parentFolder = link.closest("DL")?.previousElementSibling
          if (parentFolder && parentFolder.tagName === "H3") {
            const folderName = parentFolder.textContent
            if (folderName) {
              // 检查文件夹是否已存在
              let folderId = folders.find((f) => f.name === folderName)?.id

              if (!folderId) {
                folderId = `folder-import-${folders.length}`
                folders.push({
                  id: folderId,
                  name: folderName,
                  parentId: null,
                })
              }

              bookmark.folderId = folderId
            }
          }

          bookmarks.push(bookmark)
        }
      })

      // 创建预览数据
      const previewData = {
        bookmarks,
        folders,
        tags,
        favoriteFolders: [],
        exportDate: new Date().toISOString(),
      }

      setPreviewData(previewData)
      setActiveTab("preview")
    } catch (error) {
      setImportError(`Error parsing HTML: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  const handleImport = async () => {
    if (!previewData) return

    setIsImporting(true)
    setImportError(null)
    setImportSuccess(false)

    try {
      // 导入书签是异步操作
      await importBookmarks(previewData as ImportData)
      setImportSuccess(true)

      // 导入成功后，等待一小段时间再关闭模态窗口，让用户看到成功提示
      setTimeout(() => {
        setImportModalOpen(false)
        setFile(null)
        setPreviewData(null)
        setImportSuccess(false)
      }, 1500)
    } catch (error) {
      console.error("Error importing bookmarks:", error)
      setImportError(`Error importing: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsImporting(false)
    }
  }

  const closeModal = () => {
    setImportModalOpen(false)
    setFile(null)
    setPreviewData(null)
    setImportError(null)
    setActiveTab("upload")
  }

  // Format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return "Unknown"
    try {
      return new Date(dateString).toLocaleString()
    } catch (e) {
      return "Invalid date"
    }
  }

  return (
    <>
      <Group>
        <Button leftSection={<IconDownload size={16} />} variant="light" onClick={exportBookmarks}>
          {t("importExport.export")}
        </Button>
        <Button leftSection={<IconUpload size={16} />} variant="light" onClick={() => setImportModalOpen(true)}>
          {t("importExport.import")}
        </Button>
      </Group>

      <Modal opened={importModalOpen} onClose={closeModal} title={t("importExport.importBookmarks")} centered size="lg" classNames={{ header: 'border-none' }}>
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="upload">{t("importExport.uploadFile")}</Tabs.Tab>
            {previewData && <Tabs.Tab value="preview">{t("importExport.preview")}</Tabs.Tab>}
          </Tabs.List>

          <Tabs.Panel value="upload" pt="md">
            <div className="space-y-4">
              <Text size="sm" c="dimmed">
                {t("importExport.selectFileDescription")}
              </Text>

              <div className="mb-4">
                <Text size="sm" fw={500} className="mb-2">
                  {t("importExport.importFormat")}
                </Text>
                <SegmentedControl
                  value={importFormat}
                  onChange={setImportFormat}
                  data={[
                    { label: "JSON", value: "json" },
                    { label: "HTML", value: "html" },
                  ]}
                  fullWidth
                />
              </div>

              <div className="flex justify-center p-6 border-2 border-dashed rounded-md">
                <FileButton
                  onChange={handleFileSelect}
                  accept={importFormat === "json" ? "application/json" : "text/html"}
                >
                  {(props) => (
                    <Button
                      {...props}
                      variant="light"
                      leftSection={importFormat === "json" ? <IconFile size={16} /> : <IconFileCode size={16} />}
                    >
                      {t("importExport.selectFile", { format: importFormat.toUpperCase() })}
                    </Button>
                  )}
                </FileButton>
              </div>

              {file && (
                <Text size="sm" className="mt-2">
                  {t("importExport.selectedFile")} {file.name}
                </Text>
              )}

              {importError && (
                <Alert icon={<IconAlertCircle size={16} />} title={t("importExport.error")} color="red" variant="light">
                  {importError}
                </Alert>
              )}

              {importSuccess && (
                <Alert icon={<IconCheck size={16} />} title={t("importExport.success")} color="green" variant="light">
                  {t("importExport.importCompleted")}
                </Alert>
              )}
            </div>
          </Tabs.Panel>

          {previewData && (
            <Tabs.Panel value="preview" pt="md">
              <div className="space-y-4">
                <Alert icon={<IconAlertCircle size={16} />} title={t("importExport.warning")} color="yellow" variant="light">
                  {t("importExport.importWarning")}
                </Alert>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 border rounded-md">
                    <Text size="sm" fw={500} className="mb-2">
                      {t("importExport.importSummary")}
                    </Text>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Text size="sm">{t("importExport.bookmarks")}:</Text>
                        <Badge>{previewData.bookmarks?.length || 0}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <Text size="sm">{t("importExport.folders")}:</Text>
                        <Badge>{previewData.folders?.length || 0}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <Text size="sm">{t("importExport.tags")}:</Text>
                        <Badge>{previewData.tags?.length || 0}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <Text size="sm">{t("folders.favorites")}:</Text>
                        <Badge>{previewData.favoriteFolders?.length || 0}</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 border rounded-md">
                    <Text size="sm" fw={500} className="mb-2">
                      {t("importExport.currentData")}
                    </Text>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Text size="sm">{t("importExport.bookmarks")}:</Text>
                        <Badge>{currentBookmarks?.length || 0}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <Text size="sm">{t("importExport.exportDate")}:</Text>
                        <Text size="xs">{formatDate(previewData.exportDate)}</Text>
                      </div>
                    </div>
                  </div>
                </div>

                <Accordion>
                  <Accordion.Item value="bookmarks">
                    <Accordion.Control>
                      <Group>
                        <Text>{t("importExport.bookmarksPreview")}</Text>
                        <Badge>{previewData.bookmarks?.length || 0}</Badge>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <div className="max-h-60 overflow-y-auto">
                        {previewData.bookmarks?.slice(0, 10).map((bookmark, index) => (
                          <div key={index} className="p-2 border-b">
                            <Text size="sm" fw={500}>
                              {bookmark.title}
                            </Text>
                            <Text size="xs" color="dimmed">
                              {bookmark.url}
                            </Text>
                          </div>
                        ))}
                        {(previewData.bookmarks?.length || 0) > 10 && (
                          <Text size="xs" c="dimmed" className="mt-2 text-center">
                            {t("importExport.andMore", { count: String((previewData.bookmarks?.length || 0) - 10) })}
                          </Text>
                        )}
                      </div>
                    </Accordion.Panel>
                  </Accordion.Item>

                  <Accordion.Item value="folders">
                    <Accordion.Control>
                      <Group>
                        <Text>{t("importExport.foldersPreview")}</Text>
                        <Badge>{previewData.folders?.length || 0}</Badge>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <div className="max-h-60 overflow-y-auto">
                        {previewData.folders?.slice(0, 10).map((folder, index) => (
                          <div key={index} className="p-2 border-b flex items-center">
                            <IconFolder size={16} className="mr-2 text-blue-500" />
                            <Text size="sm">{folder.name}</Text>
                            {folder.parentId && (
                              <Badge size="xs" className="ml-2">
                                {t("importExport.subfolder")}
                              </Badge>
                            )}
                          </div>
                        ))}
                        {(previewData.folders?.length || 0) > 10 && (
                          <Text size="xs" c="dimmed" className="mt-2 text-center">
                            {t("importExport.andMore", { count: String((previewData.folders?.length || 0) - 10) })}
                          </Text>
                        )}
                      </div>
                    </Accordion.Panel>
                  </Accordion.Item>

                  <Accordion.Item value="tags">
                    <Accordion.Control>
                      <Group>
                        <Text>{t("importExport.tagsPreview")}</Text>
                        <Badge>{previewData.tags?.length || 0}</Badge>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <div className="max-h-60 overflow-y-auto">
                        <div className="flex flex-wrap gap-2 p-2">
                          {previewData.tags?.slice(0, 20).map((tag, index) => (
                            <Badge key={index} leftSection={<IconTag size={12} />}>
                              {tag}
                            </Badge>
                          ))}
                          {(previewData.tags?.length || 0) > 20 && (
                            <Text size="xs" c="dimmed">
                              {t("importExport.andMore", { count: String((previewData.tags?.length || 0) - 20) })}
                            </Text>
                          )}
                        </div>
                      </div>
                    </Accordion.Panel>
                  </Accordion.Item>

                  {previewData.settings && (
                    <Accordion.Item value="settings">
                      <Accordion.Control>
                        <Text>{t("importExport.settings")}</Text>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <div className="p-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Text size="sm">{t("importExport.darkMode")}:</Text>
                            <Text size="sm">{previewData.settings.darkMode ? t("importExport.enabled") : t("importExport.disabled")}</Text>

                            <Text size="sm">{t("importExport.accentColor")}:</Text>
                            <div className="flex items-center">
                              <div
                                className="w-4 h-4 rounded-full mr-2"
                                style={{ backgroundColor: previewData.settings.accentColor }}
                              />
                              <Text size="sm">{previewData.settings.accentColor}</Text>
                            </div>

                            <Text size="sm">{t("importExport.defaultView")}:</Text>
                            <Text size="sm">{previewData.settings.defaultView}</Text>
                          </div>
                        </div>
                      </Accordion.Panel>
                    </Accordion.Item>
                  )}
                </Accordion>
              </div>
            </Tabs.Panel>
          )}
        </Tabs>

        <Divider my="md" />

        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={closeModal} leftSection={<IconX size={16} />} disabled={isImporting}>
            {t("importExport.cancel")}
          </Button>
          {previewData && activeTab === "preview" && (
            <Button
              onClick={handleImport}
              leftSection={<IconCheck size={16} />}
              color="green"
              loading={isImporting}
              disabled={isImporting}
            >
              {isImporting ? t("importExport.importing") : t("importExport.confirmImport")}
            </Button>
          )}
        </Group>
      </Modal>
    </>
  )
}
