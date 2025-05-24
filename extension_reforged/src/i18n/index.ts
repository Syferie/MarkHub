import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// 导入翻译资源
import enTranslation from '../locales/en/translation.json'
import zhTranslation from '../locales/zh/translation.json'

// 检测浏览器语言
const detectBrowserLanguage = (): string => {
  let language = 'en' // 默认语言

  try {
    // 优先使用 Chrome 扩展 API
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
      const chromeLanguage = chrome.i18n.getUILanguage()
      if (chromeLanguage.startsWith('zh')) {
        language = 'zh'
      }
    } else if (typeof navigator !== 'undefined' && navigator.language) {
      // 备用方案：使用 navigator.language
      const navLanguage = navigator.language
      if (navLanguage.startsWith('zh')) {
        language = 'zh'
      }
    }
  } catch (error) {
    console.warn('Failed to detect browser language:', error)
  }

  return language
}

// 同步获取语言配置
function getLanguageFromConfigSync(): string {
  try {
    // 尝试从 localStorage 获取配置（同步方式）
    const configStr = localStorage.getItem('markhub_config')
    if (configStr) {
      const config = JSON.parse(configStr)
      if (config.language) {
        if (config.language === 'auto') {
          return detectBrowserLanguage()
        }
        return config.language
      }
    }
  } catch (error) {
    console.warn('Failed to get language from config:', error)
  }
  
  return detectBrowserLanguage()
}

// 初始化 i18n（同步方式）
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslation
      },
      zh: {
        translation: zhTranslation
      }
    },
    lng: getLanguageFromConfigSync(), // 同步获取语言
    fallbackLng: 'en', // 回退语言
    interpolation: {
      escapeValue: false // React 已经默认转义
    },
    debug: false // 生产环境关闭调试
  })

// 更新语言
export async function changeLanguage(language: 'auto' | 'en' | 'zh') {
  const actualLanguage = language === 'auto' ? detectBrowserLanguage() : language
  await i18n.changeLanguage(actualLanguage)
  
  // 同时更新到 localStorage
  try {
    const configStr = localStorage.getItem('markhub_config')
    const config = configStr ? JSON.parse(configStr) : {}
    config.language = language
    localStorage.setItem('markhub_config', JSON.stringify(config))
  } catch (error) {
    console.warn('Failed to save language to localStorage:', error)
  }
}

export default i18n