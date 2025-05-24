/**
 * Chrome Extension API 类型声明
 * 确保 TypeScript 能正确识别 Chrome API
 */

/// <reference types="chrome"/>

declare global {
  const chrome: typeof chrome;
}

export {};