"""
通义千问多账号批量导入与自动授权工具 (Batch Import & Auth Engine)
支持格式：
1. 邮箱----密码
2. 邮箱----密码----client_id----refresh_token (Outlook 自动收码)
功能：
- 自动化无感/半自动登录
- 自动提取主站 Token + 画王 Studio Cookies (支持 2K生图 + 5秒视频生成)
- 写入本地账号池 (tokens.json, studio_accounts.json)
- 自动生成云端 Render 环境变量一键复制文件 (session/cloud_env.txt)
"""

import os
import sys
import json
import time
import re
import asyncio
import urllib.request
import urllib.parse
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
CLOUD_ENV_FILE = os.path.join(SESSION_DIR, "cloud_env.txt")
ACCOUNTS_TXT = os.path.join(PROJECT_ROOT, "accounts.txt")

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

def export_cloud_env():
    """导出可直接复制到 Render / 云服务器环境变量的配置"""
    studios = load_json(STUDIO_ACCOUNTS_FILE, default=[])
    tokens = load_json(TOKENS_FILE, default=[])
    
    studio_json_str = json.dumps(studios, ensure_ascii=False)
    tokens_json_str = json.dumps(tokens, ensure_ascii=False)
    
    content = f"""# ========================================================
# 云端 Render / 云服务器 环境变量配置 (一键复制到 Render)
# ========================================================
# Key: STUDIO_ACCOUNTS_JSON
STUDIO_ACCOUNTS_JSON={studio_json_str}

# Key: TOKENS_JSON
TOKENS_JSON={tokens_json_str}

# Key: API_KEYS
API_KEYS=["sk-qwen-secret-8888"]
"""
    with open(CLOUD_ENV_FILE, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"📄 云端环境变量已同步生成至: {CLOUD_ENV_FILE}")

def get_outlook_verification_code(client_id, refresh_token, wait_seconds=30):
    """通过微软 Graph API 自动收取通义千问 6 位验证码"""
    token_url = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
    payload = urllib.parse.urlencode({
        "client_id": client_id,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "scope": "https://graph.microsoft.com/.default offline_access"
    }).encode("utf-8")

    req = urllib.request.Request(token_url, data=payload, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            access_token = data.get("access_token")
    except Exception as e:
        print(f"⚠️ 获取 Outlook access_token 失败: {e}")
        return None

    if not access_token:
        return None

    # 轮询邮件收取验证码
    graph_url = "https://graph.microsoft.com/v1.0/me/messages?$top=5&$orderby=receivedDateTime%20desc"
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}

    start_time = time.time()
    while time.time() - start_time < wait_seconds:
        try:
            req_msg = urllib.request.Request(graph_url, headers=headers, method="GET")
            with urllib.request.urlopen(req_msg, timeout=15) as resp:
                msgs = json.loads(resp.read().decode("utf-8")).get("value", [])
                for m in msgs:
                    subject = m.get("subject", "")
                    body_preview = m.get("bodyPreview", "")
                    content = subject + " " + body_preview
                    if any(k in content for k in ["Qwen", "通义", "验证码", "verification", "code", "Alibaba"]):
                        codes = re.findall(r"\b\d{6}\b", content)
                        if codes:
                            return codes[0]
        except Exception:
            pass
        time.sleep(3)
    return None

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
    raise RuntimeError("未找到本地 Edge 或 Chrome 浏览器。")

