import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { I18nextProvider } from 'react-i18next'
import '@mantine/core/styles.css'
import App from './App.tsx'
import './index.css'
import i18n from '../i18n'

// Mantine 主题配置
const theme = {
  primaryColor: 'blue',
  fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
  },
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <MantineProvider theme={theme}>
        <App />
      </MantineProvider>
    </I18nextProvider>
  </React.StrictMode>,
)