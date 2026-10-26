# 反代API (Unified AI Proxy) - Agent 指南

## 项目定位
本项目是唯一集成了 **Google Antigravity / Claude / Codex 文本与推理反代** 与 **通义画王 2K 顶级原画生图 + HappyHorse 1.1 视频生成** 的一体化云端代理中心。

## 目录拓扑
```
D:\AI-Dev\AI-Projects\03-Software\反代api\
├── Dockerfile                  # 一体化云端双引擎构建清单 (CLIProxyAPI 8080 + Qwen 3264)
├── docker-entrypoint.sh        # 云端自动初始化 config.yaml 并联动启动两大微服务
├── index.js                    # 通义千问 Node.js 反代微服务入口
├── public/
│   └── index.html              # 可视化云端管理控制台 (配额大屏、自动取件、2K/视频试炼场)
├── scripts/
│   ├── batch_import_accounts.py # 批量账号导入与自动授权工具
│   └── qwen_account_manager.py  # 账号池管理工具
├── session/                    # 账号与会话持久化目录
│   ├── studio_accounts.json    # 画王 2K原画 + 视频生成账号池
│   ├── tokens.json             # 主站对话生图账号池
│   └── cloud_env.txt           # 云端 Render 环境变量一键复制文件
├── src/
│   ├── api/                    # 路由、OpenAI 规范适配、千问微服务
│   │   ├── managementRoutes.js # Web 控制台 API 路由
│   │   ├── qwenStudio.js       # 通义画王 2K原画与视频生成核心模块
│   │   └── routes.js           # 主 OpenAI 兼容路由
│   └── utils/
│       └── outlookReceiver.js  # 微软 Graph API 2秒全自动验证码取件引擎
├── CONSTITUTION.md             # 本项目行动宪法与开发军规
├── PROJECT_STATUS.md           # 实时项目状态
└── CHANGELOG.md                # 变更日志
```

## 核心接口说明
对外服务由顶层网关统一接管：
- **公共 Base URL**：`https://my-ag-proxy.onrender.com/v1`
- **公共 API Key**：`sk-antigravity-secret-8888`
- **支持模型**：
  - `gemini-3.8-flash-high` / `claude-sonnet-4-6` ➡️ 自动由 Antigravity 处理
  - `qwen-image-3.0` ➡️ 自动由通义画王 2K 引擎处理 (`/images/generations`)
  - `happyhorse1.1` ➡️ 自动由通义画王 5 秒视频引擎处理 (`/videos/generations`)

## 行动守则
严格遵守 `CONSTITUTION.md`，严禁盲目猜测，严禁让用户手工抓包，任何自动化任务由 Agent 主动代劳推进到底。
