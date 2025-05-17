import type React from "react"
import "@mantine/core/styles.css"
import "./globals.css"
import { MantineProvider } from "@mantine/core"
import { Inter } from "next/font/google"
import { BookmarkProvider } from "@/context/bookmark-context"
import { AIClassificationProvider } from "@/context/ai-classification-context"
import { LanguageProvider } from "@/context/language-context"
import FirstVisitHandler from "@/components/first-visit-handler"

const inter = Inter({ subsets: ["latin"] })

// 扩展 metadata，使用新的图标文件并添加Open Graph协议支持
export const metadata = {
  title: "MarkHub",
  description: "A modern bookmark manager with AI-powered tag generation and folder recommendations",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', sizes: '128x128' }
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '128x128', type: 'image/png' }
    ]
  },
  // Open Graph协议元数据
  openGraph: {
    title: "MarkHub - 现代书签管理应用",
    description: "结合本地存储与云同步功能，通过AI智能标签和文件夹推荐，高效管理您的书签",
    url: "https://markhub.app",
    siteName: "MarkHub",
    images: [
      {
        url: "/og-image.png", // 使用专门为社交媒体分享创建的大尺寸图片
        width: 1200,
        height: 630,
        alt: "MarkHub Logo"
      }
    ],
    locale: "zh_CN",
    type: "website"
  },
  // Twitter卡片元数据
  twitter: {
    card: "summary_large_image",
    title: "MarkHub - Modern Bookmark Manager",
    description: "Efficiently manage your bookmarks with AI-powered tag generation and folder recommendations",
    images: ["/og-image.png"],
    creator: "@markhub_app"
  }
}

// 添加额外的元数据，用于其他平台和搜索引擎
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#3b82f6'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      {/* TODO: Ideally, lang attribute should reflect the current language from context */}
      <head>
        {/* 移除ColorSchemeScript组件，改用Next.js的Script组件 */}
        <link rel="canonical" href="https://markhub.app" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "MarkHub",
              "url": "https://markhub.app",
              "description": "现代书签管理应用，结合本地存储与云同步功能，通过AI智能标签和文件夹推荐，高效管理您的书签",
              "applicationCategory": "Productivity",
              "operatingSystem": "Any",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "screenshot": "https://markhub.app/og-image.png",
              "featureList": "书签管理,文件夹组织,标签分类,AI智能推荐,WebDAV同步,多语言支持"
            })
          }}
        />
      </head>
      <body className={inter.className}>
        <MantineProvider defaultColorScheme="light" theme={{
          components: {
            Modal: {
              styles: {
                content: {
                  '&[dataWithBorder]': {
                    border: '1px solid var(--mantine-color-gray-3)',
                  }
                }
              }
            },
            Button: {
              styles: {
                root: {
                  '&[dataDisabled]': {
                    backgroundColor: 'var(--mantine-color-gray-2)',
                    color: 'var(--mantine-color-gray-5)',
                    borderColor: 'var(--mantine-color-gray-3)',
                    opacity: 0.6
                  }
                }
              }
            },
            ColorInput: {
              styles: {
                dropdown: {
                  backgroundColor: 'var(--mantine-color-body)',
                  borderColor: 'var(--mantine-color-gray-3)'
                },
                preview: {
                  borderColor: 'var(--mantine-color-gray-3)'
                },
                input: {
                  backgroundColor: 'var(--mantine-color-body)',
                  color: 'var(--mantine-color-text)',
                  borderColor: 'var(--mantine-color-gray-3)'
                }
              }
            },
            PasswordInput: {
              styles: {
                input: {
                  backgroundColor: 'var(--mantine-color-body)',
                  color: 'var(--mantine-color-text)',
                  borderColor: 'var(--mantine-color-gray-3)'
                },
                innerInput: {
                  color: 'var(--mantine-color-text)'
                }
              }
            },
            PillsInput: {
              styles: {
                root: {
                  backgroundColor: 'var(--mantine-color-body)',
                  borderColor: 'var(--mantine-color-gray-3)'
                },
                input: {
                  backgroundColor: 'var(--mantine-color-body)',
                  color: 'var(--mantine-color-text)'
                }
              }
            },
            Pill: {
              styles: {
                root: {
                  backgroundColor: '#f1f3f5',
                  color: '#495057',
                  border: 'none'
                },
                remove: {
                  color: '#868e96',
                  '&:hover': {
                    backgroundColor: '#e9ecef'
                  }
                }
              }
            },
            Drawer: {
              styles: {
                content: {
                  backgroundColor: 'var(--mantine-color-body)',
                  color: 'var(--mantine-color-text)',
                  borderColor: 'var(--mantine-color-gray-3)'
                },
                header: {
                  backgroundColor: 'var(--mantine-color-body)',
                  borderBottomColor: 'var(--mantine-color-gray-3)'
                },
                title: {
                  color: 'var(--mantine-color-text)'
                }
              }
            }
          }
        }}>
          <LanguageProvider>
            <BookmarkProvider>
              <AIClassificationProvider>
                <FirstVisitHandler>
                  {children}
                </FirstVisitHandler>
              </AIClassificationProvider>
            </BookmarkProvider>
          </LanguageProvider>
        </MantineProvider>
      </body>
    </html>
  )
}
