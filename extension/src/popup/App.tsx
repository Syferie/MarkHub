import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Title,
  Text,
  Button,
  Stack,
  Group,
  Badge,
  ActionIcon,
  Tooltip,
  Card,
  Box,
  Flex,
  ThemeIcon,
  Loader,
  Paper
} from '@mantine/core'
import {
  IconSettings,
  IconExternalLink,
  IconRefresh,
  IconLogin,
  IconLogout,
  IconCloud,
  IconCloudOff,
  IconUser,
  IconUserOff,
  IconBrandGithub,
  IconLanguage
} from '@tabler/icons-react'
import { getConfigManager } from '../core/ConfigManager'
import { getMarkhubAPIClient } from '../core/MarkhubAPIClient'
import SettingsModal from './components/SettingsModal'
import AddBookmarkForm from './components/AddBookmarkForm'

interface SyncStatus {
  isEnabled: boolean
  lastSyncTime?: string
  pendingCount: number
}

function App() {
  const { t, i18n } = useTranslation()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isEnabled: false,
    pendingCount: 0
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshLoading, setRefreshLoading] = useState(false)
  const [currentLanguage, setCurrentLanguage] = useState<string>('zh')

  const configManager = getConfigManager()
  const apiClient = getMarkhubAPIClient()

  // 初始化
  useEffect(() => {
    initializeApp()
  }, [])

  const initializeApp = async () => {
    try {
      // 初始化配置管理器
      await configManager.initialize()
      
      // 检查认证状态
      const authenticated = apiClient.isAuthenticated()
      setIsAuthenticated(authenticated)
      
      // 获取同步状态和语言设置
      const config = await configManager.getConfig()
      setSyncStatus({
        isEnabled: config.syncEnabled,
        pendingCount: 0 // TODO: 实际计算待同步数量
      })
      
      // 初始化语言设置
      const language = config.language || 'zh'
      setCurrentLanguage(language)
      await i18n.changeLanguage(language)
      
      // 获取当前标签页信息
      getCurrentTab()
      
    } catch (error) {
      console.error('Failed to initialize app:', error)
    } finally {
      setLoading(false)
    }
  }

  const getCurrentTab = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          setCurrentTab(tabs[0])
        }
      })
    }
  }

  const handleOpenMarkhub = async () => {
    const config = await configManager.getConfig()
    const markhubUrl = config.markhubAppUrl || 'http://127.0.0.1:3000'
    
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: markhubUrl })
    }
  }

  const handleRefreshSync = async () => {
    try {
      setRefreshLoading(true)
      // TODO: 实现同步刷新逻辑
      console.log('Refreshing sync...')
      
      // 模拟刷新过程
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // 这里可以添加实际的同步刷新逻辑
      // 例如：await syncManager.refreshSync()
      
    } catch (error) {
      console.error('Refresh sync failed:', error)
    } finally {
      setRefreshLoading(false)
    }
  }

  const handleLogin = () => {
    setSettingsOpen(true)
  }

  const handleLogout = async () => {
    await apiClient.logout()
    setIsAuthenticated(false)
  }

  const handleLanguageToggle = async () => {
    const newLanguage = currentLanguage === 'zh' ? 'en' : 'zh'
    setCurrentLanguage(newLanguage)
    
    // 更新i18n语言
    await i18n.changeLanguage(newLanguage)
    
    // 保存到配置
    try {
      const config = await configManager.getConfig()
      await configManager.updateConfig({
        ...config,
        language: newLanguage
      })
    } catch (error) {
      console.error('Failed to save language setting:', error)
    }
  }

  if (loading) {
    return (
      <Box w={380} h={600} bg="gray.0">
        <Flex align="center" justify="center" h="100%" direction="column" gap="md">
          <Loader size="md" color="blue" />
          <Text size="sm" c="dimmed">{t('loading')}</Text>
        </Flex>
      </Box>
    )
  }

  return (
    <Box w={400} h={600} bg="gray.0">
      {/* 现代化头部设计 */}
      <Paper shadow="sm" p="md" radius={0} bg="white">
        <Group justify="space-between" align="flex-start">
          <Group gap="sm" style={{ flex: 1, maxWidth: 'calc(100% - 140px)' }}>
            <Box
              w={32}
              h={32}
              style={{
                borderRadius: '8px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <img
                src="/icons/icon48.png"
                alt="Markhub Logo"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain'
                }}
              />
            </Box>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Title order={3} size="h4" fw={600} c="dark.8" style={{ lineHeight: 1.2 }}>
                {t('appTitle')}
              </Title>
              <Text
                size="xs"
                c="dimmed"
                style={{
                  lineHeight: 1.3,
                  wordBreak: 'break-word',
                  hyphens: 'auto'
                }}
              >
                {t('appSubtitle')}
              </Text>
            </Box>
          </Group>
          
          <Group gap="xs" style={{ flexShrink: 0 }}>
            <Tooltip label={t('githubRepository')} position="bottom">
              <ActionIcon
                variant="light"
                color="dark"
                size="lg"
                onClick={() => {
                  if (typeof chrome !== 'undefined' && chrome.tabs) {
                    chrome.tabs.create({ url: 'https://github.com/Syferie/MarkHub' })
                  }
                }}
              >
                <IconBrandGithub size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('refreshSync')} position="bottom">
              <ActionIcon
                variant="light"
                color="blue"
                size="lg"
                onClick={handleRefreshSync}
                disabled={!isAuthenticated || !syncStatus.isEnabled}
                loading={refreshLoading}
                style={{
                  transition: 'all 0.2s ease',
                  transform: refreshLoading ? 'rotate(360deg)' : 'rotate(0deg)'
                }}
              >
                <IconRefresh
                  size={18}
                  style={{
                    transition: 'transform 0.6s ease',
                    transform: refreshLoading ? 'rotate(360deg)' : 'rotate(0deg)'
                  }}
                />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={currentLanguage === 'zh' ? 'Switch to English' : '切换到中文'} position="bottom">
              <ActionIcon
                variant="light"
                color="orange"
                size="lg"
                onClick={handleLanguageToggle}
              >
                <IconLanguage size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('settingsTitle')} position="bottom">
              <ActionIcon
                variant="light"
                color="gray"
                size="lg"
                onClick={() => setSettingsOpen(true)}
              >
                <IconSettings size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Paper>

      {/* 主要内容区域 */}
      <Box p="md" style={{ height: 'calc(100% - 88px)', overflowY: 'auto' }}>
        <Stack gap="lg">
          {/* 状态卡片 */}
          <Card shadow="sm" padding="md" radius="md" withBorder>
            <Stack gap="md">
              {/* 账户状态 */}
              <Group justify="space-between" align="center">
                <Group gap="sm">
                  <ThemeIcon 
                    size="sm" 
                    radius="xl" 
                    color={isAuthenticated ? 'green' : 'red'}
                    variant="light"
                  >
                    {isAuthenticated ? <IconUser size={14} /> : <IconUserOff size={14} />}
                  </ThemeIcon>
                  <Text size="sm" c="dark.6">{t('accountStatus')}</Text>
                </Group>
                
                <Group gap="xs">
                  <Badge 
                    color={isAuthenticated ? 'green' : 'red'} 
                    variant="light"
                    size="sm"
                    radius="sm"
                  >
                    {isAuthenticated ? t('loggedIn') : t('notLoggedIn')}
                  </Badge>
                  {isAuthenticated ? (
                    <Tooltip label={t('logout')}>
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={handleLogout}>
                        <IconLogout size={14} />
                      </ActionIcon>
                    </Tooltip>
                  ) : (
                    <Tooltip label={t('login')}>
                      <ActionIcon size="sm" variant="subtle" color="blue" onClick={handleLogin}>
                        <IconLogin size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>

              {/* 同步状态 */}
              <Group justify="space-between" align="center">
                <Group gap="sm">
                  <ThemeIcon 
                    size="sm" 
                    radius="xl" 
                    color={syncStatus.isEnabled ? 'blue' : 'gray'}
                    variant="light"
                  >
                    {syncStatus.isEnabled ? <IconCloud size={14} /> : <IconCloudOff size={14} />}
                  </ThemeIcon>
                  <Text size="sm" c="dark.6">{t('syncStatus')}</Text>
                </Group>
                
                <Badge 
                  color={syncStatus.isEnabled ? 'blue' : 'gray'} 
                  variant="light"
                  size="sm"
                  radius="sm"
                >
                  {syncStatus.isEnabled ? t('enabled') : t('disabled')}
                </Badge>
              </Group>

              {syncStatus.pendingCount > 0 && (
                <Group gap="xs" mt="xs">
                  <Text size="xs" c="orange.6" fw={500}>
                    {t('pendingSync', { count: syncStatus.pendingCount })}
                  </Text>
                </Group>
              )}
            </Stack>
          </Card>

          {/* 快速添加书签卡片 */}
          <Card shadow="sm" padding="md" radius="md" withBorder>
            <AddBookmarkForm currentTab={currentTab} />
          </Card>

          {/* 快捷操作卡片 */}
          <Card shadow="sm" padding="md" radius="md" withBorder>
            <Stack gap="md">
              <Button
                variant="light"
                leftSection={<IconExternalLink size={16} />}
                onClick={handleOpenMarkhub}
                fullWidth
                radius="md"
                size="sm"
              >
                {t('openMarkhubApp')}
              </Button>
            </Stack>
          </Card>
        </Stack>
      </Box>

      {/* 设置模态框 */}
      <SettingsModal
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onAuthSuccess={() => {
          setIsAuthenticated(true)
          setSettingsOpen(false)
        }}
      />
    </Box>
  )
}

export default App