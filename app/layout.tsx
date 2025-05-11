import type React from "react"
import "@mantine/core/styles.css"
import "./globals.css"
import { MantineProvider, ColorSchemeScript } from "@mantine/core"
import { Inter } from "next/font/google"
import { BookmarkProvider } from "@/context/bookmark-context"

const inter = Inter({ subsets: ["latin"] })

// 简化 metadata，仅保留必要信息
export const metadata = {
  title: "Bookmark Manager",
  description: "A modern bookmark manager for Chrome"
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
          <BookmarkProvider>{children}</BookmarkProvider>
        </MantineProvider>
      </body>
    </html>
  )
}
