# syntax=docker/dockerfile:1.6

# 第一阶段：从官方 CLIProxyAPI 提取 Go 二进制与资产
FROM eceasy/cli-proxy-api:latest AS cliproxy

# 第二阶段：Node.js + Chromium + CLIProxyAPI 双引擎运行环境
FROM node:20-slim AS runner

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium fonts-liberation libatk-bridge2.0-0 libatk1.0-0 \
      libcups2 libdrm2 libgbm1 libnss3 libxcomposite1 \
      libxdamage1 libxrandr2 xdg-utils ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    CHROME_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

# 从第一阶段复制 CLIProxyAPI 主程序
COPY --from=cliproxy /CLIProxyAPI /CLIProxyAPI

# 复制 Node.js 依赖清单并安装
COPY package*.json ./
RUN npm ci --omit=dev

# 复制项目所有源码
COPY . .

# 创建必要目录
RUN mkdir -p /app/session /app/logs /app/uploads /data/auths

# 赋予入口脚本执行权限
RUN chmod +x /app/docker-entrypoint.sh

# 暴露端口：8080 (Node.js 超级主网关)，8081 (内部 CLIProxyAPI)
EXPOSE 8080 8081

ENTRYPOINT ["/app/docker-entrypoint.sh"]
