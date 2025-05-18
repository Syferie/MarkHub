# 使用Node.js 22 alpine作为基础镜像，确保使用最新的LTS版本
FROM node:22-alpine AS base

# 设置工作目录
WORKDIR /app

# 安装依赖阶段
FROM base AS deps
# 安装构建工具，用于某些依赖的原生编译
RUN apk add --no-cache libc6-compat

# 复制package.json和pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# 安装依赖 - 使用pnpm以优化依赖树和安装速度
# 使用--frozen-lockfile确保依赖版本一致性
# 使用--prod标志只安装生产依赖，减小体积
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile --prod

# 构建应用阶段
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 设置生产环境变量
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 构建Next.js应用
RUN npm install -g pnpm && \
    pnpm build

# 运行阶段 - 使用最新的Node.js 22 alpine镜像
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 创建非root用户运行应用以增强安全性
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制构建产物和必要文件，确保所有权限正确
COPY --from=builder /app/public ./public
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