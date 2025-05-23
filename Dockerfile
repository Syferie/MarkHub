# MarkHub 多阶段构建 Dockerfile
# 此文件用于构建包含前端和后端的完整应用

# ================================
# 前端构建阶段
# ================================
FROM node:22-alpine AS frontend-base
WORKDIR /app/frontend

# 安装构建工具
RUN apk add --no-cache libc6-compat git

# 复制前端依赖文件
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
COPY frontend/tsconfig.json frontend/next.config.mjs ./

# 安装前端依赖
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile

# 复制前端源代码
COPY frontend/ .

# 构建前端应用
RUN pnpm build

# ================================
# 后端构建阶段
# ================================
FROM golang:1.24-alpine AS backend-base
WORKDIR /app/backend

# 安装构建工具
RUN apk add --no-cache git ca-certificates tzdata

# 复制后端依赖文件
COPY backend/go.mod backend/go.sum ./

# 下载后端依赖
RUN go mod download && go mod verify

# 复制后端源代码
COPY backend/ .

# 构建后端应用
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o markhub-backend .

# ================================
# 最终运行阶段
# ================================
FROM alpine:latest AS production

# 安装运行时依赖
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    wget \
    nodejs \
    npm

# 创建应用目录
WORKDIR /app

# 创建非root用户
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# 安装pnpm
RUN npm install -g pnpm

# 复制前端构建产物
COPY --from=frontend-base --chown=appuser:appgroup /app/frontend/.next ./frontend/.next
COPY --from=frontend-base --chown=appuser:appgroup /app/frontend/public ./frontend/public
COPY --from=frontend-base --chown=appuser:appgroup /app/frontend/node_modules ./frontend/node_modules
COPY --from=frontend-base --chown=appuser:appgroup /app/frontend/package.json ./frontend/package.json

# 复制后端二进制文件
COPY --from=backend-base --chown=appuser:appgroup /app/backend/markhub-backend ./backend/markhub-backend

# 创建数据目录
RUN mkdir -p /app/backend/pb_data && \
    chown -R appuser:appgroup /app

# 切换到非root用户
USER appuser

# 设置环境变量
ENV NODE_ENV=production
ENV GO_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PB_DATA_DIR=/app/backend/pb_data
ENV NEXT_PUBLIC_API_BASE_URL=http://localhost:8090

# 暴露端口
EXPOSE 3000 8090

# 复制启动脚本
COPY --chown=appuser:appgroup start.sh /app/start.sh

# 设置启动脚本权限
USER root
RUN chmod +x /app/start.sh
USER appuser

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ && \
        wget --no-verbose --tries=1 --spider http://localhost:8090/api/health || exit 1

# 启动应用
CMD ["/app/start.sh"]