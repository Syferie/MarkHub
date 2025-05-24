/**
 * Content Script 国际化工具
 * 由于 content script 运行在网页环境中，不能直接使用 React 的 i18n 库
 * 这个工具提供了一个简单的翻译功能
 */

// 翻译资源
const translations = {
  en: {
    aiClassifying: "AI Classifying...",
    aiClassifyingMessage: "Finding the best folder for your bookmark",
    aiRecommendationFailed: "AI Recommendation Failed",
    aiRecommendationFailedMessage: "Unable to get folder recommendation, please try again later",
    aiRecommendationConfirm: "AI Recommendation Confirmed",
    aiFolderRecommendation: "AI Folder Recommendation",
    alreadyInRecommendedFolder: "「{{title}}」is already in the recommended「{{folder}}」folder",
    suggestMoveToFolder: "Suggest moving「{{title}}」to「{{folder}}」folder",
    confidenceLevel: " (Confidence: {{confidence}}%)",
    autoAgreeIn5Seconds: "Will automatically agree to recommendation in 5 seconds",
    gotIt: "Got it",
    agreeToMove: "Agree to Move",
    keepInPlace: "Keep in Place"
  },
  zh: {
    aiClassifying: "AI 分类中...",
    aiClassifyingMessage: "正在为您的书签推荐最佳文件夹",
    aiRecommendationFailed: "AI 推荐失败",
    aiRecommendationFailedMessage: "无法获取文件夹推荐，请稍后重试",
    aiRecommendationConfirm: "AI 推荐确认",
    aiFolderRecommendation: "AI 文件夹推荐",
    alreadyInRecommendedFolder: "「{{title}}」已在推荐的「{{folder}}」文件夹中",
    suggestMoveToFolder: "建议将「{{title}}」移动到「{{folder}}」文件夹",
    confidenceLevel: " (置信度: {{confidence}}%)",
    autoAgreeIn5Seconds: "5秒后将自动同意推荐",
    gotIt: "知道了",
    agreeToMove: "同意移动",
    keepInPlace: "保持原位"
  }
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

// 从 chrome.storage 获取语言配置
async function getLanguageFromStorage(): Promise<'en' | 'zh'> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const result = await chrome.storage.local.get(['markhub_config'])
      if (result.markhub_config && result.markhub_config.language) {
        if (result.markhub_config.language === 'auto') {
          return detectLanguage()
        }
        return result.markhub_config.language as 'en' | 'zh'
      }
    }
  } catch (error) {
    console.warn('Failed to get language from storage:', error)
  }
  
  return detectLanguage()
}

// 当前语言
let currentLanguage: 'en' | 'zh' = detectLanguage()

// 初始化语言设置
getLanguageFromStorage().then(lang => {
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

// 更新语言（从存储）
export async function updateLanguageFromStorage() {
  const lang = await getLanguageFromStorage()
  currentLanguage = lang
}