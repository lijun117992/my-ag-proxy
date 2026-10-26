#!/bin/sh
set -e

echo "========================================================"
echo "🚀 启动 [反代API] 一体化云端超级网关 (Dual Engine)"
echo "   - 顶层网关: CLIProxyAPI (Google Antigravity / Claude / CPAMC)"
echo "   - 视觉引擎: Qwen Proxy (2K原画 / HappyHorse 1.1视频)"
echo "========================================================"

# 1. 初始化 CLIProxyAPI 配置文件与上游聚合路由
mkdir -p /CLIProxyAPI /data/auths /app/session /app/logs
cat << 'EOF' > /CLIProxyAPI/config.yaml
host: "0.0.0.0"
port: 8080
auth-dir: "/data/auths"
remote-management:
  allow-remote: true
  secret-key: "Admin123456!"
usage-statistics-enabled: true
api-keys:
  - "sk-antigravity-secret-8888"

# 统一聚合通义千问 2K生图与HappyHorse 1.1视频路由
openai-compatibility:
  - name: "qwen-creative-engine"
    base-url: "http://127.0.0.1:3264/v1"
    api-key-entries:
      - api-key: "sk-qwen-secret-8888"
    models:
      - name: "qwen-image-3.0"
        alias: "qwen-image-3.0"
      - name: "happyhorse1.1"
        alias: "happyhorse1.1"
      - name: "qwen3.7-plus"
        alias: "qwen3.7-plus"
EOF

# 2. 在后台 3264 端口启动通义千问反代与自动化取件引擎
echo "[Engine] 启动通义千问微服务 (Port 3264)..."
PORT=3264 node /app/index.js &

# 3. 在前台 8080 端口启动 CLIProxyAPI 主网关与 CPAMC 控制台
echo "[Gateway] 启动主网关与 CPAMC 控制台 (Port 8080)..."
exec /CLIProxyAPI/CLIProxyAPI --config /CLIProxyAPI/config.yaml
