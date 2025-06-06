'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import * as apiClient from '@/lib/api-client'; // 修改导入方式以使用 apiClient 命名空间
import { UserSetting } from '@/lib/schemas'; // 导入 UserSetting 类型

// PocketBase 用户记录通常包含 id, email, name 等字段
// 为了更强的类型安全，可以定义一个更具体的 User 类型
interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  // 根据你的 PocketBase 'users' collection 实际字段添加更多属性
  [key: string]: any; // 允许其他动态属性
}

const defaultSettings = {
  darkMode: false,
  language: 'en',
  accentColor: '#007bff',
  favoriteFolderIds: [],
  tagList: [],
  sortOption: 'createdAt_desc',
  searchFields: ['title', 'url', 'tags'],
  // WebDAV 默认设置
  webdav_config: {
    Url: '',
    Username: '',
    Password: '',
    Path: '/bookmarks/',
    AutoSync: false
  },
  // Gemini API 默认设置
  geminiApiKey: '',
  geminiApiBaseUrl: '',
  geminiModelName: ''
};

interface AuthContextType {
  user: User | null;
  token: string | null;
  userSettings: UserSetting | null; // 新增
  isLoading: boolean;
  login: (identity: string, password: string) => Promise<void>;
  register: (email: string, password: string, passwordConfirm: string) => Promise<void>;
  logoutAndRedirect: () => void; // Renamed from logout
  updateGlobalSettings: (newSettings: Partial<UserSetting>) => Promise<void>; // 新增
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSetting | null>(null); // 新增
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const logoutAndRedirect = React.useCallback(() => {
    setUser(null);
    setToken(null);
    setUserSettings(null); // 新增：重置用户设置
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser'); // 新增：移除用户对象
    router.push('/login');
  }, [router]);

  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    const storedUserString = localStorage.getItem('authUser');
    let storedUser: User | null = null;

    if (storedUserString) {
      try {
        storedUser = JSON.parse(storedUserString);
      } catch (e) {
        console.error("Failed to parse stored user:", e);
        localStorage.removeItem('authUser'); // 清除损坏的数据
      }
    }

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(storedUser);
      apiClient.getUserSettings(storedToken, storedUser.id)
        .then(settings => {
          if (settings) {
            setUserSettings(settings as UserSetting);
          } else {
            // 如果没有设置，为用户创建默认设置
            console.log(`No settings found for user ${storedUser?.id}, creating default settings.`);
            return apiClient.createUserSettings(storedToken, { ...defaultSettings, userId: storedUser!.id });
          }
        })
        .then(createdSettings => {
          if (createdSettings) {
            setUserSettings(createdSettings as UserSetting);
          }
        })
        .catch(err => {
          console.error('Failed to load or create user settings on init:', err);
          // 根据错误类型处理，例如 token 过期则登出
          // The actual logout is now handled by the 'auth-error' event
        });
    }
    setIsLoading(false);

    // Event listener for auth errors
    const handleAuthError = () => {
      logoutAndRedirect();
    };
    window.addEventListener('auth-error', handleAuthError);

    return () => {
      window.removeEventListener('auth-error', handleAuthError);
    };
  }, [logoutAndRedirect]); // logoutAndRedirect is now defined above and stable

  const login = async (identity: string, password: string) => {
    try {
      const response = await apiClient.loginUser(identity, password);
      if (response.token && response.record) {
        const loggedInUser = response.record as User;
        setToken(response.token);
        setUser(loggedInUser);
        localStorage.setItem('authToken', response.token);
        localStorage.setItem('authUser', JSON.stringify(loggedInUser)); // 存储 User 对象

        // 获取或创建用户设置
        try {
          let settings = await apiClient.getUserSettings(response.token, loggedInUser.id);
          if (!settings) {
            console.log(`No settings found for user ${loggedInUser.id}, creating default settings.`);
            settings = await apiClient.createUserSettings(response.token, { ...defaultSettings, userId: loggedInUser.id });
          }
          setUserSettings(settings as UserSetting);
        } catch (settingsError) {
          console.error('Failed to load or create user settings on login:', settingsError);
          // 即使设置失败，也允许登录，但 userSettings 将为 null
          setUserSettings(null);
        }

        router.push('/'); // 导航到主页面
      } else {
        console.error('Login failed: No token or user record returned.');
        throw new Error('Login failed: Invalid credentials or server error.');
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (email: string, password: string, passwordConfirm: string) => {
    try {
      // 先注册用户
      await apiClient.registerUser(email, password, passwordConfirm);
      console.log('Registration successful. Now logging in automatically...');
      
      // 注册成功后自动登录
      await login(email, password);
      console.log('Auto-login successful. Redirecting to dashboard...');
    } catch (error) {
      console.error('Registration or auto-login error:', error);
      throw error;
    }
  };


  const updateGlobalSettings = async (newSettings: Partial<UserSetting>) => {
    if (!token || !userSettings || !userSettings.id) {
      console.error('Cannot update settings: token or userSettings ID is missing.');
      throw new Error('User not authenticated or settings not loaded.');
    }
    try {
      const updatedSettings = await apiClient.updateUserSettings(token, userSettings.id, newSettings);
      setUserSettings(updatedSettings as UserSetting);
    } catch (error) {
      console.error('Failed to update user settings:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, userSettings, isLoading, login, register, logoutAndRedirect, updateGlobalSettings }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};