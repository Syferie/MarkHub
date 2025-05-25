#!/bin/sh
# frontend/entrypoint.sh

# 检查 APP_API_BASE_URL 环境变量是否已设置
if [ -z "${APP_API_BASE_URL}" ]; then
  echo "Error: APP_API_BASE_URL environment variable is not set." >&2
  echo "Please set this variable to point to your backend API." >&2
  exit 1
fi

# 创建或覆盖 public/env-config.js 文件
# 将配置写入 window._env_ 对象
mkdir -p /app/public
echo "window._env_ = {" > /app/public/env-config.js
echo "  APP_API_BASE_URL: \"${APP_API_BASE_URL}\"" >> /app/public/env-config.js
echo "}" >> /app/public/env-config.js

echo "Generated /app/public/env-config.js with API URL: ${APP_API_BASE_URL}"

# 执行 Dockerfile 中指定的 CMD
exec "$@"