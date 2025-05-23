#!/bin/sh

# MarkHub 应用启动脚本
# 用于同时启动前端和后端服务

echo "Starting MarkHub application..."

# 启动后端服务
echo "Starting backend service..."
cd /app/backend
./markhub-backend serve --http=0.0.0.0:8090 &
BACKEND_PID=$!

# 等待后端启动
echo "Waiting for backend to start..."
sleep 10

# 检查后端是否启动成功
if ! wget --no-verbose --tries=1 --spider http://localhost:8090/api/health 2>/dev/null; then
    echo "Backend failed to start, exiting..."
    exit 1
fi

echo "Backend started successfully"

# 启动前端服务
echo "Starting frontend service..."
cd /app/frontend
pnpm start &
FRONTEND_PID=$!

# 等待前端启动
echo "Waiting for frontend to start..."
sleep 15

# 检查前端是否启动成功
if ! wget --no-verbose --tries=1 --spider http://localhost:3000/ 2>/dev/null; then
    echo "Frontend failed to start, exiting..."
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "Frontend started successfully"
echo "MarkHub application is ready!"
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:8090"

# 定义清理函数
cleanup() {
    echo "Shutting down MarkHub application..."
    kill $FRONTEND_PID 2>/dev/null
    kill $BACKEND_PID 2>/dev/null
    wait $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID 2>/dev/null
    echo "Application stopped"
    exit 0
}

# 捕获信号以优雅关闭
trap cleanup SIGTERM SIGINT

# 等待所有进程
wait