/**
 * MarkHub Chrome Sync - 配置管理模块
 * 
 * 该模块负责:
 * 1. 提供默认配置
 * 2. 从chrome.storage.local加载配置
 * 3. 保存配置到chrome.storage.local
 */

// 配置存储的键名
const CONFIG_STORAGE_KEY = 'markhub_extension_config';

/**
 * 默认配置
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  apiKey: '',
  apiBaseUrl: 'https://api.openai.com/v1',
  modelName: 'gpt-3.5-turbo',
  markhubAppUrl: 'https://markhub.app',
  syncEnabled: false
};

/**
 * 获取扩展配置
 * 如果存储中没有配置，返回默认配置
 * 
 * @returns {Promise<Object>} 配置对象
 */
async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONFIG_STORAGE_KEY], (result) => {
      // 如果没有保存的配置或者配置不完整，使用默认配置填充
      const savedConfig = result[CONFIG_STORAGE_KEY] || {};
      const config = { ...DEFAULT_CONFIG, ...savedConfig };
      resolve(config);
    });
  });
}

/**
 * 保存扩展配置
 * 
 * @param {Object} config 要保存的配置对象
 * @returns {Promise<void>}
 */
async function saveConfig(config) {
  return new Promise((resolve) => {
    // 确保至少包含必须的字段
    const validatedConfig = {
      apiKey: config.apiKey || DEFAULT_CONFIG.apiKey,
      syncEnabled: typeof config.syncEnabled === 'boolean' ? config.syncEnabled : DEFAULT_CONFIG.syncEnabled,
      // 可选字段，如果提供则使用，否则使用默认值
      apiBaseUrl: config.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl,
      modelName: config.modelName || DEFAULT_CONFIG.modelName,
      markhubAppUrl: config.markhubAppUrl || DEFAULT_CONFIG.markhubAppUrl
    };

    chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: validatedConfig }, () => {
      resolve();
    });
  });
}

/**
 * 重置配置为默认值
 * 
 * @returns {Promise<void>}
 */
async function resetConfig() {
  return saveConfig(DEFAULT_CONFIG);
}

// 导出模块函数和常量
export {
  DEFAULT_CONFIG,
  getConfig,
  saveConfig,
  resetConfig
};