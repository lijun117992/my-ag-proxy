# 第一阶段：从官方 CLIProxyAPI 提取 Go 二进制与资产
FROM eceasy/cli-proxy-api:latest AS cliproxy

# 第二阶段：Node.js 20 Debian Bookworm 极速双引擎运行环境（与 CLIProxyAPI 官方镜像底包 100% 同构 GLIBC）
FROM node:20-slim AS runner

# 安装基础运行工具与 CA 证书（~5MB，极速秒装）
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    NODE_ENV=production

WORKDIR /app

# 从第一阶段复制 CLIProxyAPI 主程序并赋予执行权限
COPY --from=cliproxy /CLIProxyAPI /CLIProxyAPI
RUN chmod +x /CLIProxyAPI/CLIProxyAPI

# 复制 Node.js 依赖清单并极速安装（--ignore-scripts 杜绝下载外部 Chromium，纯 HTTP 引擎极速构建）
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts

# 复制项目所有源码
COPY . .

# 创建必要目录
RUN mkdir -p /app/session /app/logs /app/uploads /data/auths /root/.cli-proxy-api

# 赋予入口脚本执行权限
RUN chmod +x /app/docker-entrypoint.sh

# 暴露端口：8080 (Node.js 超级主网关)，8081 (内部 CLIProxyAPI)
EXPOSE 8080 8081

ENTRYPOINT ["/app/docker-entrypoint.sh"]
