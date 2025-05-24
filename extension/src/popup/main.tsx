import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { I18nextProvider } from 'react-i18next'
import '@mantine/core/styles.css'
import App from './App.tsx'
import './index.css'
import i18n from '../i18n'
import { getServiceWorkerConnection } from '../utils/serviceWorkerConnection'

// Mantine 主题配置
const theme = {
  primaryColor: 'blue',
  fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
  },
}

// 初始化 Service Worker 连接
async function initializeServiceWorkerConnection() {
  try {
    console.log('Popup: Initializing Service Worker connection...')
    const swConnection = getServiceWorkerConnection()
    await swConnection.initialize()
    
    // 获取并显示 Service Worker 状态
    const status = await swConnection.getServiceWorkerStatus()
    console.log('Popup: Service Worker status:', status)
    
  } catch (error) {
    console.error('Popup: Failed to initialize Service Worker connection:', error)
  }
}

// 在 popup 打开时立即初始化连接
initializeServiceWorkerConnection()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <MantineProvider theme={theme}>
        <App />
      </MantineProvider>
    </I18nextProvider>
  </React.StrictMode>,
)