# 使用Node.js 22 alpine作为基础镜像
FROM node:22-alpine AS base

# 设置工作目录
WORKDIR /app

# 安装依赖阶段
FROM base AS deps
# 安装构建工具和git（有些包可能需要git）
RUN apk add --no-cache libc6-compat git

# 复制包管理和配置文件
COPY package.json pnpm-lock.yaml* ./
COPY tsconfig.json next.config.mjs ./

# 安装全部依赖（包括开发依赖）
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile

# 构建应用阶段
FROM base AS builder
WORKDIR /app

# 从依赖阶段复制依赖
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/tsconfig.json ./tsconfig.json
COPY --from=deps /app/next.config.mjs ./next.config.mjs

# 复制所有源代码
COPY . .

# 设置生产环境变量
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 构建Next.js应用
RUN npm install -g pnpm && \
    pnpm build

# 运行阶段
FROM base AS runner
WORKDIR /app

# 设置环境变量
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 创建非root用户运行应用以增强安全性
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制构建产物和必要文件
COPY --from=builder /app/public ./public

# 复制独立输出和静态文件
# 确保权限正确
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 切换到非root用户
USER nextjs

# 设置环境变量
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# 暴露应用端口
EXPOSE 3000

# 启动应用
CMD ["node", "server.js"]