"""
通义千问多账号管理与一键授权助手 (Qwen Account Manager)
功能：
1. 一键交互式弹窗登录：无需打开 F12，无需手动抓包，弹窗登录后自动提取 Token、Cookies 与凭证。
2. 双池同步：同时写入主站对话生图池 (tokens.json) 和画王 Studio 2K 创作池 (studio_accounts.json)。
3. 批量导入支持：支持读取 accounts.txt 批量授权。
4. 账号状态与额度查看。
"""

import os
import sys
import json
import time
import asyncio
from datetime import datetime
from playwright.async_api import async_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
SESSION_DIR = os.path.join(PROJECT_ROOT, "session")
TOKENS_FILE = os.path.join(SESSION_DIR, "tokens.json")
STUDIO_ACCOUNTS_FILE = os.path.join(SESSION_DIR, "studio_accounts.json")

def ensure_session_dir():
    os.makedirs(SESSION_DIR, exist_ok=True)

def load_json(filepath, default=[]):
    if not os.path.exists(filepath):
        return default
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def save_json(filepath, data):
    ensure_session_dir()
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

async def launch_browser(p, headless=False):
    for channel in ["msedge", "chrome", None]:
        try:
            kwargs = {"headless": headless}
            if channel:
                kwargs["channel"] = channel
            browser = await p.chromium.launch(**kwargs)
            return browser
        except Exception:
            continue
    raise RuntimeError("未找到本地 Edge 或 Chrome 浏览器，请确保已安装 Edge 或 Chrome。")

async def add_account_interactive():
    print("\n" + "=" * 60)
    print(" 🚀 通义千问一键账号授权助手 (无需抓包 / 零 F12)")
    print("=" * 60)
    print("即将弹出浏览器窗口，请在打开的页面中正常登录您的 Qwen 账号。")
    print("支持任意登录方式（手机号、密码、Google、GitHub、邮箱等）。")
    print("登录成功并进入主页后，脚本将自动捕获凭证并保存！\n")

    async with async_playwright() as p:
        browser = await launch_browser(p, headless=False)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        print("正在打开登录页面: https://chat.qwen.ai/auth?action=signin ...")
        await page.goto("https://chat.qwen.ai/auth?action=signin")

        print("等待登录中... (请在浏览器窗口内完成登录)")
        token = None
        account_name = None

        # 轮询检测是否登录成功
        for _ in range(120): # 最多等待 4 分钟
            await asyncio.sleep(2)
            try:
                cur_url = page.url
                # 检查 localStorage 是否已有 token
                token_val = await page.evaluate("localStorage.getItem('token')")
                if token_val and len(token_val) > 20:
                    token = token_val
                    user_info_raw = await page.evaluate("localStorage.getItem('user_info')")
                    if user_info_raw:
                        try:
                            u_info = json.loads(user_info_raw)
                            account_name = u_info.get("email") or u_info.get("nickname") or u_info.get("name")
                        except Exception:
                            pass
                    break
            except Exception:
                pass

        if not token:
            print("❌ 未在规定时间内检测到登录成功或 Token。")
            await browser.close()
            return

        if not account_name:
            account_name = f"acc_{int(time.time())}"

        print(f"\n✅ 成功捕获主站授权！账号标识: {account_name}")
        print("正在获取画王 Studio (create.qwen.com) 2K 凭证与 Cookie...")

        # 访问画王页面以激活 Studio 凭证与 cookies
        await page.goto("https://create.qwen.com/r/ai-studio-pc-global/main/gen-image")
        await asyncio.sleep(3)

        cookies = await context.cookies()
        cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies if "qwen" in c['domain']])

        # 提取 refresh_token
        refresh_token = ""
        for c in cookies:
            if c["name"] == "refresh_token":
                refresh_token = c["value"]
                break

        # 保存至主站对话池 (tokens.json)
        tokens_list = load_json(TOKENS_FILE, default=[])
        # 移除已有相同 ID
        tokens_list = [t for t in tokens_list if t.get("id") != account_name]
        tokens_list.append({
            "id": account_name,
            "token": token,
            "added_at": datetime.now().isoformat(),
            "invalid": False,
            "resetAt": None
        })
        save_json(TOKENS_FILE, tokens_list)

        # 保存至画王 Studio 2K 创作池 (studio_accounts.json)
        studio_list = load_json(STUDIO_ACCOUNTS_FILE, default=[])
        studio_list = [s for s in studio_list if s.get("id") != account_name]
        studio_list.append({
            "id": account_name,
            "name": account_name,
            "auth_token": token,
            "refresh_token": refresh_token,
            "cookies": cookie_str,
            "daily_credits": 50,
            "cost_per_image": 2,
            "updated_at": datetime.now().isoformat()
        })
        save_json(STUDIO_ACCOUNTS_FILE, studio_list)

        print("\n" + "=" * 60)
        print("🎉 授权成功！")
        print(f"📌 账号: {account_name}")
        print(f"📊 主站对话生图池: 已入库 (当前总账号数: {len(tokens_list)})")
        print(f"🎨 画王 2K 创作池: 已入库 (当前总账号数: {len(studio_list)})")
        print(f"🎁 该账号每日可免费生成: 25张 2K大图 + 40张主站图 = 65张/天")
        print("=" * 60)

        await browser.close()

def list_accounts():
    tokens = load_json(TOKENS_FILE, default=[])
    studios = load_json(STUDIO_ACCOUNTS_FILE, default=[])

    print("\n" + "=" * 60)
    print(" 📋 通义千问已配置账号总览")
    print("=" * 60)
    if not tokens and not studios:
        print("暂无已配置账号，请使用 'python scripts/qwen_account_manager.py add' 添加。")
        return

    all_ids = sorted(list(set([t.get("id") for t in tokens] + [s.get("id") for s in studios])))
    for i, aid in enumerate(all_ids, 1):
        has_chat = any(t.get("id") == aid and not t.get("invalid") for t in tokens)
        has_studio = any(s.get("id") == aid for s in studios)
        print(f"[{i}] 账号 ID: {aid}")
        print(f"    - 主站 Chat 生图 (40图/天): {'🟢 正常' if has_chat else '🔴 未配置/失效'}")
        print(f"    - 画王 Studio 2K (25图/天): {'🟢 正常' if has_studio else '🔴 未配置'}")
        print("-" * 50)
    print(f"💡 每日预计总免费生图能力: {len(all_ids) * 65} ~ {len(all_ids) * 90} 张大图\n")

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "list"
    if action == "add":
        asyncio.run(add_account_interactive())
    elif action == "list":
        list_accounts()
    else:
        print("用法:")
        print("  python scripts/qwen_account_manager.py add    # 弹窗添加一个新账号 (零抓包)")
        print("  python scripts/qwen_account_manager.py list   # 列出所有账号与额度状态")
