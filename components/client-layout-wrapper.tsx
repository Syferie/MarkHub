"use client";

import React, { useContext, useEffect } from 'react';
import { MantineProvider, createTheme } from '@mantine/core';
import { AuthProvider, useAuth } from '../context/auth-context';
import { BookmarkProvider } from '../context/bookmark-context';
import { AIClassificationProvider } from '../context/ai-classification-context';
import FirstVisitHandler from './first-visit-handler';
import LoadingScreen from './loading-screen';
import { LanguageProvider } from '../context/language-context'; // Added
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'; // Added

// 辅助函数，用于从十六进制颜色获取 Mantine 颜色名称（简化版）
// 在实际应用中，您可能需要一个更完善的映射或逻辑
function getColorName(hex: string): string {
  // 这是一个非常简化的示例。
  // Mantine 的 primaryColor 通常期望是 'red', 'blue', 'grape' 等预定义颜色名称。
  // 如果 userSettings.accentColor 是一个任意的十六进制值，
  // 您可能需要将其映射到最接近的 Mantine 颜色，或者调整主题以接受自定义颜色。
  // 为了简单起见，这里返回一个默认值。
  // console.log("getColorName called with:", hex); // 调试用
  const mantineColors = ["dark", "gray", "red", "pink", "grape", "violet", "indigo", "blue", "cyan", "teal", "green", "lime", "yellow", "orange"];
  // 这是一个占位符逻辑，您需要根据您的 userSettings.accentColor 的实际值进行调整
  // 例如，如果 accentColor 是 "grape", "blue" 等，可以直接使用。
  // 如果是 "#RRGGBB" 格式，Mantine 主题可能无法直接使用它作为 primaryColor 名称。
  // 您可能需要将 userSettings.accentColor 存储为 Mantine 颜色名称。
  if (mantineColors.includes(hex)) {
    return hex;
  }
  return 'blue'; // 默认颜色
}

// AppSpecificMantineProvider 包含原先在 app/layout.tsx 中的 Mantine 设置逻辑
const AppSpecificMantineProvider = ({ children }: { children: React.ReactNode }) => {
  const { userSettings, isLoading } = useAuth();
  const { setTheme: setNextTheme } = useTheme(); // Added for next-themes

  // Mantine theme configuration
  const mantineTheme = createTheme({
    primaryColor: userSettings?.accentColor ? getColorName(userSettings.accentColor) : 'blue',
    // You might want to add more theme customizations here if they were in the old AppSpecificMantineProvider
    // For example, the 'brand' color and component styles:
    colors: {
      'brand': [
        userSettings?.accentColor || "#3b82f6", userSettings?.accentColor || "#3b82f6", userSettings?.accentColor || "#3b82f6", userSettings?.accentColor || "#3b82f6",
        userSettings?.accentColor || "#3b82f6", userSettings?.accentColor || "#3b82f6", userSettings?.accentColor || "#3b82f6", userSettings?.accentColor || "#3b82f6",
        userSettings?.accentColor || "#3b82f6", userSettings?.accentColor || "#3b82f6"
      ],
    },
    // components: { ... } // If you had component overrides
  });

  useEffect(() => {
    if (userSettings) {
      // Sync next-themes (html class)
      setNextTheme(userSettings.darkMode ? 'dark' : 'light');
      
      // Apply CSS variables (previously in layout.tsx or AppSpecificMantineProvider)
      // document.documentElement.classList.toggle('dark', userSettings.darkMode); // next-themes handles the class on <html>
      document.documentElement.style.setProperty('--accent-color', userSettings.accentColor || '#3b82f6');
      // ... any other CSS variable logic ...
    }
  }, [userSettings, setNextTheme]);

  if (isLoading && !userSettings) {
    // Render a basic MantineProvider or just children if settings are crucial for theme
    return (
      <MantineProvider theme={createTheme({ primaryColor: 'blue' })} defaultColorScheme="light">
        {children}
      </MantineProvider>
    );
  }

  return (
    <MantineProvider
      theme={mantineTheme}
      forceColorScheme={userSettings?.darkMode ? 'dark' : 'light'}
    >
      {children}
    </MantineProvider>
  );
};

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      <LanguageProvider>
        <AuthProvider>
          <AppSpecificMantineProvider>
            <BookmarkProvider>
              <AIClassificationProvider>
                <FirstVisitHandler>
                  <LoadingScreen />
                  {children}
                </FirstVisitHandler>
              </AIClassificationProvider>
            </BookmarkProvider>
          </AppSpecificMantineProvider>
        </AuthProvider>
      </LanguageProvider>
    </NextThemesProvider>
  );
}