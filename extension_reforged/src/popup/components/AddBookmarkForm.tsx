import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Stack,
  TextInput,
  Button,
  Text,
  Alert,
  Group,
  ThemeIcon,
  Loader
} from '@mantine/core'
import { IconBookmarkPlus, IconCheck, IconAlertCircle } from '@tabler/icons-react'

interface AddBookmarkFormProps {
  currentTab: chrome.tabs.Tab | null
}

function AddBookmarkForm({ currentTab }: AddBookmarkFormProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  // 当前标签页变化时更新表单
  useEffect(() => {
    if (currentTab) {
      setTitle(currentTab.title || '')
      setUrl(currentTab.url || '')
    }
  }, [currentTab])

  const handleAddBookmark = async () => {
    if (!title.trim() || !url.trim()) {
      setError(t('titleAndUrlRequired'))
      return
    }

    try {
      setLoading(true)
      setError('')

      // 使用 Chrome Bookmarks API 添加书签
      if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        await new Promise<void>((resolve, reject) => {
          chrome.bookmarks.create({
            title: title.trim(),
            url: url.trim()
          }, (_bookmark) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
            } else {
              resolve()
            }
          })
        })

        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      } else {
        throw new Error(t('chromeBookmarksNotAvailable'))
      }

    } catch (error) {
      setError(t('addBookmarkFailed') + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Stack gap="md">
      <Group gap="sm" align="center">
        <ThemeIcon size="sm" radius="xl" color="blue" variant="light">
          <IconBookmarkPlus size={14} />
        </ThemeIcon>
        <Text size="sm" fw={600} c="dark.7">
          {t('addBookmarkTitle')}
        </Text>
      </Group>
      
      <Stack gap="sm">
        <TextInput
          label={t('title')}
          placeholder={t('bookmarkTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          radius="md"
          size="sm"
          styles={{
            label: {
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--mantine-color-dark-6)'
            }
          }}
        />
        
        <TextInput
          label={t('url')}
          placeholder={t('urlPlaceholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          radius="md"
          size="sm"
          styles={{
            label: {
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--mantine-color-dark-6)'
            }
          }}
        />
        
        <Button
          leftSection={
            loading ? (
              <Loader size={16} color="white" />
            ) : success ? (
              <IconCheck size={16} />
            ) : (
              <IconBookmarkPlus size={16} />
            )
          }
          onClick={handleAddBookmark}
          loading={loading}
          color={success ? 'green' : 'blue'}
          variant={success ? 'light' : 'filled'}
          fullWidth
          radius="md"
          size="sm"
          disabled={success}
        >
          {success ? t('bookmarkAdded') : t('addBookmark')}
        </Button>

        {error && (
          <Alert 
            color="red" 
            variant="light" 
            icon={<IconAlertCircle size={16} />}
            radius="md"
            styles={{
              message: { fontSize: '12px' }
            }}
          >
            {error}
          </Alert>
        )}
      </Stack>
    </Stack>
  )
}

export default AddBookmarkForm