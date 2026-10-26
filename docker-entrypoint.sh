#!/bin/sh
set -e

echo "========================================================"
echo "🚀 启动 [反代API] 一体化云端超级网关 (Dual Engine)"
echo "   - 顶层主网关: Node.js (Render 宿主端口 ${PORT:-8080})"
echo "   - 后端 CLIProxyAPI: (内部端口 8081)"
echo "========================================================"

# 1. 初始化 CLIProxyAPI 内部配置文件
mkdir -p /CLIProxyAPI /data/auths /app/session /app/logs
cat << 'EOF' > /CLIProxyAPI/config.yaml
host: "127.0.0.1"
port: 8081
auth-dir: "/data/auths"
remote-management:
  allow-remote: true
  secret-key: "Admin123456!"
usage-statistics-enabled: true
api-keys:
  - "sk-antigravity-secret-8888"
EOF

# 2. 在后台启动 CLIProxyAPI 内部服务 (Port 8081)
echo "[CLIProxyAPI] 启动 CLIProxyAPI 内部服务 (Port 8081)..."
/CLIProxyAPI/CLIProxyAPI --config /CLIProxyAPI/config.yaml &

# 3. 在前台主端口启动 Node.js 超级网关 (Render 监听端口)
MAIN_PORT=${PORT:-8080}
echo "[Node Gateway] 启动超级主网关 (Port ${MAIN_PORT})..."
export PORT=${MAIN_PORT}
export HOST="0.0.0.0"
exec node /app/index.js
