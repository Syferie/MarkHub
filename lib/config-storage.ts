"use client"

// 简化后的配置类型定义，移除了已迁移到后端的 WebDAV 和 Gemini API 配置
export interface AppConfig {
  // 应用设置
  darkMode?: boolean;
  accentColor?: string;
  defaultView?: string;
  language?: string;
  hasLoadedInitialSamples?: boolean; // 是否已加载过预置书签数据
}

// 配置键名前缀，防止命名冲突
const CONFIG_PREFIX = 'markhub_config_';

/**
 * 保存配置项到localStorage
 * @param key 配置键名
 * @param value 配置值
 */
export function saveConfig<T>(key: string, value: T): void {
  try {
    const prefixedKey = CONFIG_PREFIX + key;
    localStorage.setItem(prefixedKey, JSON.stringify(value));
    console.log(`配置 ${key} 已保存到localStorage`, value);
  } catch (error) {
    console.error(`保存配置 ${key} 失败:`, error);
  }
}

/**
 * 从localStorage获取配置项
 * @param key 配置键名
 * @param defaultValue 默认值
 * @returns 配置值或默认值
 */
export function getConfig<T>(key: string, defaultValue?: T): T | undefined {
  try {
    const prefixedKey = CONFIG_PREFIX + key;
    const storedValue = localStorage.getItem(prefixedKey);
    if (storedValue === null) {
      return defaultValue;
    }
    return JSON.parse(storedValue) as T;
  } catch (error) {
    console.error(`读取配置 ${key} 失败:`, error);
    return defaultValue;
  }
}

/**
 * 删除localStorage中的配置项
 * @param key 配置键名
 */
export function removeConfig(key: string): void {
  try {
    const prefixedKey = CONFIG_PREFIX + key;
    localStorage.removeItem(prefixedKey);
    console.log(`配置 ${key} 已从localStorage中删除`);
  } catch (error) {
    console.error(`删除配置 ${key} 失败:`, error);
  }
}

/**
 * 保存基本的应用配置
 * @param config 应用配置对象
 */
export function saveAppConfig(config: AppConfig): void {
  try {
    // 只保存基本设置
    const appSettings = {
      darkMode: config.darkMode,
      accentColor: config.accentColor,
      defaultView: config.defaultView,
      language: config.language,
    };
    saveConfig('appSettings', appSettings);
    
    console.log('基本应用配置已保存到localStorage');
  } catch (error) {
    console.error('保存应用配置失败:', error);
  }
}

/**
 * 获取基本的应用配置
 * @returns 应用配置对象
 */
export function getAppConfig(): AppConfig {
  try {
    // 获取基本设置
    const appSettings = getConfig<AppConfig>('appSettings', {
      darkMode: false,
      accentColor: "#3b82f6",
      defaultView: "all",
      language: "en",
      hasLoadedInitialSamples: false
    });
    
    return appSettings || {
      darkMode: false,
      accentColor: "#3b82f6",
      defaultView: "all",
      language: "en",
      hasLoadedInitialSamples: false
    };
  } catch (error) {
    console.error('获取应用配置失败:', error);
    return {
      darkMode: false,
      accentColor: "#3b82f6",
      defaultView: "all",
      language: "en",
      hasLoadedInitialSamples: false
    };
  }
}

/**
 * 从IndexedDB迁移配置到localStorage
 * 此函数已废弃但保留以便兼容，现在只迁移核心应用设置而不包括WebDAV和Gemini设置
 * @param db IndexedDB工具实例
 */
export async function migrateConfigFromIndexedDB(db: any): Promise<boolean> {
  const MIGRATION_FLAG_KEY = CONFIG_PREFIX + 'indexeddb_config_migrated';

  // 检查迁移标志，如果已迁移，则不执行任何操作
  if (localStorage.getItem(MIGRATION_FLAG_KEY) === 'true') {
    console.log('配置已从IndexedDB迁移，跳过迁移过程。');
    return false; // 返回false表示未执行新的迁移
  }

  try {
    console.log('开始从IndexedDB迁移基本配置到localStorage...');
    let migrationPerformed = false;

    // 尝试从IndexedDB获取应用设置
    const appSettings = await db.getAppSettings();
    if (appSettings && Object.keys(appSettings).length > 0) {
      // 只提取核心应用设置
      const coreSettings = {
        darkMode: appSettings.darkMode,
        accentColor: appSettings.accentColor,
        defaultView: appSettings.defaultView,
        language: appSettings.language,
        hasLoadedInitialSamples: appSettings.hasLoadedInitialSamples
      };

      console.log('从IndexedDB获取到基本应用设置:', coreSettings);
      saveConfig('appSettings', coreSettings);
      migrationPerformed = true;

      // 从IndexedDB删除appSettings (通常appSettings存储在'settings'键下)
      try {
        const dbConn = await db.openDB();
        const tx = dbConn.transaction([db.STORES.APP_SETTINGS], 'readwrite');
        const store = tx.objectStore(db.STORES.APP_SETTINGS);
        await store.delete('settings'); // 假设应用设置的键是 'settings'
        console.log('已从IndexedDB删除旧的应用设置 (key: settings)');
      } catch (delError) {
        console.error('从IndexedDB删除旧的应用设置失败:', delError);
      }
    }
    
    if (migrationPerformed) {
      console.log('基本配置已成功从IndexedDB迁移到localStorage');
      localStorage.setItem(MIGRATION_FLAG_KEY, 'true'); // 设置迁移完成标志
      return true; // 返回true表示执行了迁移
    } else {
      console.log('在IndexedDB中未找到需要迁移的配置数据。');
      localStorage.setItem(MIGRATION_FLAG_KEY, 'true'); // 也设置标志，避免不必要的检查
      return false;
    }

  } catch (error) {
    console.error('配置迁移失败:', error);
    return false;
  }
}