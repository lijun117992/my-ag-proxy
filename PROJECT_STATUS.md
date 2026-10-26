# 反代API 项目状态与架构说明

## 当前状态 (2026-10-27)
- **已全面实现双引擎一体化超级云端网关**：
  1. **Google Antigravity / Claude / Codex 模块**：底层原生集成 `CLIProxyAPI v8.0.44`，完整保留 `/management.html` 原生 CPAMC 控制台，支持管理密钥 `Admin123456!` 登录与全量 OAuth 凭证池。
  2. **通义千问模块原生深度集成**：直接挂载于 CPAMC 侧边栏，作为原生功能无缝运行，单网页统一管理所有模型，彻底杜绝多网址割裂。
  3. **通义画王 2K 原画生成**：`qwen-image-3.0-2k`，单号每日 50 积分（25 张 2048x2048 原图）。
  4. **通义万相 HappyHorse 1.1 电影级生视频**：`happyhorse1.1`，支持 5 秒连贯动作，单图或多图首尾关键帧生视频。
  5. **阿里云百炼 DashScope 官方直连**：支持填入 `DASHSCOPE_API_KEY`，官方原生调用 `qwen-image-plus` / `wanx` 旗舰生图，永久免登，永不失效。
  6. **微软 Graph API 自动取件入库**：直连 Outlook 邮箱收取 6 位验证码，彻底摆脱本地浏览器与繁琐抓包。
  7. **全量凭证持久化与防重置保护**：一键生成 `RENDER_AUTHS_BACKUP`，开机自启还原 Antigravity 与通义千问所有凭据。
- **云端生产部署**：
  - 生产统一入口：`https://my-ag-proxy.onrender.com`
  - 原生 CPAMC 控制台：`https://my-ag-proxy.onrender.com/management.html`
  - 管理密码：`Admin123456!`
  - 极速构建架构：Node.js 20 Debian Bookworm 运行时底包，与 CLIProxyAPI 官方镜像 GLIBC 100% 同构，秒级启动。
