"use client"

// 配置类型定义，合并了应用设置和WebDAV配置
export interface AppConfig {
  // 应用设置
  darkMode?: boolean;
  accentColor?: string;
  defaultView?: string;
  language?: string;
  geminiApiKey?: string;
  geminiApiBaseUrl?: string;
  geminiModelName?: string;
  
  // WebDAV配置
  webdav_serverUrl?: string;
  webdav_username?: string;
  webdav_password?: string;
  webdav_storagePath?: string;
  webdav_autoSync?: boolean;
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
 * 保存完整的应用配置
 * @param config 应用配置对象
 */
export function saveAppConfig(config: AppConfig): void {
  try {
    // 保存基本设置
    const appSettings = {
      darkMode: config.darkMode,
      accentColor: config.accentColor,
      defaultView: config.defaultView,
      language: config.language,
      geminiApiKey: config.geminiApiKey,
      geminiApiBaseUrl: config.geminiApiBaseUrl,
      geminiModelName: config.geminiModelName
    };
    saveConfig('appSettings', appSettings);
    
    // 如果存在WebDAV配置，单独保存
    if (config.webdav_serverUrl !== undefined) {
      const webdavConfig = {
        serverUrl: config.webdav_serverUrl,
        username: config.webdav_username,
        password: config.webdav_password,
        storagePath: config.webdav_storagePath,
        autoSync: config.webdav_autoSync
      };
      saveConfig('webdavConfig', webdavConfig);
    }
    
    console.log('完整应用配置已保存到localStorage');
  } catch (error) {
    console.error('保存应用配置失败:', error);
  }
}

/**
 * 获取完整的应用配置
 * @returns 合并后的应用配置对象
 */
export function getAppConfig(): AppConfig {
  try {
    // 获取基本设置
    const appSettings = getConfig<AppConfig>('appSettings', {
      darkMode: false,
      accentColor: "#3b82f6",
      defaultView: "all",
      language: "en"
    });
    
    // 获取WebDAV配置
    const webdavConfig = getConfig<{
      serverUrl?: string;
      username?: string;
      password?: string;
      storagePath?: string;
      autoSync?: boolean;
    }>('webdavConfig', {
      serverUrl: "",
      username: "",
      password: "",
      storagePath: "/bookmarks/",
      autoSync: false
    });
    
    // 合并配置并返回
    return {
      ...appSettings,
      webdav_serverUrl: webdavConfig?.serverUrl,
      webdav_username: webdavConfig?.username,
      webdav_password: webdavConfig?.password,
      webdav_storagePath: webdavConfig?.storagePath,
      webdav_autoSync: webdavConfig?.autoSync
    };
  } catch (error) {
    console.error('获取应用配置失败:', error);
    return {
      darkMode: false,
      accentColor: "#3b82f6",
      defaultView: "all",
      language: "en"
    };
  }
}

/**
 * 从IndexedDB迁移配置到localStorage。
 * 此函数应该是幂等的，并且在迁移完成后设置标志并清除源数据。
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
    console.log('开始从IndexedDB迁移配置到localStorage...');
    let migrationPerformed = false;

    // 尝试从IndexedDB获取应用设置
    const appSettings = await db.getAppSettings();
    if (appSettings && Object.keys(appSettings).length > 0) {
      console.log('从IndexedDB获取到应用设置:', {
        ...appSettings,
        geminiApiKey: appSettings.geminiApiKey ? '******' : undefined
      });
      saveConfig('appSettings', appSettings);
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

    // 尝试从IndexedDB获取WebDAV配置
    try {
      const dbConn = await db.openDB();
      const tx = dbConn.transaction([db.STORES.APP_SETTINGS], 'readwrite'); // 使用读写事务以便后续删除
      const store = tx.objectStore(db.STORES.APP_SETTINGS);
      const request = store.get("webdav_config");
      
      const result: { key: string; value: any } | undefined = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      if (result && result.value) {
        console.log('从IndexedDB获取到WebDAV配置:', {
          ...result.value,
          password: result.value.password ? '******' : undefined
        });
        saveConfig('webdavConfig', result.value);
        migrationPerformed = true;

        // 从IndexedDB删除webdav_config
        await store.delete('webdav_config');
        console.log('已从IndexedDB删除旧的WebDAV配置 (key: webdav_config)');
      }
    } catch (e) {
      console.error('从IndexedDB迁移WebDAV配置失败:', e);
    }
    
    if (migrationPerformed) {
      console.log('配置已成功从IndexedDB迁移到localStorage');
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

/**
 * 获取WebDAV配置
 * @returns WebDAV配置对象
 */
export function getWebDAVConfig() {
  const webdavConfig = getConfig<{
    serverUrl: string;
    username: string;
    password: string;
    storagePath: string;
    autoSync: boolean;
  }>('webdavConfig', {
    serverUrl: "",
    username: "",
    password: "",
    storagePath: "/bookmarks/",
    autoSync: false
  });
  
  return webdavConfig;
}

/**
 * 保存WebDAV配置
 * @param config WebDAV配置对象
 */
export function saveWebDAVConfig(config: {
  serverUrl: string;
  username: string;
  password: string;
  storagePath: string;
  autoSync: boolean;
}): void {
  saveConfig('webdavConfig', config);
}

/**
 * 获取Gemini API配置
 * @returns Gemini API配置对象
 */
export function getGeminiAPIConfig() {
  const appSettings = getConfig<AppConfig>('appSettings', {});
  
  return {
    geminiApiKey: appSettings?.geminiApiKey || "",
    geminiApiBaseUrl: appSettings?.geminiApiBaseUrl || "",
    geminiModelName: appSettings?.geminiModelName || ""
  };
}