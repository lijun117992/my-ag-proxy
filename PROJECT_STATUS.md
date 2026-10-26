# FreeQwenApi 项目状态与架构说明

## 当前状态 (2026-10-26)
- **已实现通义千问双源生图逆向代理**：
  1. **通义画王 (Qwen Creative Studio 2K)**：`https://create.qwen.com`，生成 2048x2048 2K 原图，单号每日免费 50 积分（可生成 25 张）。
  2. **主站对话生图 (Qwen Chat t2i)**：`https://chat.qwen.ai`，单号每日免费 40 次生图。
  3. 单账号每日合计免费生成 **65 ~ 90 张大图**。
- **已交付自动化工具与代码**：
  - `qwen_studio_api.py`：独立 Python 版 2K 图片生成器与下载器。
  - `scripts/qwen_account_manager.py`：零抓包、一键弹窗自动化多账号授权管理助手。
  - `src/api/qwenStudio.js`：Node.js 服务端接入模块。
- **生成样例原图**：
  - `cyberpunk_cat_2k.png` (9.36 MB, 2048x2048)
  - `shiba_2k.png` (10.4 MB, 2048x2048)
  - `test_puppy.png` (10.8 MB, 2048x2048)