async def login_and_extract_account(account_info, headless=False):
    """自动登录并提取单个账号凭证"""
    email = account_info.get("email")
    password = account_info.get("password")
    client_id = account_info.get("client_id")
    refresh_token = account_info.get("refresh_token")

    print(f"\n▶ 正在处理账号: {email} ...")

    async with async_playwright() as p:
        browser = await launch_browser(p, headless=headless)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        try:
            await page.goto("https://chat.qwen.ai/auth?action=signin", timeout=25000)
            await asyncio.sleep(2)

            # 尝试自动填入账号
            if email:
                try:
                    await page.wait_for_selector('input[type="text"], input[type="email"], #username', timeout=8000)
                    await page.fill('input[type="text"], input[type="email"], #username', email)
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(2)
                except Exception:
                    pass

            if password:
                try:
                    await page.wait_for_selector('input[type="password"], #password', timeout=8000)
                    await page.fill('input[type="password"], #password', password)
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(3)
                except Exception:
                    pass

            # 如果有 Outlook 自动收取验证码逻辑
            if client_id and refresh_token:
                print("检测到 Outlook 邮箱凭证，尝试自动获取 6 位验证码...")
                code = get_outlook_verification_code(client_id, refresh_token, wait_seconds=25)
                if code:
                    print(f"✅ 自动收取到验证码: {code}，正在自动填入...")
                    try:
                        code_input = await page.wait_for_selector('input[maxlength="6"], input[placeholder*="验证码"]', timeout=5000)
                        if code_input:
                            await code_input.fill(code)
                            await page.keyboard.press("Enter")
                    except Exception as e:
                        print(f"自动填入验证码提示: {e}")

            # 等待登录成功并跳转
            print("等待登录完成与凭证检测 (若有滑块验证请在窗口内手动滑动)...")
            token = None
            account_name = email
            for _ in range(60):
                await asyncio.sleep(2)
                try:
                    token_val = await page.evaluate("localStorage.getItem('token')")
                    if token_val and len(token_val) > 20:
                        token = token_val
                        user_info_raw = await page.evaluate("localStorage.getItem('user_info')")
                        if user_info_raw:
                            try:
                                u_info = json.loads(user_info_raw)
                                account_name = u_info.get("email") or account_name
                            except Exception:
                                pass
                        break
                except Exception:
                    pass

            if not token:
                print(f"❌ 账号 {email} 登录超时或未完成。")
                await browser.close()
                return False

            print(f"✅ 主站凭证获取成功！正在激活画王 Studio (2K生图 + 视频生成)...")
            # 访问画王页面以激活 Studio 凭证与 cookies
            await page.goto("https://create.qwen.com/r/ai-studio-pc-global/main/gen-image", timeout=20000)
            await asyncio.sleep(3)

            cookies = await context.cookies()
            cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies if "qwen" in c['domain']])

            qwen_refresh_token = ""
            for c in cookies:
                if c["name"] == "refresh_token":
                    qwen_refresh_token = c["value"]
                    break

            # 存盘
            account_id = email or f"acc_{int(time.time())}"

            tokens_list = load_json(TOKENS_FILE, default=[])
            tokens_list = [t for t in tokens_list if t.get("id") != account_id]
            tokens_list.append({
                "id": account_id,
                "token": token,
                "added_at": datetime.now().isoformat(),
                "invalid": False,
                "resetAt": None
            })
            save_json(TOKENS_FILE, tokens_list)

            studio_list = load_json(STUDIO_ACCOUNTS_FILE, default=[])
            studio_list = [s for s in studio_list if s.get("id") != account_id]
            studio_list.append({
                "id": account_id,
                "name": account_id,
                "auth_token": token,
                "refresh_token": qwen_refresh_token,
                "cookies": cookie_str,
                "daily_credits": 50,
                "cost_per_image": 2,
                "cost_per_video": 30,
                "updated_at": datetime.now().isoformat()
            })
            save_json(STUDIO_ACCOUNTS_FILE, studio_list)

            print(f"🎉 账号 {account_id} 入库成功！")
            print(f"   - 每日额度: 25张 2K大图 OR 1条 5秒HappyHorse视频 + 40张主站大图")
            await browser.close()
            return True

        except Exception as e:
            print(f"❌ 处理账号 {email} 出错: {e}")
            await browser.close()
            return False

def parse_accounts_file(file_path):
    """解析批量账号文件"""
    if not os.path.exists(file_path):
        return []
    accounts = []
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split("----")]
            if len(parts) >= 2:
                acc = {
                    "email": parts[0],
                    "password": parts[1]
                }
                if len(parts) >= 4:
                    acc["client_id"] = parts[2]
                    acc["refresh_token"] = parts[3]
                accounts.append(acc)
    return accounts

async def run_batch_import(file_path=None, headless=False):
    target_file = file_path or ACCOUNTS_TXT
    print("\n" + "=" * 60)
    print(" 🚀 通义千问多账号批量自动导入与反代配置引擎")
    print("=" * 60)
    
    if not os.path.exists(target_file):
        # 创建模板文件
        with open(target_file, "w", encoding="utf-8") as f:
            f.write("# 在此文件中每行填入一个账号，支持以下格式：\n")
            f.write("# 格式1（普通密码）：邮箱----密码\n")
            f.write("# 格式2（Outlook自动收码）：邮箱----密码----client_id----refresh_token\n")
            f.write("# 示例：\n")
            f.write("# test@outlook.com----MyPassword123\n")
        print(f"ℹ️ 未找到账号文件，已自动为您创建模板: {target_file}")
        print("请在文件中填入您的账号后重新运行导入！\n")
        return

    accounts = parse_accounts_file(target_file)
    if not accounts:
        print(f"⚠️ 文件 {target_file} 中未发现有效账号行，请检查格式 (邮箱----密码)。")
        return

    print(f"共发现 {len(accounts)} 个待处理账号，开始批量自动授权...")
    success_count = 0
    for idx, acc in enumerate(accounts, 1):
        print(f"\n[{idx}/{len(accounts)}] 处理中: {acc['email']}")
        ok = await login_and_extract_account(acc, headless=headless)
        if ok:
            success_count += 1
        await asyncio.sleep(2)

    export_cloud_env()

    studios = load_json(STUDIO_ACCOUNTS_FILE, default=[])
    tokens = load_json(TOKENS_FILE, default=[])

    print("\n" + "=" * 60)
    print("✨ 批量处理完成！")
    print(f"📌 本次成功入库: {success_count} / {len(accounts)} 个账号")
    print(f"📊 当前账号池总数: {len(studios)} 个")
    print(f"🎨 每日总免费生图能力: {len(studios) * 25} 张 2K 原画 + {len(tokens) * 40} 张主站图")
    print(f"🎬 每日总视频生成能力: {len(studios)} 条 5秒 HappyHorse 1.1 视频")
    print(f"🌐 云端配置已导出至: {CLOUD_ENV_FILE} (可直接一键导入 Render)")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    file_arg = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else None
    headless_arg = "--headless" in sys.argv
    asyncio.run(run_batch_import(file_path=file_arg, headless=headless_arg))
