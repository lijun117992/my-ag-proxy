# 更新日志 (CHANGELOG)

## [2.1.0] - 2026-10-26
### 修复与完善 (Fixes & Restorations)
- **彻底恢复原生 CPAMC 控制台**：将 Docker 容器运行环境调整为 `node:20-slim` (Debian Bookworm)，与 CLIProxyAPI 官方底包同构 GLIBC，彻底消除 Alpine musl 兼容性导致的 502/404 错误。
- **全量无损透明反代**：主网关自动透传 `/v8/management/*`、`/v0/management/*`、`/management.html` 与 `/credentials`，管理密钥 `Admin123456!` 验证与 Antigravity OAuth 凭证池 100% 恢复。
- **双引擎并行就绪**：
  - 8081 端口：底层 CLIProxyAPI v8.0.44 后台守护服务
  - 8080/10000 端口：Node.js 超级主网关（通义千问模块、Outlook 自动取件、统一控制台）
- **CORS 与跨域安全彻底开放**：支持全 Web Origin，彻底解决浏览器跨域拦截。

## [2.0.0] - 2026-10-26
### 新增 (Features)
- 架构升级为双引擎一体化超级网关，合并 Google Antigravity、Claude、Codex 与通义千问。
- 引入通义画王 2K 原图生成 (`qwen-image-3.0`) 与 HappyHorse 1.1 5秒视频生成 (`happyhorse1.1`)。
- 接入微软 Graph API 自动收取 Outlook 邮件验证码。
- 新增统一 Web 控制台 (`public/index.html`)。
