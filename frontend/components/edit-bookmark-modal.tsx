"use client"

import { useState, useEffect } from "react"
import { Modal, TextInput, Button, Group, Tooltip, ActionIcon, Alert, Text, Combobox, PillsInput, Pill, useCombobox, Progress } from "@mantine/core"
import { IconWand, IconAlertCircle, IconCheck, IconSparkles, IconLoader2, IconFolder } from "@tabler/icons-react"
import { useBookmarks } from "@/context/bookmark-context"
import { useLanguage } from "@/context/language-context"
import type { Bookmark } from "@/types"
import { HierarchicalFolderSelect } from "./hierarchical-folder-select"
import { generateTags } from "@/lib/tag-api"
import { suggestFolder } from "@/lib/folder-api"
import { uploadBookmarksToWebDAV } from "./webdav-sync"
import { useContext } from "react"
import { AuthContext } from "@/context/auth-context"
import { addTagsBatchToBookmark } from "@/lib/api-client" // 新增导入

interface EditBookmarkModalProps {
  bookmark: Bookmark
  isOpen: boolean
  onClose: () => void
}

export default function EditBookmarkModal({ bookmark, isOpen, onClose }: EditBookmarkModalProps) {
  const { updateBookmark, tags, folders } = useBookmarks()
  const { t } = useLanguage()
  const authContext = useContext(AuthContext)
  const [title, setTitle] = useState(bookmark.title)
  const [url, setUrl] = useState(bookmark.url)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(bookmark.folderId || null)
  const [selectedTags, setSelectedTags] = useState<string[]>(bookmark.tags || [])
  const [isLoadingTags, setIsLoadingTags] = useState(false)
  const [isLoadingFolder, setIsLoadingFolder] = useState(false)
  const [loading, setLoading] = useState(false) // 添加加载状态
  const [tagError, setTagError] = useState<string | null>(null)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [isBatchAddingTags, setIsBatchAddingTags] = useState(false) // 新增状态
  
  // 封装显示toast的函数（假设系统中有这样的函数）
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    // 这里可以调用实际的toast显示逻辑
    console.log(`Toast: ${message} (${type})`);
  }
  const [tagGenerationStatus, setTagGenerationStatus] = useState<{
    status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;
    message?: string;
  }>({ status: 'idle' })
  const [folderGenerationStatus, setFolderGenerationStatus] = useState<{
    status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;
    message?: string;
  }>({ status: 'idle' })

  useEffect(() => {
    if (isOpen) {
      setTitle(bookmark.title)
      setUrl(bookmark.url)
      setSelectedFolder(bookmark.folderId || null)
      setSelectedTags(bookmark.tags || [])
      setTagError(null)
      setFolderError(null)
      setTagGenerationStatus({ status: 'idle' })
      setFolderGenerationStatus({ status: 'idle' })
    }
  }, [isOpen, bookmark])

  const handleSubmit = async () => {
    if (title && url) {
      setLoading(true);
      try {
        const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`)
        // 使用类型断言绕过TypeScript检查
        const dataToUpdate = {
          title,
          url: urlObj.toString(),
          folderId: selectedFolder,
          tags: selectedTags, // 明确使用用户选择的标签
        } as Partial<Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>;
        
        // 日志记录调试信息
        console.log("发送到后端的更新数据:", JSON.stringify(dataToUpdate));
        
        // 更新书签
        const updatedBookmark = await updateBookmark(bookmark.id, dataToUpdate);
        
        // 显示成功消息
        showToast("书签已更新", "success");
        
        // 立即关闭模态框
        onClose();
        
        try {
          // Call upload function directly, let it check if WebDAV is enabled
          console.log("Calling uploadBookmarksToWebDAV...");
          if (authContext && authContext.userSettings) {
            const uploadResult = await uploadBookmarksToWebDAV(authContext.userSettings);
            console.log("Automatic upload result:", uploadResult);

            if (!uploadResult) {
              console.warn("Automatic upload returned false, WebDAV may not be enabled or upload failed");
            }
          } else {
            console.warn("AuthContext or userSettings not available, skipping WebDAV sync");
          }
        } catch (syncError) {
          console.error("Failed to automatically sync bookmark data:", syncError)
        }
      } catch (e) {
        console.error("Invalid URL:", e)
        showToast("更新书签失败", "error");
        // Handle invalid URL error
      } finally {
        setLoading(false);  // 无论成功或失败，都重置加载状态
      }
    }
  }
  
  

  // 处理AI建议标签
  const handleSuggestTags = async () => {
    if (!url) {
      setTagError(t("bookmarkModal.enterUrlFirst"))
      return
    }

    // 从authContext获取用户认证信息
    if (!authContext?.token) {
      setTagError("未登录或会话已过期")
      return
    }

    try {
      setIsLoadingTags(true)
      setTagError(null)
      setTagGenerationStatus({ status: 'pending', message: '正在生成标签...' })

      // 确保URL格式正确
      const formattedUrl = url.startsWith("http") ? url : `https://${url}`
      
      // 获取用户的标签列表
      const userTagList = authContext?.userSettings?.tagList || []

      // 调用新的标签建议API
      const suggestedTags = await generateTags(
        authContext?.token || "",
        title,
        formattedUrl,
        userTagList
      )

      // 更新标签状态
      setTagGenerationStatus({ status: 'completed', message: '标签生成完成！' })
      setSelectedTags(suggestedTags)
      
    } catch (error) {
      console.error("Tag suggestion error:", error)
      setTagError(error instanceof Error ? error.message : "生成标签建议失败")
      setTagGenerationStatus({ status: 'failed', message: error instanceof Error ? error.message : "生成标签建议失败" })
    } finally {
      setIsLoadingTags(false)
      // 延迟将状态重置为idle，让用户有时间看到完成状态
      setTimeout(() => {
        if (tagGenerationStatus.status === 'completed') {
          setTagGenerationStatus({ status: 'idle' })
        }
      }, 3000)
    }
  }

  // Ensure tags is an array before mapping
  const tagOptions = Array.isArray(tags)
    ? tags.map((tag) => ({
        value: tag,
        label: tag,
      }))
    : []

  const createTag = async (query: string) => {
    if (!authContext?.token || !bookmark?.id) {
      setTagError("用户未认证或书签ID无效。")
      return
    }
    if (!query.trim()) {
      // 如果输入为空，则不执行任何操作
      return;
    }

    setIsBatchAddingTags(true)
    setTagError(null)
    try {
      const updatedBookmark = await addTagsBatchToBookmark(authContext.token, bookmark.id, query)
      setSelectedTags(updatedBookmark.tags || []) // 更新表单状态
      // 注意：这里不直接更新 BookmarkContext，依赖 handleSubmit 中的 updateBookmark
    } catch (error) {
      console.error("Batch add tags error:", error)
      setTagError(error instanceof Error ? error.message : "批量添加标签失败")
    } finally {
      setIsBatchAddingTags(false)
    }
  }

  // 处理AI建议文件夹
  const handleSuggestFolder = async () => {
    if (!url || !title) { // 确保标题和URL都存在
      setFolderError(t("bookmarkModal.enterUrlAndTitleFirst"));
      return;
    }

    if (!authContext?.token) {
      setFolderError("用户未认证，无法获取文件夹建议。");
      return;
    }
    // 预检查API Key配置
    if (!authContext?.userSettings?.geminiApiKey) {
      setFolderError("AI推荐功能需要配置Gemini API密钥，请在设置中配置。");
      return;
    }

    try {
      setIsLoadingFolder(true);
      setFolderError(null);
      setFolderGenerationStatus({ status: 'processing', message: '正在获取文件夹建议...' });

      const formattedUrl = url.startsWith("http") ? url : `https://${url}`;

      const suggestedFolderName = await suggestFolder(
        authContext.token,
        title,
        formattedUrl
      );

      if (suggestedFolderName) {
        const matchedFolder = folders.find(folder => folder.name === suggestedFolderName);
        if (matchedFolder) {
          setSelectedFolder(matchedFolder.id);
          setFolderGenerationStatus({ status: 'completed', message: `建议文件夹: ${suggestedFolderName}` });
        } else {
          setFolderGenerationStatus({ status: 'completed', message: suggestedFolderName ? `AI建议 '${suggestedFolderName}' (不在现有列表)` : '未找到合适的文件夹建议' });
          console.log("AI suggested folder not in existing list or no suggestion:", suggestedFolderName);
        }
      } else {
        setFolderGenerationStatus({ status: 'completed', message: '未找到合适的文件夹建议' });
      }

    } catch (error) {
      console.error("Folder suggestion error in modal:", error);
      const errorMessage = error instanceof Error ? error.message : "获取文件夹建议时发生未知错误";
      setFolderError(errorMessage);
      setFolderGenerationStatus({ status: 'failed', message: errorMessage });
    } finally {
      setIsLoadingFolder(false);
      setTimeout(() => {
        if (folderGenerationStatus.status !== 'failed') {
           setFolderGenerationStatus({ status: 'idle' });
        }
      }, 5000);
    }
  }

  // 检查是否配置了Gemini API
  const isApiConfigured = !!authContext?.userSettings?.geminiApiKey
  const isTagApiConfigured = isApiConfigured
  const isFolderApiConfigured = isApiConfigured

  // 新添加的TagSelector组件，使用最新的Mantine API
  function TagSelector({
    tagOptions,
    selectedTags,
    setSelectedTags,
    createTag
  }: {
    tagOptions: { value: string; label: string }[],
    selectedTags: string[],
    setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>,
    createTag: (query: string) => Promise<void> // 修改 createTag 的预期返回类型
  }) {
    // 添加一个控制下拉框开关状态的状态变量
    const [opened, setOpened] = useState(false)
    const combobox = useCombobox({
      onDropdownClose: () => combobox.resetSelectedOption(),
      onDropdownOpen: () => combobox.updateSelectedOptionIndex('active'),
      opened,
      onOpenedChange: setOpened
    })

    const [search, setSearch] = useState('')

    const exactOptionMatch = tagOptions.some((item) => item.value === search)

    const handleValueSelect = async (val: string) => {
      if (val === '$create') {
        // 创建新标签
        await createTag(search); // createTag 使用当前的 search 值
        setSearch('');    // 然后清空 search
        // 确保下拉框保持打开状态
        setOpened(true);
      } else {
        // 选择或取消选择现有标签
        setSelectedTags((current) =>
          current.includes(val) ? current.filter((v) => v !== val) : [...current, val]
        );
        setSearch(''); // 清空搜索框，即使用户选择了现有标签
        // 确保下拉框保持打开状态
        setOpened(true);
      }
    }

    const handleValueRemove = (val: string) =>
      setSelectedTags((current) => current.filter((v) => v !== val))

    // 渲染已选择的标签
    const values = selectedTags.map((item) => (
      <Pill key={item} withRemoveButton onRemove={() => handleValueRemove(item)}>
        {item}
      </Pill>
    ))

    // 渲染选项列表
    const options = tagOptions
      .filter((item) => item.value.toLowerCase().includes(search.trim().toLowerCase()))
      .map((item, index) => (
        <Combobox.Option value={item.value} key={`${item.value}-${index}`} active={selectedTags.includes(item.value)}>
          <Group gap="sm">
            {selectedTags.includes(item.value) ? <IconCheck size={12} /> : null}
            <span>{item.label}</span>
          </Group>
        </Combobox.Option>
      ))

    return (
      <Combobox
        store={combobox}
        onOptionSubmit={handleValueSelect}
        withinPortal={false}
        transitionProps={{ transition: 'pop', duration: 200 }}
      >
        <Combobox.DropdownTarget>
          <PillsInput onClick={() => combobox.openDropdown()}>
            <Pill.Group>
              {values}

              <Combobox.EventsTarget>
                <PillsInput.Field
                  onFocus={() => combobox.openDropdown()}
                  // 移除onBlur事件以防止在选择选项时关闭下拉框
                  // onBlur={() => combobox.closeDropdown()}
                  value={search}
                  placeholder={t("bookmarkModal.selectOrCreateTags")}
                  onChange={(event) => {
                    combobox.updateSelectedOptionIndex()
                    setSearch(event.currentTarget.value)
                  }}
                  onKeyDown={async (event) => {
                    if (event.key === 'Enter' && search.trim().length > 0) {
                      event.preventDefault();
                      // 阻止在批量添加标签时重复提交
                      if (isBatchAddingTags) return;
                      await createTag(search);
                      setSearch('');
                      // 保持下拉框打开，让用户可以继续输入或选择
                      setOpened(true);
                    } else if (event.key === 'Backspace' && search.length === 0) {
                      event.preventDefault();
                      handleValueRemove(selectedTags[selectedTags.length - 1]);
                    }
                  }}
                />
              </Combobox.EventsTarget>
            </Pill.Group>
          </PillsInput>
        </Combobox.DropdownTarget>

        <Combobox.Dropdown>
          <Combobox.Options>
            {options}

            {!exactOptionMatch && search.trim().length > 0 && (
              <Combobox.Option value="$create">+ {t("bookmarkModal.create")} {search}</Combobox.Option>
            )}

            {options.length === 0 && search.trim().length > 0 && (
              <Combobox.Empty>{t("bookmarkModal.nothingFound")}</Combobox.Empty>
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    )
  }

  return (
    <Modal opened={isOpen} onClose={onClose} title={t("bookmarkModal.editTitle")} centered classNames={{ header: 'border-none' }}>
      <div className="space-y-4">
        <TextInput
          label={t("bookmarkModal.title")}
          placeholder={t("bookmarkModal.title")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <TextInput
          label={t("bookmarkModal.url")}
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">
                {t("bookmarkModal.folder")}
                
              </label>

              {/* 文件夹生成状态指示器 */}
              {folderGenerationStatus.status !== 'idle' && (
                <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                  {folderGenerationStatus.status === 'pending' && (
                    <IconLoader2 size={14} className="animate-spin" />
                  )}
                  {folderGenerationStatus.status === 'completed' && (
                    <IconCheck size={14} className="text-green-600" />
                  )}
                  {folderGenerationStatus.message}
                </div>
              )}
            </div>

            <Tooltip label={!url ? t("bookmarkModal.configureTags") : t("bookmarkModal.suggestFolder")}>
              <ActionIcon
                size="sm"
                color="blue"
                onClick={handleSuggestFolder}
                loading={isLoadingFolder}
                disabled={!url}
                className="disabled:opacity-40 disabled:bg-transparent dark:disabled:bg-transparent"
              >
                <IconFolder size={16} />
              </ActionIcon>
            </Tooltip>
          </div>

          {/* 进度条 */}
          {(folderGenerationStatus.status === 'pending' || folderGenerationStatus.status === 'processing') && (
            <Progress
              value={folderGenerationStatus.progress || 0}
              size="xs"
              color={folderGenerationStatus.status === 'pending' ? "blue" : "green"}
              striped
              animated
              mb="xs"
            />
          )}

          <HierarchicalFolderSelect
            value={selectedFolder}
            onChange={setSelectedFolder}
          />

          {folderError && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              mt="xs"
              p="xs"
              withCloseButton
              onClose={() => setFolderError(null)}
            >
              {folderError}
            </Alert>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">
                {t("bookmarkModal.tags")}
                
              </label>

              {/* 标签生成状态指示器 */}
              {tagGenerationStatus.status !== 'idle' && (
                <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                  {tagGenerationStatus.status === 'pending' && (
                    <IconLoader2 size={14} className="animate-spin" />
                  )}
                  {tagGenerationStatus.status === 'completed' && (
                    <IconCheck size={14} className="text-green-600" />
                  )}
                  {tagGenerationStatus.message}
                </div>
              )}
            </div>

            <Tooltip label={!url || !isTagApiConfigured ? t("bookmarkModal.configureTags") : t("bookmarkModal.suggestTags")}>
              <ActionIcon
                size="sm"
                color="blue"
                onClick={handleSuggestTags}
                loading={isLoadingTags}
                disabled={!url || !isTagApiConfigured}
                className="disabled:opacity-40 disabled:bg-transparent dark:disabled:bg-transparent"
              >
                <IconSparkles size={16} />
              </ActionIcon>
            </Tooltip>
          </div>

          {/* 进度条 */}
          {(tagGenerationStatus.status === 'pending' || tagGenerationStatus.status === 'processing') && (
            <Progress
              value={tagGenerationStatus.progress || 0}
              size="xs"
              color={tagGenerationStatus.status === 'pending' ? "blue" : "green"}
              striped
              animated
              mb="xs"
            />
          )}

          {/* 使用新的TagSelector组件替换旧的MultiSelect组件 */}
          <TagSelector
            tagOptions={tagOptions}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            createTag={createTag} // 传递异步函数
          />
          {isBatchAddingTags && (
            <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-1">
              <IconLoader2 size={14} className="animate-spin" />
              <span>正在批量添加标签...</span>
            </div>
          )}
          {tagError && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              mt="xs"
              p="xs"
              withCloseButton
              onClose={() => setTagError(null)}
            >
              {tagError}
            </Alert>
          )}

        </div>

        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={onClose}>
            {t("bookmarkModal.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            loading={loading}
            disabled={
              loading || // 添加loading状态检查
              isBatchAddingTags || // 禁用保存按钮当批量添加标签时
              tagGenerationStatus.status === 'pending' ||
              tagGenerationStatus.status === 'processing' ||
              folderGenerationStatus.status === 'pending' ||
              folderGenerationStatus.status === 'processing'
            }
          >
            {t("bookmarkModal.update")}
          </Button>
        </Group>
      </div>
    </Modal>
  )
}
