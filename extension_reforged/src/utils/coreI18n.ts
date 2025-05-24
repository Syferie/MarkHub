/**
 * Core 模块国际化工具
 * 用于在非 React 环境中（如 background script、core 模块）使用翻译
 */

import enTranslations from '../locales/en/translation.json'
import zhTranslations from '../locales/zh/translation.json'

// 翻译资源
const translations = {
  en: enTranslations,
  zh: zhTranslations
}

// 检测浏览器语言
function detectLanguage(): 'en' | 'zh' {
  try {
    // 优先使用 Chrome 扩展 API
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
      const chromeLanguage = chrome.i18n.getUILanguage()
      if (chromeLanguage.startsWith('zh')) {
        return 'zh'
      }
    } else if (typeof navigator !== 'undefined' && navigator.language) {
      // 备用方案：使用 navigator.language
      const navLanguage = navigator.language
      if (navLanguage.startsWith('zh')) {
        return 'zh'
      }
    }
  } catch (error) {
    console.warn('Failed to detect browser language:', error)
  }
  
  return 'en' // 默认英文
}

// 根据配置获取语言
async function getLanguageFromConfig(): Promise<'en' | 'zh'> {
  try {
    // 动态导入 ConfigManager 以避免循环依赖
    const { getConfigManager } = await import('../core/ConfigManager')
    const configManager = getConfigManager()
    
    if (configManager.isReady()) {
      const config = configManager.getConfigSync()
      if (config.language === 'auto') {
        return detectLanguage()
      }
      return config.language as 'en' | 'zh'
    }
  } catch (error) {
    console.warn('Failed to get language from config:', error)
  }
  
  return detectLanguage()
}

// 当前语言
let currentLanguage: 'en' | 'zh' = detectLanguage()

// 初始化语言设置
getLanguageFromConfig().then(lang => {
  currentLanguage = lang
}).catch(() => {
  // 如果获取配置失败，使用检测到的语言
  currentLanguage = detectLanguage()
})

// 翻译函数
export function t(key: string, params?: Record<string, string | number>): string {
  const translation = translations[currentLanguage]?.[key as keyof typeof translations['en']] || key
  
  if (!params) {
    return translation
  }
  
  // 简单的参数替换
  return translation.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
    return params[paramKey]?.toString() || match
  })
}

// 设置语言
export function setLanguage(lang: 'en' | 'zh') {
  currentLanguage = lang
}

// 获取当前语言
export function getCurrentLanguage(): 'en' | 'zh' {
  return currentLanguage
}

// 更新语言（从配置）
export async function updateLanguageFromConfig() {
  const lang = await getLanguageFromConfig()
  currentLanguage = lang
}