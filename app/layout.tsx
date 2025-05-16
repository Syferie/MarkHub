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
  return (
    <html lang="en">
      <head>
        {/* 移除ColorSchemeScript组件，改用Next.js的Script组件 */}
      </head>
      <body className={inter.className}>
        <MantineProvider defaultColorScheme="light" theme={{
          components: {
            Modal: {
              styles: {
                content: {
                  '&[data-with-border="true"]': {
                    border: '1px solid var(--mantine-color-gray-3)',
                  }
                }
              }
            },
            Button: {
              styles: {
                root: {
                  '&[data-disabled="true"]': {
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
                  backgroundColor: 'var(--mantine-color-dark-5)',
                  color: 'var(--mantine-color-text)'
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
