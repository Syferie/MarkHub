"use client"

// AppConfig 接口简化，大部分配置已迁移到后端并通过 AuthContext 管理
export interface ClientSideConfig {
  hasLoadedInitialSamples?: boolean; // 标记是否已加载过预置书签数据 (如果此功能保留)
  // 可以根据需要添加其他纯客户端的、非敏感的配置项
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

// saveAppConfig, getAppConfig, 和 migrateConfigFromIndexedDB 函数已移除，
// 因为它们处理的配置项大部分已迁移到后端，
// 并且 migrateConfigFromIndexedDB 依赖于已废弃的 IndexedDB (lib/db.ts)。
// 如果需要存储纯客户端的简单配置（如 hasLoadedInitialSamples），
// 应直接使用通用的 saveConfig 和 getConfig 函数。