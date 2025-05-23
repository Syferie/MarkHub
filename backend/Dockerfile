# 使用Go 1.24 alpine作为基础镜像
FROM golang:1.24-alpine AS base

# 设置工作目录
WORKDIR /app

# 安装必要的系统依赖
RUN apk add --no-cache \
    git \
    ca-certificates \
    tzdata \
    wget

# 依赖阶段
FROM base AS deps

# 复制Go模块文件
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download && go mod verify

# 开发阶段
FROM base AS development
WORKDIR /app

# 从依赖阶段复制依赖
COPY --from=deps /go/pkg /go/pkg

# 复制Go模块文件
COPY go.mod go.sum ./

# 下载依赖（如果有新的依赖）
RUN go mod download

# 复制源代码
COPY . .

# 设置开发环境变量
ENV GO_ENV=development
ENV PB_DATA_DIR=/app/pb_data

# 创建数据目录
RUN mkdir -p /app/pb_data

# 暴露端口
EXPOSE 8090

# 开发模式启动命令（使用go run以支持热重载）
CMD ["go", "run", ".", "serve", "--http=0.0.0.0:8090"]

# 构建阶段
FROM base AS builder
WORKDIR /app

# 从依赖阶段复制依赖
COPY --from=deps /go/pkg /go/pkg

# 复制Go模块文件
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download

# 复制源代码
COPY . .

# 设置构建环境变量
ENV CGO_ENABLED=1
ENV GOOS=linux
ENV GOARCH=amd64

# 构建应用
RUN go build -ldflags="-w -s" -o markhub-backend .

# 生产运行阶段
FROM alpine:latest AS production

# 安装运行时依赖
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    wget

# 设置工作目录
WORKDIR /app

# 创建非root用户
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# 从构建阶段复制二进制文件
COPY --from=builder /app/markhub-backend ./markhub-backend

# 创建数据目录并设置权限
RUN mkdir -p /app/pb_data && \
    chown -R appuser:appgroup /app

# 切换到非root用户
USER appuser

# 设置环境变量
ENV GO_ENV=production
ENV PB_DATA_DIR=/app/pb_data

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8090/api/health || exit 1

# 暴露端口
EXPOSE 8090

# 启动应用
CMD ["./markhub-backend", "serve", "--http=0.0.0.0:8090"]