import type React from "react"
import "@mantine/core/styles.css"
import "./globals.css"
import { MantineProvider } from "@mantine/core"
import { Inter } from "next/font/google"
import { BookmarkProvider } from "@/context/bookmark-context"
import { AIClassificationProvider } from "@/context/ai-classification-context"

const inter = Inter({ subsets: ["latin"] })

// 扩展 metadata，使用新的图标文件
export const metadata = {
  title: "MarkHub",
  description: "A modern bookmark manager for Chrome",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', sizes: '128x128' }
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '128x128', type: 'image/png' }
    ]
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // 将 light 模式硬编码到 HTML 元素，确保服务器和客户端一致
  return (
    <html lang="en" data-mantine-color-scheme="light">
      <head>
        {/* 由于我们直接在 html 标签上设置了 data-mantine-color-scheme，这里不再需要 ColorSchemeScript */}
      </head>
      <body className={inter.className}>
        {/* 只使用 defaultColorScheme，确保与 HTML 属性一致 */}
        <MantineProvider defaultColorScheme="light">
          <BookmarkProvider>
            <AIClassificationProvider>
              {children}
            </AIClassificationProvider>
          </BookmarkProvider>
        </MantineProvider>
      </body>
    </html>
  )
}
