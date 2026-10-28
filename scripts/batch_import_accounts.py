"""
通义千问免费账号池自动化批量授权与云端反代同步引擎
Batch Import & Auth Engine for Qwen Creative Proxy

核心功能：
1. 批量账号导入：读取 accounts.txt（支持普通密码、Outlook 自动收码格式）
2. 半自动人机协作：自动填入账号密码、自动抓取邮件验证码，如遇阿里滑块提示人工滑动一次
3. 双池全要素抓取：自动提取主站 Token 与画王 Studio 2K/视频 Cookies
4. 云端自动直连同步：抓取完毕后瞬间推送至云端 Render (https://my-ag-proxy.onrender.com)
5. 零成本 OpenAI API 转换：在任何客户端直接调用 2K 生图 (qwen-image-3.0) 与 视频 (happyhorse1.1)
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
DEFAULT_RENDER_URL = os.environ.get("RENDER_PROXY_URL", "https://my-ag-proxy.onrender.com")

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

def sync_account_to_cloud(account_id, cookies, auth_token, render_url=DEFAULT_RENDER_URL):
    """自动将提取成功的账号凭据推送到云端 Render 反代网关"""
    target_url = f"{render_url.rstrip('/')}/api/management/qwen-credential"
    payload = json.dumps({
        "name": account_id,
        "cookies": cookies,
        "auth_token": auth_token,
        "token": auth_token
    }).encode("utf-8")

    req = urllib.request.Request(
        target_url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "QwenBatchEngine/2.0"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("success"):
                print(f"☁️ [云端同步成功] 账号【{account_id}】已即刻注入 Render 云端反代账号池！")
                return True
            else:
                print(f"⚠️ 云端响应异常: {data}")
    except Exception as e:
        print(f"⚠️ 同步到云端失败 ({e})，凭证已完整保存在本地，稍后可统一备份导入。")
    return False

def export_cloud_env():
    """导出可直接复制到 Render / 云服务器环境变量的配置与 Base64 备份"""
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
API_KEYS=["sk-antigravity-secret-8888"]
"""
    with open(CLOUD_ENV_FILE, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"📄 本地凭据备份与云端环境变量已更新至: {CLOUD_ENV_FILE}")

def get_outlook_verification_code(client_id, refresh_token, wait_seconds=35):
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
            kwargs = {
                "headless": headless,
                "args": [
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-infobars"
                ]
            }
            if channel:
                kwargs["channel"] = channel
            browser = await p.chromium.launch(**kwargs)
            return browser
        except Exception:
            continue
    raise RuntimeError("未找到本地 Edge 或 Chrome 浏览器。")

