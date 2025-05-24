/**
 * Markhub Chrome Extension - 配置管理模块
 * 
 * 该模块负责:
 * 1. 提供默认配置
 * 2. 从 chrome.storage.local 加载配置
 * 3. 保存配置到 chrome.storage.local
 * 4. 配置变更监听
 */

// 配置存储的键名
const CONFIG_STORAGE_KEY = 'markhub_extension_config';

/**
 * 插件配置接口
 */
export interface PluginConfig {
  // Markhub API 配置
  markhubApiUrl: string;
  markhubAppUrl: string;
  authToken: string;
  
  // AI 服务配置 (用于文件夹推荐)
  aiServiceConfig: {
    folderRec: {
      apiUrl: string;
      apiKey: string;
      modelName: string;
    };
  };
  
  // 同步配置
  syncEnabled: boolean;
  
  // 其他设置
  autoMoveToRecommendedFolder: boolean;
  showNotifications: boolean;
  
  // 语言设置
  language: 'auto' | 'en' | 'zh';
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: PluginConfig = {
  markhubApiUrl: 'https://db.markhub.app',
  markhubAppUrl: 'https://markhub.app/',
  authToken: '',
  aiServiceConfig: {
    folderRec: {
      apiUrl: 'https://api.openai.com/v1',
      apiKey: '',
      modelName: 'gpt-3.5-turbo',
    },
  },
  syncEnabled: false,
  autoMoveToRecommendedFolder: true,
  showNotifications: true,
  language: 'auto',
};

/**
 * 配置管理器类
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: PluginConfig;
  private listeners: Array<(config: PluginConfig) => void> = [];
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * 获取配置管理器单例
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * 初始化配置管理器
   * 从存储中加载配置
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    this.initializationPromise = this.loadConfig().then(() => {
      this.isInitialized = true;
      console.log('ConfigManager: Initialized successfully');
    });
    
    return this.initializationPromise;
  }

  /**
   * 确保配置已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * 获取当前配置
   */
  public async getConfig(): Promise<PluginConfig> {
    await this.ensureInitialized();
    return { ...this.config };
  }

  /**
   * 同步获取当前配置（仅在确保已初始化后使用）
   */
  public getConfigSync(): PluginConfig {
    if (!this.isInitialized) {
      console.warn('ConfigManager: getConfigSync called before initialization, returning default config');
      return { ...DEFAULT_CONFIG };
    }
    return { ...this.config };
  }

  /**
   * 获取特定配置项
   */
  public async get<K extends keyof PluginConfig>(key: K): Promise<PluginConfig[K]> {
    await this.ensureInitialized();
    return this.config[key];
  }

  /**
   * 同步获取特定配置项（仅在确保已初始化后使用）
   */
  public getSync<K extends keyof PluginConfig>(key: K): PluginConfig[K] {
    if (!this.isInitialized) {
      console.warn('ConfigManager: getSync called before initialization, returning default value');
      return DEFAULT_CONFIG[key];
    }
    return this.config[key];
  }

  /**
   * 更新配置
   */
  public async updateConfig(updates: Partial<PluginConfig>): Promise<void> {
    await this.ensureInitialized();
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
    this.notifyListeners();
  }

  /**
   * 更新特定配置项
   */
  public async set<K extends keyof PluginConfig>(
    key: K,
    value: PluginConfig[K]
  ): Promise<void> {
    await this.ensureInitialized();
    this.config[key] = value;
    await this.saveConfig();
    this.notifyListeners();
  }

  /**
   * 重置配置为默认值
   */
  public async resetConfig(): Promise<void> {
    await this.ensureInitialized();
    this.config = { ...DEFAULT_CONFIG };
    await this.saveConfig();
    this.notifyListeners();
  }

  /**
   * 检查是否已初始化
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * 添加配置变更监听器
   */
  public addListener(listener: (config: PluginConfig) => void): void {
    this.listeners.push(listener);
  }

  /**
   * 移除配置变更监听器
   */
  public removeListener(listener: (config: PluginConfig) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 从 chrome.storage.local 加载配置
   */
  private async loadConfig(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get([CONFIG_STORAGE_KEY], (result) => {
        const savedConfig = result[CONFIG_STORAGE_KEY] || {};
        // 合并默认配置和保存的配置，确保所有必需字段都存在
        this.config = this.mergeConfigs(DEFAULT_CONFIG, savedConfig);
        resolve();
      });
    });
  }

  /**
   * 保存配置到 chrome.storage.local
   */
  private async saveConfig(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: this.config }, () => {
        resolve();
      });
    });
  }

  /**
   * 深度合并配置对象
   */
  private mergeConfigs(defaultConfig: PluginConfig, savedConfig: any): PluginConfig {
    const merged = { ...defaultConfig };
    
    for (const key in savedConfig) {
      if (key in defaultConfig) {
        const defaultValue = defaultConfig[key as keyof PluginConfig];
        const savedValue = savedConfig[key];
        
        if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
          // 递归合并对象，确保深层嵌套对象也被正确合并
          (merged as any)[key] = this.deepMerge(defaultValue, savedValue || {});
        } else {
          // 直接赋值基本类型
          (merged as any)[key] = savedValue;
        }
      }
    }
    
    return merged;
  }

  /**
   * 深度合并两个对象
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        // 如果目标对象中也有这个键且是对象，则递归合并
        if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
          result[key] = this.deepMerge(result[key], source[key]);
        } else {
          // 否则直接使用源对象的值
          result[key] = { ...source[key] };
        }
      } else {
        // 基本类型直接赋值
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * 通知所有监听器配置已变更
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getConfigSync());
      } catch (error) {
        console.error('Error in config listener:', error);
      }
    });
  }
}

// 导出默认配置和工厂函数
export { DEFAULT_CONFIG };
export const getConfigManager = () => ConfigManager.getInstance();