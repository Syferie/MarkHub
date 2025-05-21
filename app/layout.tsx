import type React from "react";
import "@mantine/core/styles.css";
import "./globals.css";
import { ColorSchemeScript } from "@mantine/core"; // Keep for server-side rendering of color scheme
import ClientLayoutWrapper from "@/components/client-layout-wrapper"; // Import the new wrapper
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ["latin"] });

// Metadata and Viewport are server-side, so they remain here.
// Uncommenting metadata as per instructions.
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
  openGraph: {
    url: "https://markhub.app",
    type: "website",
    title: "MarkHub",
    description: "A modern bookmark manager with AI-powered tag generation and folder recommendations",
    siteName: "MarkHub",
    images: [
      {
        url: "https://s2.loli.net/2025/05/17/DkOxnl49tdqIGXy.png", // Replace with your actual OG image URL
        width: 1200,
        height: 630,
        alt: "MarkHub Logo"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    domain: "markhub.app",
    url: "https://markhub.app",
    title: "MarkHub",
    description: "A modern bookmark manager with AI-powered tag generation and folder recommendations",
    images: ["https://s2.loli.net/2025/05/17/DkOxnl49tdqIGXy.png"] // Replace with your actual Twitter image URL
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // themeColor can be set dynamically on the client if needed,
  // or define static ones here if applicable.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
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
              "screenshot": "https://markhub.app/og-image.png", // Replace with your actual screenshot URL
              "featureList": "书签管理,文件夹组织,标签分类,AI智能推荐,WebDAV同步,多语言支持",
              "license": "https://creativecommons.org/licenses/by-nc/4.0/"
            })
          }}
        />
        <meta name="copyright" content="© 2024 MarkHub. Licensed under CC BY-NC 4.0." />
      </head>
      <body className={inter.className}>
        <ClientLayoutWrapper>{children}</ClientLayoutWrapper>
      </body>
    </html>
  );
}