async def login_and_extract_account(account_info, headless=False, render_url=DEFAULT_RENDER_URL):
    """自动登录并提取单个账号凭证"""
    email = account_info.get("email")
    password = account_info.get("password")
    client_id = account_info.get("client_id")
    refresh_token = account_info.get("refresh_token")

    print(f"\n============================================================")
    print(f"▶ 正在处理账号: {email}")
    print(f"============================================================")

    async with async_playwright() as p:
        browser = await launch_browser(p, headless=headless)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        page = await context.new_page()

        try:
            print("🌐 正在打开通义登录页面...")
            await page.goto("https://chat.qwen.ai/auth?action=signin", timeout=30000)
            await asyncio.sleep(2)

            # 1. 尝试自动填入邮箱
            if email:
                try:
                    email_input = await page.wait_for_selector('input[type="text"], input[type="email"], #username', timeout=8000)
                    if email_input:
                        await email_input.fill(email)
                        await page.keyboard.press("Enter")
                        await asyncio.sleep(2)
                except Exception:
                    pass

            # 2. 尝试自动填入密码
            if password:
                try:
                    pwd_input = await page.wait_for_selector('input[type="password"], #password', timeout=6000)
                    if pwd_input:
                        await pwd_input.fill(password)
                        await page.keyboard.press("Enter")
                        await asyncio.sleep(2)
                except Exception:
                    pass

            # 3. 如果配置了 Outlook Graph API 自动收码
            if client_id and refresh_token:
                print("📬 检测到已配置 Outlook Graph API，正在后台监听 6 位邮件验证码...")
                code = get_outlook_verification_code(client_id, refresh_token, wait_seconds=30)
                if code:
                    print(f"✅ 自动收取到通义千问验证码: 【{code}】，正在自动填入...")
                    try:
                        code_input = await page.wait_for_selector('input[maxlength="6"], input[placeholder*="验证码"]', timeout=6000)
                        if code_input:
                            await code_input.fill(code)
                            await page.keyboard.press("Enter")
                    except Exception as e:
                        print(f"自动填入验证码提示: {e}")
                else:
                    print("ℹ️ 未自动收到验证码，可能尚未发送或需要您手动触发发送验证码按钮。")

            # 4. 人机协作等待期（滑块 / 协议 / 人工确认）
            print("\n👀 [半自动观察提示]：")
            print("👉 如果页面弹出【阿里滑块验证码】，请直接在浏览器窗口中用鼠标滑一下；")
            print("👉 如果需要勾选【服务协议与隐私条款】，请在页面点击勾选并登录；")
            print("⏳ 脚本正在自动监听登录凭据（最长等待 120 秒）...")

            token = None
            account_name = email
            for check_step in range(60):
                await asyncio.sleep(2)
                try:
                    # 检查 localStorage 是否拿到 token
                    token_val = await page.evaluate("localStorage.getItem('token')")
                    if token_val and len(token_val) > 20:
                        token = token_val
                        user_info_raw = await page.evaluate("localStorage.getItem('user_info')")
                        if user_info_raw:
                            try:
                                u_info = json.loads(user_info_raw)
                                account_name = u_info.get("email") or u_info.get("name") or account_name
                            except Exception:
                                pass
                        break
                except Exception:
                    pass

            if not token:
                print(f"❌ 账号 {email} 登录超时或未完成。")
                await browser.close()
                return False

            print(f"🎉 登录成功！已捕获主站 Token（{account_name}）")
            print("🎨 正在直连画王 Studio (create.qwen.com) 激活 2K 原画与 5秒 视频凭证...")

            # 5. 访问画王 Studio 页面激活 Cookies
            await page.goto("https://create.qwen.com/r/ai-studio-pc-global/main/gen-image", timeout=25000)
            await asyncio.sleep(3)

            cookies = await context.cookies()
            cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies if "qwen" in c['domain']])

            qwen_refresh_token = ""
            for c in cookies:
                if c["name"] == "refresh_token":
                    qwen_refresh_token = c["value"]
                    break

            account_id = email or account_name or f"acc_{int(time.time())}"

            # 6. 本地存盘
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

            print(f"💾 本地存储成功：已加入本地账号池！")

            # 7. 自动推送到云端 Render
            sync_account_to_cloud(account_id, cookie_str, token, render_url=render_url)

            await browser.close()
            return True

        except Exception as e:
            print(f"❌ 处理账号 {email} 出错: {e}")
            try:
                await browser.close()
            except Exception:
                pass
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

async def run_batch_import(file_path=None, headless=False, render_url=DEFAULT_RENDER_URL):
    target_file = file_path or ACCOUNTS_TXT
    print("\n" + "=" * 65)
    print(" 🚀 通义千问多账号批量半自动提取与云端反代同步引擎")
    print("=" * 65)
    print(f"📡 目标云端反代网关: {render_url}")
    print(f"📂 读取账号数据源: {target_file}")
    
    if not os.path.exists(target_file):
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

    print(f"共发现 {len(accounts)} 个待处理账号，开始半自动流水线处理...")
    success_count = 0
    for idx, acc in enumerate(accounts, 1):
        print(f"\n[{idx}/{len(accounts)}] 即将处理: {acc['email']}")
        ok = await login_and_extract_account(acc, headless=headless, render_url=render_url)
        if ok:
            success_count += 1
        await asyncio.sleep(2)

    export_cloud_env()

    studios = load_json(STUDIO_ACCOUNTS_FILE, default=[])
    tokens = load_json(TOKENS_FILE, default=[])

    print("\n" + "=" * 65)
    print("✨ 全部账号流水线处理完毕！")
    print(f"📌 本次成功授权并同步: {success_count} / {len(accounts)} 个账号")
    print(f"📊 当前总账号池可用数: {len(studios)} 个")
    print(f"🎨 每日总免费生图能力: {len(studios) * 25} 张 2K 原画 (2048x2048)")
    print(f"🎬 每日总视频生成能力: {len(studios)} 条 5秒 HappyHorse 1.1 电影级视频")
    print(f"🌐 云端反代接口已就绪: {render_url}/v1")
    print(f"🔑 全局调用 API Key: sk-antigravity-secret-8888")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    file_arg = None
    headless_arg = False
    render_arg = DEFAULT_RENDER_URL

    for arg in sys.argv[1:]:
        if arg == "--headless":
            headless_arg = True
        elif arg.startswith("http://") or arg.startswith("https://"):
            render_arg = arg
        elif not arg.startswith("--"):
            file_arg = arg

    asyncio.run(run_batch_import(file_path=file_arg, headless=headless_arg, render_url=render_arg))
