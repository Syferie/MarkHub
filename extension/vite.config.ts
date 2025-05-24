import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        popup: './popup/index.html',
        background: './src/background/background.ts',
        content: './src/content/content.ts',
      },
      output: {
        entryFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId
          if (facadeModuleId && facadeModuleId.indexOf('background') !== -1) {
            return 'background.js'
          }
          if (facadeModuleId && facadeModuleId.indexOf('content') !== -1) {
            return 'content.js'
          }
          return '[name].js'
        },
        chunkFileNames: 'chunks/[name].[hash].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
  publicDir: false, // 禁用默认的 public 目录处理
})