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
  IconBookmark,
  IconSettings,
  IconExternalLink,
  IconRefresh,
  IconLogin,
  IconLogout,
  IconCloud,
  IconCloudOff,
  IconUser,
  IconUserOff
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
  const { t } = useTranslation()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isEnabled: false,
    pendingCount: 0
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null)
  const [loading, setLoading] = useState(true)

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
      
      // 获取同步状态
      const config = await configManager.getConfig()
      setSyncStatus({
        isEnabled: config.syncEnabled,
        pendingCount: 0 // TODO: 实际计算待同步数量
      })
      
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
    // TODO: 实现同步刷新逻辑
    console.log('Refreshing sync...')
  }

  const handleLogin = () => {
    setSettingsOpen(true)
  }

  const handleLogout = async () => {
    await apiClient.logout()
    setIsAuthenticated(false)
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
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <ThemeIcon size="lg" radius="md" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
              <IconBookmark size={20} />
            </ThemeIcon>
            <Box>
              <Title order={3} size="h4" fw={600} c="dark.8">
                {t('appTitle')}
              </Title>
              <Text size="xs" c="dimmed">
                {t('appSubtitle')}
              </Text>
            </Box>
          </Group>
          
          <Group gap="xs">
            <Tooltip label={t('refreshSync')} position="bottom">
              <ActionIcon 
                variant="light" 
                color="blue"
                size="lg"
                onClick={handleRefreshSync}
                disabled={!isAuthenticated || !syncStatus.isEnabled}
              >
                <IconRefresh size={18} />
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