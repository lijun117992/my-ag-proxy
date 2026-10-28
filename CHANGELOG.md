# 更新日志 (CHANGELOG)

## [2.4.0] - 2026-10-27
### 纯网页端凭证录入与彻底零 API 化 (Pure Web Ingestion & Zero-API Mandate)
- **纯网页端凭证录入，告别本地文件与脚本**：
  - 在 `/qwen.html` 中新增 Antigravity 认证凭证 (`.json`) 网页端直接上传与拖拽功能，调用 `POST /api/management/auth-upload` 直接将凭据写入服务端的 `/data/auths/` 目录，CLIProxyAPI 自动热重载生效，无需在本地打开任何脚本。
  - 新增通义千问 Cookie 批量多账号录入功能 (`POST /api/management/import-cookies`)，支持多行文本一次性粘贴多个免费账号 Cookie，自动提取 `refresh_token` 并挂载激活。
  - 新增网页端 Base64 凭据一键还原功能 (`POST /api/management/auths-restore`)，直接在浏览器中粘贴备份字符即可瞬间恢复云端凭据池。
- **彻底根除阿里云与外部付费 API 字段**：
  - 严格落实用户指令，全面移除前端控制台与后端路由中所有关于“阿里云”、“百炼”、“DashScope”、“API Key”的字段、提示及错误文本。
  - 平台 100% 运行在免费账号池机制上，生图与视频通道均由免费 Cookie/Token 凭据与负载均衡调度。

## [2.3.0] - 2026-10-27
### 修复与云端部署验证 (Fixes & Live Deploy Verification)
- **全面解耦双控制台（彻底杜绝 DOM 冲突与路由打架）**：
  - 采纳极简独立架构方案，将通义千问模型管理独立拆分为专用网页 `/qwen.html`。
  - 原生 Antigravity 控制台 (`/management.html`) 保持 100% 官方原汁原味与零干扰，侧边栏仅保留轻量级跳转入口（点击直接在新标签页或本页跳转到 `/qwen.html`）。
  - 通义千问控制台顶部配备快捷按钮，支持一键无缝跳回 Antigravity 控制台，两套系统彻底解耦、互不侵扰、各司其职。
- **桌面端一键批量导入可视化工具**：
  - 新增桌面启动器 `通义千问批量提取器.bat` 与桌面 GUI 界面 (`scripts/gui_batch_importer.py`)。
  - 用户可直接在界面粘贴批量账号列表，一键发起半自动流水线，自动填入、自动收取 Outlook 邮件验证码，完成即刻自动直连同步至云端 Render 账号池。
- **解耦 React Router 与 CPAMC 侧边栏通义千问模块**：
  - 彻底根除点击【通义千问 (2K/视频)】时被 React Router 的通配符规则 `{ path: '*', element: <Navigate to="/" replace /> }` 拦截回仪表盘首页的问题。
  - 将导航链接解耦为原生 DOM 无感切换，增加 `MutationObserver` 守护进程与会话状态记忆，保障在 React SPA 异步刷新时主视图始终稳定呈现千问控制台。
- **修复服务端运行时启动异常**：
  - 解决 `index.js` 顶部缺失 `import fs from 'fs';` 导致 Render 容器启动抛出 `ReferenceError: fs is not defined` 的崩溃问题。
- **实测云端全量跑通**：
  - Render 云端最新镜像已成功构建并转为 `Live` 运行状态；
  - 验证 `/health` 200 OK、`/management.html` 注入完整、`/api/management/accounts` 正常响应。

## [2.2.0] - 2026-10-27
### 修复与升级 (Fixes & Upgrades)
- **全面清除俄文报错并实现友好中文反馈**：
  - 彻底根治生图时出现的 `Ошибка генерации изображения через Qwen Chat` 俄文乱码及 500 报错。
  - 重构 `src/api/routes.js` 与 `src/api/apiErrors.js` 中的媒体生成路由与全局异常处理，建立三层自愈降级体系：Qwen Studio 2K 原生引擎 -> Qwen Chat 主站通道 -> 友好中文配置指引。
  - 账号池凭证缺失或失效时，返回结构化中文指引，页面一键跳转配置，彻底杜绝黑盒报错。
- **通义千问凭据录入与多通道全面开放**：
  - 在侧边栏新增直接录入通义千问 Cookie / Token，支持直接粘贴 `create.qwen.com` 或 `chat.qwen.ai` 的 Cookie，一键保存并激活 2K 原画与 5秒 视频。
  - 优化微软 Outlook 批量自动取件通道。
- **全量凭证持久化与防重置备份增强**：
  - 升级 `/api/management/auths-backup` 与 `/api/management/auths-restore`，将 Google Antigravity OAuth 凭证、通义千问 Studio 账号池 (`studio_accounts.json`)、对话 Token 池 (`tokens.json`) 一键打包为统一 Base64 字符串。
  - 强化 `docker-entrypoint.sh`，容器开机时自动从 `RENDER_AUTHS_BACKUP` 还原全量凭据，彻底杜绝 Render 免费实例重建时数据丢失。

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
