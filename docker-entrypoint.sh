#!/bin/sh
set -e

echo "========================================================"
echo "🚀 启动 [反代API] 一体化云端超级网关 (Dual Engine)"
echo "   - 顶层主网关: Node.js (Render 宿主双端口 8080 & ${PORT:-10000})"
echo "   - 后端 CLIProxyAPI: (内部端口 8081)"
echo "========================================================"

# 1. 初始化 CLIProxyAPI 内部配置文件与持久化目录
mkdir -p /CLIProxyAPI /data/auths /root/.cli-proxy-api /app/session /app/logs
cat << 'EOF' > /CLIProxyAPI/config.yaml
host: "0.0.0.0"
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
echo "[CLIProxyAPI] 正在从 /CLIProxyAPI 目录启动后端服务..."
cd /CLIProxyAPI
./CLIProxyAPI --config /CLIProxyAPI/config.yaml > /app/logs/cliproxy.log 2>&1 &
CLIPROXY_PID=$!
echo "[CLIProxyAPI] 进程已在后台启动, PID: $CLIPROXY_PID"

# 循环检查 127.0.0.1:8081 是否监听就绪（最多等待 10 秒）
i=1
READY=0
while [ $i -le 10 ]; do
    if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/management.html 2>/dev/null | grep -q "200\|302\|401\|403"; then
        echo "[CLIProxyAPI] ✅ CLIProxyAPI 内部端口 8081 已就绪 (耗时 ${i}s)！"
        READY=1
        break
    fi
    sleep 1
    i=$((i + 1))
done

if [ $READY -eq 0 ]; then
    echo "[CLIProxyAPI] ⚠️ 警告: 8081 暂未响应 HTTP 请求，当前最近运行日志:"
    cat /app/logs/cliproxy.log || true
fi

# 3. 在前台启动 Node.js 超级网关 (免交互无感模式)
cd /app
export NON_INTERACTIVE=1
export SKIP_ACCOUNT_MENU=1
export HOST="0.0.0.0"
exec node /app/index.js
