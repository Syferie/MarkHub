/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // 添加自定义 headers 配置，移除 browsing-topics
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
          }
        ]
      }
    ];
  },
  webpack: (config, { dev, isServer }) => {
    // 生产环境下的优化
    if (!dev) {
      // 添加缓存组优化
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        chunks: 'all',
        minSize: 20000,
        maxSize: 100000, // 将大模块分割为更小的块
        cacheGroups: {
          ...config.optimization.splitChunks.cacheGroups,
          // 避免大字符串被序列化到同一个缓存组
          bookmarkData: {
            test: /[\\/]context[\\/]bookmark-context\.tsx$/,
            name: 'bookmark-data',
            chunks: 'all',
            priority: 10,
            enforce: true,
          },
          // 分离React相关代码
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            name: 'react',
            chunks: 'all',
            priority: 9,
          },
          // 分离其他大型第三方库
          libs: {
            test: /[\\/]node_modules[\\/]/,
            name: 'libs',
            chunks: 'all',
            priority: 8,
          },
        },
      };

      // 生产环境下启用压缩
      config.optimization.minimize = true;
    }

    return config;
  },

  // 优化构建过程
  experimental: {
    // 改进代码拆分
    optimizePackageImports: ['@mantine/core', '@radix-ui', 'react-hook-form'],
    // 移除optimizeCss配置，因为缺少critters依赖
  },
}

export default nextConfig
