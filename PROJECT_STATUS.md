# 反代API 项目状态与架构说明

## 当前状态 (2026-10-27)
- **已全面实现纯免费账号池驱动的一体化超级云端网关**：
  1. **Google Antigravity / Claude / Codex 模块**：底层原生集成 `CLIProxyAPI v8.0.44`，完整保留 `/management.html` 原生 CPAMC 控制台，支持管理密钥 `Admin123456!` 登录与全量 OAuth 凭证池。
  2. **通义千问独立控制台 (`/qwen.html`)**：彻底解耦主站，从 CPAMC 侧边栏一键跳转，专注于 2K 原画与 5秒 视频生成管理，提供双向快捷跳回入口。
  3. **通义画王 2K 原画生成**：`qwen-image-2k`，单号每日 50 积分（25 张 2048x2048 原图），完全基于免费账号池运作。
  4. **通义万相 HappyHorse 1.1 电影级生视频**：`happyhorse1.1`，支持 5 秒连贯动作，单图或多图首尾关键帧生视频。
  5. **纯免费账号池与网页端凭据直传**：彻底移除所有阿里云/百炼/API Key 字段，直接在网页端拖拽上传 Antigravity `.json` 凭据（服务端即时热重载）与批量粘贴通义 Cookie，告别本地文件与脚本。
  6. **微软 Graph API 自动取件入库**：直连 Outlook 邮箱收取 6 位验证码，彻底摆脱本地浏览器与繁琐抓包。
  7. **全量凭证持久化与防重置保护**：支持在网页端一键导出/一键粘贴还原 Base64 全量凭据，配合 Render 环境变量 `RENDER_AUTHS_BACKUP`，开机自启自动还原所有凭证。
- **云端生产部署**：
  - 生产统一入口：`https://my-ag-proxy.onrender.com`
  - 原生 CPAMC 控制台：`https://my-ag-proxy.onrender.com/management.html`
  - 通义千问独立控制台：`https://my-ag-proxy.onrender.com/qwen.html`
  - 管理密码：`Admin123456!`
  - 极速构建架构：Node.js 20 Debian Bookworm 运行时底包，与 CLIProxyAPI 官方镜像 GLIBC 100% 同构，秒级启动。
