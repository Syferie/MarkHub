"use client"

import { useState, useEffect, useContext } from "react" // Added useContext
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
import { AuthContext } from "@/context/auth-context" // 导入 AuthContext
import { getBookmarks, getFolders, createBookmark, createFolder, Bookmark as ApiBookmark, Folder as ApiFolder } from "@/lib/api-client" // 导入 API 函数和类型
import { toast } from "sonner" // 用于显示通知

// 直接使用 bookmark-context.tsx 中定义的接口，确保类型一致
// 这些接口现在主要用于 previewData 的结构，实际API交互使用 ApiBookmark 和 ApiFolder
interface PreviewBookmark { // 重命名以避免与 ApiBookmark 冲突，或者确保字段兼容
  id: string // id 在导入时会被忽略，由后端生成
  title: string
  url: string
  folderId: string | null
  tags?: string[]
  createdAt: string // createdAt 在导入时会被忽略
  favicon?: string
  isFavorite?: boolean
}

interface PreviewFolder { // 重命名以避免与 ApiFolder 冲突
  id: string // id 在导入时会被忽略
  name: string
  parentId: string | null
}

export default function ImportExport() {
  const { loadInitialData, bookmarks: currentBookmarks } = useBookmarks() // 使用 loadInitialData
  const { t } = useLanguage()
  const authContext = useContext(AuthContext)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  // 明确定义 ImportData 接口，与导入时的数据结构保持一致
  interface ImportData {
    bookmarks?: PreviewBookmark[] // 使用 PreviewBookmark
    folders?: PreviewFolder[]   // 使用 PreviewFolder
    tags?: string[] // 标签的处理方式可能需要根据后端API调整，目前假设是字符串数组
    favoriteFolders?: string[] // 这个字段可能不再直接使用，收藏夹状态在书签本身
    settings?: any // 设置的导入导出可能需要单独处理或移除
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
      const folders: PreviewFolder[] = [ // 使用 PreviewFolder 类型
        {
          id: "folder-import", // 临时 ID，将在导入时被忽略
          name: "Imported",
          parentId: null,
        },
      ]

      // 从HTML中提取书签
      const bookmarks: PreviewBookmark[] = [] // 使用 PreviewBookmark 类型
      const tags: string[] = []

      links.forEach((link, index) => {
        const url = link.getAttribute("href")
        const title = link.textContent || url || `Bookmark ${index + 1}`

        if (url && !url.startsWith("javascript:")) {
          // 创建书签对象
          const bookmark: PreviewBookmark = { // 使用 PreviewBookmark 类型
            id: `bookmark-import-${index}`, // 临时 ID
            title: title,
            url: url,
            folderId: "folder-import", // 临时文件夹 ID
            tags: [], // HTML 导入通常不包含标签信息，除非有特定格式
            createdAt: new Date().toISOString(), // 临时创建时间
            isFavorite: false, // 默认为 false
            // favicon 字段在 PreviewBookmark 中是可选的，这里可以不设置或尝试从HTML获取
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
    if (!previewData) return;
    if (!authContext || !authContext.token) {
      toast.error(t("errors.notAuthenticated") || "User not authenticated"); // 添加翻译
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportSuccess(false);

    const token = authContext.token;

    try {
      const { bookmarks: bookmarksToImport, folders: foldersToImport } = previewData;

      // 导入文件夹
      const createdFolderMap = new Map<string, string>(); // 用于映射旧ID到新创建的文件夹ID

      if (foldersToImport && foldersToImport.length > 0) {
        // 为了处理父子关系，可能需要先创建所有没有 parentId 的文件夹，然后再创建子文件夹
        // 或者，如果后端允许在创建时引用尚不存在的 parentId（不太可能），或者如果数据已排序
        // 简单起见，这里假设文件夹可以按顺序创建，或者后端能处理好引用
        // 更健壮的实现可能需要对文件夹列表进行拓扑排序或多次迭代
        for (const folder of foldersToImport) {
          const folderData: Omit<ApiFolder, 'id' | 'createdAt' | 'updatedAt' | 'userId'> = {
            name: folder.name,
            // parentId 需要映射到新创建的父文件夹ID
            parentId: folder.parentId ? createdFolderMap.get(folder.parentId) || null : null,
          };
          try {
            const createdFolder = await createFolder(token, folderData);
            createdFolderMap.set(folder.id, createdFolder.id); // 存储旧ID和新ID的映射
          } catch (folderError) {
            console.warn(`Error importing folder "${folder.name}":`, folderError);
            toast.warning(`${t("importExport.folderImportError", { name: folder.name })}: ${folderError instanceof Error ? folderError.message : "Unknown error"}`);
            // 如果文件夹已存在或创建失败，可以选择跳过或记录
          }
        }
      }

      // 导入书签
      if (bookmarksToImport && bookmarksToImport.length > 0) {
        for (const bookmark of bookmarksToImport) {
          const bookmarkData: Omit<ApiBookmark, 'id' | 'createdAt' | 'updatedAt' | 'userId'> & { tags?: string[] } = {
            title: bookmark.title,
            url: bookmark.url,
            // folderId 需要映射到新创建的文件夹ID
            folderId: bookmark.folderId ? createdFolderMap.get(bookmark.folderId) || null : null,
            tags: bookmark.tags || [],
            isFavorite: bookmark.isFavorite || false,
            favicon: bookmark.favicon || "",
          };
          try {
            await createBookmark(token, bookmarkData);
          } catch (bookmarkError) {
             console.warn(`Error importing bookmark "${bookmark.title}":`, bookmarkError);
             toast.warning(`${t("importExport.bookmarkImportError", { title: bookmark.title })}: ${bookmarkError instanceof Error ? bookmarkError.message : "Unknown error"}`);
             // 如果书签已存在或创建失败，可以选择跳过或记录
          }
        }
      }

      setImportSuccess(true);
      toast.success(t("importExport.importCompleted"));
      await loadInitialData(); // 导入成功后刷新前端数据

      setTimeout(() => {
        setImportModalOpen(false);
        setFile(null);
        setPreviewData(null);
        setImportSuccess(false);
        setActiveTab("upload"); // 重置回上传标签页
      }, 1500);
    } catch (error) {
      console.error("Error importing data:", error); // 更通用的错误消息
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setImportError(t("importExport.importError") + `: ${errorMessage}`);
      toast.error(t("importExport.importError") + `: ${errorMessage}`);
    } finally {
      setIsImporting(false);
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
        <Button leftSection={<IconDownload size={16} />} variant="light" onClick={async () => {
          if (!authContext || !authContext.token) {
            toast.error(t("errors.notAuthenticated") || "User not authenticated");
            return;
          }
          try {
            const token = authContext.token;
            // 获取所有书签和文件夹，包括用户ID，但导出时通常不需要用户ID
            const apiBookmarks = await getBookmarks(token);
            const apiFolders = await getFolders(token);

            // 将 ApiBookmark 和 ApiFolder 转换为 PreviewBookmark 和 PreviewFolder 以匹配导出格式
            const exportData: ImportData = { // 明确类型为 ImportData
              bookmarks: apiBookmarks.map(b => ({
                id: b.id,
                title: b.title,
                url: b.url,
                folderId: b.folderId || null, // 确保是 null 而不是 undefined
                tags: b.tags || [],
                createdAt: b.created || b.createdAt || new Date().toISOString(),
                favicon: b.favicon || "",
                isFavorite: b.isFavorite || false,
              })),
              folders: apiFolders.map(f => ({
                id: f.id,
                name: f.name,
                parentId: f.parentId || null, // 确保是 null 而不是 undefined
              })),
              exportDate: new Date().toISOString(),
              // tags 和 favoriteFolders 可以根据需要添加，如果它们是独立于书签和文件夹导出的
            };
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "markhub_bookmarks_export.json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success(t("importExport.exportSuccess") || "Export successful!");
          } catch (error) {
            console.error("Error exporting bookmarks:", error);
            toast.error(t("importExport.exportError") + (error instanceof Error ? `: ${error.message}` : ""));
          }
        }}>
          {t("importExport.export")}
        </Button>
        <Button leftSection={<IconUpload size={16} />} variant="light" onClick={() => {
          if (!authContext || !authContext.token) {
             toast.error(t("errors.notAuthenticated") || "User not authenticated. Please log in to import data.");
             return;
          }
          setImportModalOpen(true)
        }}>
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
