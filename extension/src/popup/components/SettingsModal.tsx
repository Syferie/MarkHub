import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  Stack,
  TextInput,
  PasswordInput,
  Button,
  Switch,
  Divider,
  Text,
  Group,
  Alert,
  Tabs,
  Loader,
  Card,
  ThemeIcon,
  Select
} from '@mantine/core'
import { IconInfoCircle, IconLogin, IconRefresh, IconCheck, IconX, IconTestPipe, IconWifi, IconSettings, IconLogout, IconUserCheck, IconExternalLink, IconDownload, IconShield } from '@tabler/icons-react'
import { getConfigManager, type PluginConfig } from '../../core/ConfigManager'
import { getMarkhubAPIClient } from '../../core/MarkhubAPIClient'
import { getSyncManager } from '../../core/SyncManager'
import { getReverseSyncManager } from '../../core/ReverseSyncManager'
import { createAIServiceClient } from '../../core/AIServiceClient'
import { changeLanguage } from '../../i18n'

interface SettingsModalProps {
  opened: boolean
  onClose: () => void
  onAuthSuccess: () => void
}

function SettingsModal({ opened, onClose, onAuthSuccess }: SettingsModalProps) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<PluginConfig | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loginForm, setLoginForm] = useState({
    identity: '',
    password: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loginError, setLoginError] = useState('')
  const [success, setSuccess] = useState('')
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    foldersCreated: number;
    bookmarksCreated: number;
    errors: string[];
  } | null>(null)
  const [aiTestLoading, setAiTestLoading] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null)
  const [reverseSyncLoading, setReverseSyncLoading] = useState(false)
  const [reverseSyncResult, setReverseSyncResult] = useState<{
    success: boolean;
    foldersCreated: number;
    bookmarksCreated: number;
    bookmarksUpdated: number;
    skipped: number;
    errors: string[];
  } | null>(null)

  const configManager = getConfigManager()
  const apiClient = getMarkhubAPIClient()
  const syncManager = getSyncManager()
  const reverseSyncManager = getReverseSyncManager()

  useEffect(() => {
    if (opened) {
      loadConfig().catch(error => {
        console.error('Failed to load config in useEffect:', error)
      })
    }
  }, [opened])

  const loadConfig = async () => {
    try {
      const currentConfig = await configManager.getConfig()
      setConfig(currentConfig)
      
      // 检查认证状态
      const authenticated = apiClient.isAuthenticated()
      setIsAuthenticated(authenticated)
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }

  const handleConfigChange = (key: keyof PluginConfig, value: any) => {
    if (!config) return
    
    setConfig({
      ...config,
      [key]: value
    })
  }

  const handleAIConfigChange = (key: string, value: string) => {
    if (!config) return
    
    setConfig({
      ...config,
      aiServiceConfig: {
        ...config.aiServiceConfig,
        folderRec: {
          ...config.aiServiceConfig.folderRec,
          [key]: value
        }
      }
    })
  }

  const handleSaveConfig = async () => {
    if (!config) return
    
    try {
      setLoading(true)
      await configManager.updateConfig(config)
      setSuccess(t('configSaved'))
      setTimeout(() => setSuccess(''), 3000)
    } catch (error) {
      setError(t('saveConfigFailed') + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // 解析登录错误并返回用户友好的错误消息
  const parseLoginError = (error: any): string => {
    const errorMessage = error?.message || error?.toString() || '';
    
    console.log('Login error details:', error); // 调试用，可以在生产环境中移除
    
    // 检查是否是认证失败 (400 Bad Request with authentication failure)
    if (errorMessage.includes('invalid login credentials') ||
        errorMessage.includes('Failed to authenticate') ||
        errorMessage.includes('Bad Request')) {
      return t('loginErrorInvalidCredentials')
    }
    
    // 检查是否是网络错误
    if (errorMessage.includes('fetch') ||
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('TypeError: fetch')) {
      return t('loginErrorNetworkError')
    }
    
    // 检查是否是连接被拒绝
    if (errorMessage.includes('Connection refused') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ERR_CONNECTION_REFUSED') ||
        errorMessage.includes('net::ERR_CONNECTION_REFUSED')) {
      return t('loginErrorConnectionRefused')
    }
    
    // 检查是否是服务器错误 (5xx)
    if (errorMessage.includes('500') ||
        errorMessage.includes('502') ||
        errorMessage.includes('503') ||
        errorMessage.includes('504') ||
        errorMessage.includes('Internal Server Error')) {
      return t('loginErrorServerError')
    }
    
    // 检查是否是API请求失败
    if (errorMessage.includes('API request failed')) {
      // 提取状态码信息
      if (errorMessage.includes('400')) {
        return t('loginErrorInvalidCredentials')
      }
      if (errorMessage.includes('401') || errorMessage.includes('403')) {
        return t('loginErrorInvalidCredentials')
      }
      if (errorMessage.includes('404')) {
        return t('loginErrorConnectionRefused')
      }
    }
    
    // 如果包含具体的错误信息，显示原始错误（但要简化）
    if (errorMessage.length > 0 && errorMessage.length < 200) {
      // 简化错误消息，移除技术细节
      const simplifiedMessage = errorMessage
        .replace('API request failed with status', '请求失败，状态码:')
        .replace('Failed to authenticate.', '认证失败')
        .replace('API request failed: Error:', '')
        .trim()
      
      return `${t('loginFailed')}: ${simplifiedMessage}`
    }
    
    // 默认未知错误
    return t('loginErrorUnknown')
  }

  const handleLogin = async () => {
    if (!loginForm.identity || !loginForm.password) {
      setLoginError(t('emailAndPasswordRequired'))
      return
    }

    try {
      setLoading(true)
      setLoginError('')
      
      await apiClient.login(loginForm.identity, loginForm.password)
      setSuccess(t('loginSuccess'))
      
      // 更新认证状态
      setIsAuthenticated(true)
      
      // 清空表单
      setLoginForm({ identity: '', password: '' })
      
      // 清空登录错误
      setLoginError('')
      
      // 通知父组件认证成功
      setTimeout(() => {
        onAuthSuccess()
      }, 1000)
      
    } catch (error) {
      const friendlyErrorMessage = parseLoginError(error)
      setLoginError(friendlyErrorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      setLoading(true)
      await apiClient.logout()
      setIsAuthenticated(false)
      setSuccess(t('logoutConfirm'))
      setTimeout(() => setSuccess(''), 3000)
    } catch (error) {
      setError('退出登录失败: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenRegister = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      // 使用用户配置的markhubAppUrl，如果没有配置则使用默认值
      const appUrl = config?.markhubAppUrl || 'https://markhub.app/'
      // 确保URL以/结尾
      const finalUrl = appUrl.endsWith('/') ? appUrl : appUrl + '/'
      chrome.tabs.create({ url: finalUrl })
    }
  }

  const handleInitialSync = async () => {
    if (!syncManager.isSyncAvailable()) {
      setError(t('pleaseLoginFirst'))
      return
    }

    try {
      setSyncLoading(true)
      setError('')
      setSyncResult(null)
      
      const result = await syncManager.performInitialSync()
      setSyncResult(result)
      
      if (result.success) {
        setSuccess(t('initialSyncCompleted', { folders: result.foldersCreated, bookmarks: result.bookmarksCreated }))
      } else {
        setError(t('initialSyncFailed'))
      }
      
    } catch (error) {
      setError(t('initialSyncError') + (error as Error).message)
    } finally {
      setSyncLoading(false)
    }
  }

  const handleReverseSync = async () => {
    if (!reverseSyncManager.isReverseSyncAvailable()) {
      setError(t('pleaseLoginFirst'))
      return
    }

    try {
      setReverseSyncLoading(true)
      setError('')
      setReverseSyncResult(null)
      
      const result = await reverseSyncManager.syncFromMarkhub()
      setReverseSyncResult(result)
      
      if (result.success) {
        setSuccess(t('reverseSyncCompleted'))
      } else {
        setError(t('reverseSyncFailed'))
      }
      
    } catch (error) {
      setError(t('reverseSyncFailed') + ': ' + (error as Error).message)
    } finally {
      setReverseSyncLoading(false)
    }
  }

  const handleTestAIService = async () => {
    if (!config) return

    // 验证必填字段
    if (!config.aiServiceConfig.folderRec.apiUrl ||
        !config.aiServiceConfig.folderRec.apiKey ||
        !config.aiServiceConfig.folderRec.modelName) {
      setError(t('fillCompleteAiConfig'))
      return
    }

    try {
      setAiTestLoading(true)
      setError('')
      setAiTestResult(null)
      
      // 创建 AI 服务客户端实例
      const aiClient = createAIServiceClient(config.aiServiceConfig.folderRec)
      
      // 执行测试
      const result = await aiClient.testConnection()
      setAiTestResult(result)
      
      if (result.success) {
        setSuccess(result.message)
      } else {
        setError(result.message)
      }
      
    } catch (error) {
      const errorMessage = t('aiServiceTestFailed') + (error as Error).message
      setError(errorMessage)
      setAiTestResult({
        success: false,
        message: errorMessage,
        details: error
      })
    } finally {
      setAiTestLoading(false)
    }
  }

  // 处理语言切换
  const handleLanguageChange = async (language: 'auto' | 'en' | 'zh') => {
    try {
      const configManager = getConfigManager()
      await configManager.set('language', language)
      await changeLanguage(language)
      
      // 重新获取完整配置
      const updatedConfig = await configManager.getConfig()
      setConfig(updatedConfig)
      setSuccess(t('configSaved'))
    } catch (error) {
      setError(t('saveConfigFailed') + (error as Error).message)
    }
  }

  if (!config) {
    return null
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm" align="center">
          <ThemeIcon size="sm" radius="xl" color="blue" variant="light">
            <IconSettings size={14} />
          </ThemeIcon>
          <Text size="lg" fw={600}>{t('pluginSettings')}</Text>
        </Group>
      }
      size="lg"
      centered
      radius="md"
      overlayProps={{
        backgroundOpacity: 0.55,
        blur: 3,
      }}
    >
      <Tabs defaultValue="auth">
        <Tabs.List>
          <Tabs.Tab value="auth">{t('accountAuth')}</Tabs.Tab>
          <Tabs.Tab value="ai">{t('aiService')}</Tabs.Tab>
          <Tabs.Tab value="sync">{t('syncSettings')}</Tabs.Tab>
          <Tabs.Tab value="reverse-sync">{t('reverseSyncTab')}</Tabs.Tab>
          <Tabs.Tab value="language">{t('languageSettings')}</Tabs.Tab>
        </Tabs.List>

        {/* 账户认证标签页 */}
        <Tabs.Panel value="auth" pt="md">
          <Stack gap="md">
            {/* 动态状态提示 */}
            <Alert
              icon={<IconInfoCircle size={16} />}
              color={isAuthenticated ? "green" : "blue"}
              variant="light"
            >
              {isAuthenticated ? t('loginStatusLoggedIn') : t('loginStatusNotLoggedIn')}
            </Alert>
            
            {/* 根据登录状态显示不同内容 */}
            {isAuthenticated ? (
              /* 已登录状态 */
              <Card withBorder padding="md" radius="md">
                <Stack gap="md">
                  <Group gap="sm" align="center">
                    <ThemeIcon size="sm" radius="xl" color="green" variant="light">
                      <IconUserCheck size={14} />
                    </ThemeIcon>
                    <Text size="sm" fw={600} c="dark.7">
                      {t('currentlyLoggedIn')}
                    </Text>
                  </Group>

                  <Text size="sm" c="dark.6">
                    {t('accountManagement')}
                  </Text>
                  
                  <Button
                    leftSection={<IconLogout size={16} />}
                    onClick={handleLogout}
                    loading={loading}
                    variant="light"
                    color="red"
                    radius="md"
                    size="sm"
                  >
                    {t('logoutConfirm')}
                  </Button>

                  {/* 登录后可用功能说明 */}
                  <Divider />
                  <Stack gap="xs">
                    <Text size="sm" fw={600} c="dark.7">
                      {t('loginBenefits')}
                    </Text>
                    <Text size="xs" c="dark.6">{t('loginBenefit1')}</Text>
                    <Text size="xs" c="dark.6">{t('loginBenefit2')}</Text>
                    <Text size="xs" c="dark.6">{t('loginBenefit3')}</Text>
                    <Text size="xs" c="dark.6">{t('loginBenefit4')}</Text>
                  </Stack>
                </Stack>
              </Card>
            ) : (
              /* 未登录状态 */
              <>
                <Card withBorder padding="md" radius="md">
                  <Stack gap="md">
                    <Group gap="sm" align="center">
                      <ThemeIcon size="sm" radius="xl" color="blue" variant="light">
                        <IconLogin size={14} />
                      </ThemeIcon>
                      <Text size="sm" fw={600} c="dark.7">
                        {t('accountLogin')}
                      </Text>
                    </Group>

                    <TextInput
                      label={t('email')}
                      placeholder={t('emailPlaceholder')}
                      value={loginForm.identity}
                      onChange={(e) => setLoginForm({ ...loginForm, identity: e.target.value })}
                      radius="md"
                      styles={{
                        label: {
                          fontSize: '12px',
                          fontWeight: 500,
                          color: 'var(--mantine-color-dark-6)'
                        }
                      }}
                    />
                    
                    <PasswordInput
                      label={t('password')}
                      placeholder={t('passwordPlaceholder')}
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      radius="md"
                      styles={{
                        label: {
                          fontSize: '12px',
                          fontWeight: 500,
                          color: 'var(--mantine-color-dark-6)'
                        }
                      }}
                    />
                    
                    {/* 登录错误提示 */}
                    {loginError && (
                      <Alert
                        icon={<IconX size={16} />}
                        color="red"
                        variant="light"
                        radius="md"
                        styles={{
                          root: {
                            fontSize: '12px'
                          }
                        }}
                      >
                        {loginError}
                      </Alert>
                    )}
                     
                    <Button
                      leftSection={<IconLogin size={16} />}
                      onClick={handleLogin}
                      loading={loading}
                      fullWidth
                      radius="md"
                      size="sm"
                    >
                      {t('login')}
                    </Button>

                    {/* 注册提示 */}
                    <Divider />
                    <Group justify="center">
                      <Button
                        variant="subtle"
                        size="xs"
                        leftSection={<IconExternalLink size={14} />}
                        onClick={handleOpenRegister}
                        color="blue"
                      >
                        {t('registerAtMarkhub')}
                      </Button>
                    </Group>

                    {/* 功能对比说明 */}
                    <Divider />
                    <Stack gap="xs">
                      <Text size="sm" fw={600} c="dark.7">
                        {t('loginBenefits')}
                      </Text>
                      <Text size="xs" c="dark.6">{t('loginBenefit1')}</Text>
                      <Text size="xs" c="dark.6">{t('loginBenefit2')}</Text>
                      <Text size="xs" c="dark.6">{t('loginBenefit3')}</Text>
                      <Text size="xs" c="dark.6">{t('loginBenefit4')}</Text>
                      
                      <Text size="sm" fw={600} c="dark.7" mt="sm">
                        {t('withoutLoginFeatures')}
                      </Text>
                      <Text size="xs" c="dimmed">{t('withoutLoginFeature1')}</Text>
                      <Text size="xs" c="dimmed">{t('withoutLoginFeature2')}</Text>
                      <Text size="xs" c="dimmed">{t('withoutLoginFeature3')}</Text>
                    </Stack>
                  </Stack>
                </Card>
              </>
            )}

            {/* 服务器配置（始终显示） */}
            <Card withBorder padding="md" radius="md">
              <Stack gap="md">
                <Group gap="sm" align="center">
                  <ThemeIcon size="sm" radius="xl" color="gray" variant="light">
                    <IconWifi size={14} />
                  </ThemeIcon>
                  <Text size="sm" fw={600} c="dark.7">
                    {t('serverConfig')}
                  </Text>
                </Group>

                <TextInput
                  label={t('markhubApiUrl')}
                  placeholder={t('markhubApiUrlPlaceholder')}
                  value={config.markhubApiUrl}
                  onChange={(e) => handleConfigChange('markhubApiUrl', e.target.value)}
                  radius="md"
                  styles={{
                    label: {
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--mantine-color-dark-6)'
                    }
                  }}
                />
                
                <TextInput
                  label={t('markhubAppUrl')}
                  placeholder={t('markhubAppUrlPlaceholder')}
                  value={config.markhubAppUrl}
                  onChange={(e) => handleConfigChange('markhubAppUrl', e.target.value)}
                  radius="md"
                  styles={{
                    label: {
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--mantine-color-dark-6)'
                    }
                  }}
                />
              </Stack>
            </Card>
          </Stack>
        </Tabs.Panel>

        {/* AI 服务标签页 */}
        <Tabs.Panel value="ai" pt="md">
          <Stack gap="md">
            <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
              {t('configureAiService')}
            </Alert>
            
            <Card withBorder padding="md" radius="md">
              <Stack gap="md">
                <Group gap="sm" align="center">
                  <ThemeIcon size="sm" radius="xl" color="blue" variant="light">
                    <IconWifi size={14} />
                  </ThemeIcon>
                  <Text size="sm" fw={600} c="dark.7">
                    {t('serviceConfig')}
                  </Text>
                </Group>

                <TextInput
                  label={t('apiUrl')}
                  placeholder={t('apiUrlPlaceholder')}
                  value={config.aiServiceConfig.folderRec.apiUrl}
                  onChange={(e) => handleAIConfigChange('apiUrl', e.target.value)}
                  radius="md"
                  styles={{
                    label: {
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--mantine-color-dark-6)'
                    }
                  }}
                />
                
                <PasswordInput
                  label={t('apiKey')}
                  placeholder={t('apiKeyPlaceholder')}
                  value={config.aiServiceConfig.folderRec.apiKey}
                  onChange={(e) => handleAIConfigChange('apiKey', e.target.value)}
                  radius="md"
                  styles={{
                    label: {
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--mantine-color-dark-6)'
                    }
                  }}
                />
                
                <TextInput
                  label={t('modelName')}
                  placeholder={t('modelNamePlaceholder')}
                  value={config.aiServiceConfig.folderRec.modelName}
                  onChange={(e) => handleAIConfigChange('modelName', e.target.value)}
                  radius="md"
                  styles={{
                    label: {
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--mantine-color-dark-6)'
                    }
                  }}
                />

                <Divider />

                {/* 测试连接部分 */}
                <Stack gap="sm">
                  <Group gap="sm" align="center">
                    <ThemeIcon size="sm" radius="xl" color="green" variant="light">
                      <IconTestPipe size={14} />
                    </ThemeIcon>
                    <Text size="sm" fw={600} c="dark.7">
                      {t('connectionTest')}
                    </Text>
                  </Group>
                  
                  <Text size="xs" c="dimmed">
                    {t('testCurrentConfig')}
                  </Text>
                  
                  <Button
                    leftSection={
                      aiTestLoading ? (
                        <Loader size={16} color="white" />
                      ) : (
                        <IconTestPipe size={16} />
                      )
                    }
                    onClick={handleTestAIService}
                    loading={aiTestLoading}
                    variant="light"
                    color="green"
                    radius="md"
                    size="sm"
                    disabled={!config.aiServiceConfig.folderRec.apiUrl ||
                             !config.aiServiceConfig.folderRec.apiKey ||
                             !config.aiServiceConfig.folderRec.modelName}
                  >
                    {aiTestLoading ? t('testing') : t('testConnection')}
                  </Button>

                  {/* 测试结果显示 */}
                  {aiTestResult && (
                    <Alert
                      color={aiTestResult.success ? "green" : "red"}
                      icon={aiTestResult.success ? <IconCheck size={16} /> : <IconX size={16} />}
                      variant="light"
                      radius="md"
                    >
                      <Stack gap="xs">
                        <Text size="sm" fw={500}>
                          {aiTestResult.success ? t('connectionSuccess') : t('connectionFailed')}
                        </Text>
                        <Text size="xs">
                          {aiTestResult.message}
                        </Text>
                      </Stack>
                    </Alert>
                  )}
                </Stack>
              </Stack>
            </Card>
          </Stack>
        </Tabs.Panel>

        {/* 同步设置标签页 */}
        <Tabs.Panel value="sync" pt="md">
          <Stack gap="md">
            <Switch
              label={t('enableSyncWithMarkhub')}
              description={t('autoSyncDescription')}
              checked={config.syncEnabled}
              onChange={(e) => handleConfigChange('syncEnabled', e.currentTarget.checked)}
            />
            
            <Switch
              label={t('autoMoveToRecommendedFolder')}
              description={t('autoMoveDescription')}
              checked={config.autoMoveToRecommendedFolder}
              onChange={(e) => handleConfigChange('autoMoveToRecommendedFolder', e.currentTarget.checked)}
            />
            
            <Switch
              label={t('showNotifications')}
              description={t('notificationsDescription')}
              checked={config.showNotifications}
              onChange={(e) => handleConfigChange('showNotifications', e.currentTarget.checked)}
            />

            <Divider />

            {/* 手动同步部分 */}
            <Stack gap="sm">
              <Text fw={500}>{t('initialDataSync')}</Text>
              
              {/* 使用场景说明 */}
              <Card withBorder radius="md" p="md" bg="yellow.0">
                <Stack gap="sm">
                  <Group gap="sm" align="center">
                    <ThemeIcon size="sm" radius="xl" color="orange" variant="light">
                      <IconInfoCircle size={14} />
                    </ThemeIcon>
                    <Text size="sm" fw={600} c="dark.7">
                      {t('manualSyncUsageTitle')}
                    </Text>
                  </Group>
                  
                  <Stack gap="xs">
                    <Text size="xs" c="dark.6">
                      • {t('manualSyncUsage1')}
                    </Text>
                    <Text size="xs" c="dark.6">
                      • {t('manualSyncUsage2')}
                    </Text>
                    <Text size="xs" c="dark.6">
                      • {t('manualSyncUsage3')}
                    </Text>
                  </Stack>
                </Stack>
              </Card>

              {/* 同步行为说明 */}
              <Card withBorder radius="md" p="md" bg="blue.0">
                <Stack gap="sm">
                  <Group gap="sm" align="center">
                    <ThemeIcon size="sm" radius="xl" color="blue" variant="light">
                      <IconShield size={14} />
                    </ThemeIcon>
                    <Text size="sm" fw={600} c="dark.7">
                      {t('manualSyncBehaviorTitle')}
                    </Text>
                  </Group>
                  
                  <Stack gap="xs">
                    <Text size="xs" c="dark.6">
                      • {t('manualSyncBehavior1')}
                    </Text>
                    <Text size="xs" c="dark.6">
                      • {t('manualSyncBehavior2')}
                    </Text>
                    <Text size="xs" c="dark.6">
                      • {t('manualSyncBehavior3')}
                    </Text>
                  </Stack>
                </Stack>
              </Card>
              
              <Button
                leftSection={<IconRefresh size={16} />}
                onClick={handleInitialSync}
                loading={syncLoading}
                disabled={!syncManager.isSyncAvailable()}
                variant="light"
                radius="md"
                size="sm"
              >
                {syncLoading ? t('syncing') : t('startInitialSync')}
              </Button>

              {/* 同步结果显示 */}
              {syncResult && (
                <Alert
                  color={syncResult.success ? "green" : "red"}
                  icon={syncResult.success ? <IconCheck size={16} /> : <IconX size={16} />}
                >
                  <Stack gap="xs">
                    <Text size="sm" fw={500}>
                      {syncResult.success ? t('syncCompleted') : t('syncFailed')}
                    </Text>
                    {syncResult.success && (
                      <Text size="xs">
                        {t('syncResultMessage', { folders: syncResult.foldersCreated, bookmarks: syncResult.bookmarksCreated })}
                      </Text>
                    )}
                    {syncResult.errors.length > 0 && (
                      <Stack gap="xs">
                        <Text size="xs" fw={500}>{t('errorDetails')}</Text>
                        {syncResult.errors.slice(0, 3).map((error, index) => (
                          <Text key={index} size="xs" c="red">
                            • {error}
                          </Text>
                        ))}
                        {syncResult.errors.length > 3 && (
                          <Text size="xs" c="dimmed">
                            {t('moreErrors', { count: syncResult.errors.length - 3 })}
                          </Text>
                        )}
                      </Stack>
                    )}
                  </Stack>
                </Alert>
              )}

              {!syncManager.isSyncAvailable() && (
                <Alert color="yellow" icon={<IconInfoCircle size={16} />}>
                  <Text size="sm">
                    {t('loginAndEnableSyncFirst')}
                  </Text>
                </Alert>
              )}
            </Stack>
          </Stack>
        </Tabs.Panel>

        {/* 反向同步标签页 */}
        <Tabs.Panel value="reverse-sync" pt="md">
          <Stack gap="md">
            <Alert
              icon={<IconInfoCircle size={16} />}
              color="blue"
              variant="light"
            >
              {t('reverseSyncDescription')}
            </Alert>

            {/* 同步行为说明 */}
            <Card withBorder radius="md" p="md" bg="gray.0">
              <Stack gap="sm">
                <Group gap="sm" align="center">
                  <ThemeIcon size="sm" radius="xl" color="green" variant="light">
                    <IconShield size={14} />
                  </ThemeIcon>
                  <Text size="sm" fw={600} c="dark.7">
                    {t('syncSafetyTitle')}
                  </Text>
                </Group>
                
                <Stack gap="xs">
                  <Text size="xs" c="dark.6">
                    • {t('syncSafetyPoint1')}
                  </Text>
                  <Text size="xs" c="dark.6">
                    • {t('syncSafetyPoint2')}
                  </Text>
                  <Text size="xs" c="dark.6">
                    • {t('syncSafetyPoint3')}
                  </Text>
                  <Text size="xs" c="dark.6">
                    • {t('syncSafetyPoint4')}
                  </Text>
                </Stack>
              </Stack>
            </Card>

            <Stack gap="sm">
              <Text size="sm" fw={600} c="dark.7">
                {t('reverseSyncFromMarkhub')}
              </Text>
              
              <Button
                leftSection={<IconDownload size={16} />}
                onClick={handleReverseSync}
                loading={reverseSyncLoading}
                disabled={!reverseSyncManager.isReverseSyncAvailable()}
                radius="md"
                size="sm"
              >
                {reverseSyncLoading ? t('reverseSyncing') : t('startReverseSync')}
              </Button>

              {/* 反向同步结果显示 */}
              {reverseSyncResult && (
                <Alert
                  icon={reverseSyncResult.success ? <IconCheck size={16} /> : <IconX size={16} />}
                  color={reverseSyncResult.success ? "green" : "red"}
                  variant="light"
                  radius="md"
                >
                  <Stack gap="xs">
                    <Text size="sm" fw={600}>
                      {reverseSyncResult.success ? t('reverseSyncCompleted') : t('reverseSyncFailed')}
                    </Text>
                    {reverseSyncResult.success && (
                      <Text size="xs">
                        {t('reverseSyncResultMessage', {
                          folders: reverseSyncResult.foldersCreated,
                          created: reverseSyncResult.bookmarksCreated,
                          updated: reverseSyncResult.bookmarksUpdated,
                          skipped: reverseSyncResult.skipped
                        })}
                      </Text>
                    )}
                    {reverseSyncResult.errors.length > 0 && (
                      <Stack gap="xs">
                        <Text size="xs" fw={600}>{t('errorDetails')}</Text>
                        {reverseSyncResult.errors.slice(0, 3).map((error, index) => (
                          <Text key={index} size="xs" c="red.7">• {error}</Text>
                        ))}
                        {reverseSyncResult.errors.length > 3 && (
                          <Text size="xs" c="red.6">{t('moreErrors', { count: reverseSyncResult.errors.length - 3 })}</Text>
                        )}
                      </Stack>
                    )}
                  </Stack>
                </Alert>
              )}

              {/* 未启用同步时的提示 */}
              {!reverseSyncManager.isReverseSyncAvailable() && (
                <Alert color="yellow" icon={<IconInfoCircle size={16} />}>
                  {t('loginAndEnableSyncFirst')}
                </Alert>
              )}
            </Stack>
          </Stack>
        </Tabs.Panel>

        {/* 语言设置标签页 */}
        <Tabs.Panel value="language" pt="md">
          <Stack gap="md">
            <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
              {t('languageSettings')}
            </Alert>

            <Card withBorder radius="md" p="md">
              <Stack gap="md">
                <Text fw={500}>{t('language')}</Text>
                
                <Select
                  value={config.language}
                  onChange={(value) => handleLanguageChange(value as 'auto' | 'en' | 'zh')}
                  data={[
                    { value: 'auto', label: t('languageAuto') },
                    { value: 'en', label: t('languageEnglish') },
                    { value: 'zh', label: t('languageChinese') }
                  ]}
                  placeholder={t('language')}
                />
              </Stack>
            </Card>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {/* 错误和成功消息 */}
      {error && (
        <Alert color="red" mt="md">
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert color="green" mt="md">
          {success}
        </Alert>
      )}

      {/* 底部按钮 */}
      <Group justify="flex-end" mt="xl">
        <Button variant="subtle" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button onClick={handleSaveConfig} loading={loading}>
          {t('saveSettings')}
        </Button>
      </Group>
    </Modal>
  )
}

export default SettingsModal