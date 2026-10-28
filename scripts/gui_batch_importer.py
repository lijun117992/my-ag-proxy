"""
通义千问多账号批量提取与云端同步桌面可视化工具
Qwen Creative Proxy - Desktop Batch Importer GUI
"""

import os
import sys
import json
import time
import re
import asyncio
import threading
import webbrowser
import urllib.request
import urllib.parse
from datetime import datetime

import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext

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

def get_outlook_verification_code(client_id, refresh_token, wait_seconds=35, log_cb=print):
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
        log_cb(f"⚠️ 获取 Outlook access_token 失败: {e}")
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

def sync_account_to_cloud(account_id, cookies, auth_token, render_url=DEFAULT_RENDER_URL, log_cb=print):
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
        headers={"Content-Type": "application/json", "User-Agent": "QwenDesktopGUI/2.0"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("success"):
                log_cb(f"☁️ [云端同步成功] 账号【{account_id}】已即刻注入 Render 云端反代账号池！")
                return True
            else:
                log_cb(f"⚠️ 云端响应异常: {data}")
    except Exception as e:
        log_cb(f"⚠️ 同步到云端失败 ({e})，凭证已保存在本地。")
    return False

class BatchImporterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("🚀 通义千问多账号批量提取与云端反代同步工具")
        self.root.geometry("860x700")
        self.root.minsize(780, 600)
        self.root.configure(bg="#f8fafc")

        self.is_running = False

        self.setup_styles()
        self.build_ui()
        self.load_initial_accounts()

    def setup_styles(self):
        style = ttk.Style()
        style.theme_use('clam')
        style.configure("TLabel", background="#f8fafc", font=("Segoe UI", 10))
        style.configure("Header.TLabel", font=("Segoe UI", 14, "bold"), foreground="#0f172a", background="#f8fafc")
        style.configure("SubHeader.TLabel", font=("Segoe UI", 9), foreground="#64748b", background="#f8fafc")
        style.configure("Primary.TButton", font=("Segoe UI", 10, "bold"), background="#10b981", foreground="#ffffff")

    def build_ui(self):
        # 1. 顶部 Header
        header_frame = tk.Frame(self.root, bg="#f8fafc", pady=12, padx=16)
        header_frame.pack(fill=tk.X)

        title = tk.Label(header_frame, text="⚡ 通义千问多账号半自动提取与云端反代同步", font=("Segoe UI", 15, "bold"), bg="#f8fafc", fg="#0f172a")
        title.pack(anchor="w")

        desc = tk.Label(header_frame, text="支持输入批量邮箱密码（或 Outlook 自动收码格式），自动打开浏览器完成授权与 2K 原画 / 视频 Cookies 抓取，秒级同步到云端！", font=("Segoe UI", 9), bg="#f8fafc", fg="#64748b")
        desc.pack(anchor="w", pady=(2, 8))

        # 目标网关设置
        url_frame = tk.Frame(header_frame, bg="#f8fafc")
        url_frame.pack(fill=tk.X)
        tk.Label(url_frame, text="🌐 云端反代网关：", font=("Segoe UI", 9, "bold"), bg="#f8fafc", fg="#334155").pack(side=tk.LEFT)
        self.url_entry = tk.Entry(url_frame, font=("Consolas", 10), bg="#ffffff", fg="#0f172a", relief="solid", bd=1)
        self.url_entry.insert(0, DEFAULT_RENDER_URL)
        self.url_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=6)

        btn_open_web = tk.Button(url_frame, text="🖥️ 打开控制台", font=("Segoe UI", 9), bg="#e2e8f0", fg="#0f172a", relief="flat", padx=10, command=self.open_console_web)
        btn_open_web.pack(side=tk.LEFT)

        # 2. 中部：账号输入区
        mid_frame = tk.Frame(self.root, bg="#f8fafc", padx=16)
        mid_frame.pack(fill=tk.BOTH, expand=False, pady=(0, 10))

        input_title_frame = tk.Frame(mid_frame, bg="#f8fafc")
        input_title_frame.pack(fill=tk.X, pady=(0, 4))
        tk.Label(input_title_frame, text="📝 请在下方粘贴您的账号列表（一行一个，支持两种格式）：", font=("Segoe UI", 10, "bold"), bg="#f8fafc", fg="#1e293b").pack(side=tk.LEFT)
        tk.Label(input_title_frame, text="格式1: 邮箱----密码  |  格式2: 邮箱----密码----client_id----refresh_token", font=("Segoe UI", 8), bg="#f8fafc", fg="#94a3b8").pack(side=tk.RIGHT)

        self.accounts_text = scrolledtext.ScrolledText(mid_frame, height=9, font=("Consolas", 9.5), bg="#ffffff", fg="#0f172a", relief="solid", bd=1)
        self.accounts_text.pack(fill=tk.X)

        # 3. 操作按钮区
        btn_bar = tk.Frame(self.root, bg="#f8fafc", padx=16, pady=4)
        btn_bar.pack(fill=tk.X)

        self.btn_start = tk.Button(
            btn_bar,
            text="🚀 开始批量提取与云端同步 (半自动监护)",
            font=("Segoe UI", 11, "bold"),
            bg="#10b981",
            fg="#ffffff",
            activebackground="#059669",
            activeforeground="#ffffff",
            relief="flat",
            padx=20,
            pady=8,
            cursor="hand2",
            command=self.start_batch_process
        )
        self.btn_start.pack(side=tk.LEFT)

        btn_save_txt = tk.Button(btn_bar, text="💾 保存到 accounts.txt", font=("Segoe UI", 9), bg="#f1f5f9", fg="#334155", relief="flat", padx=12, pady=8, command=self.save_accounts_file)
        btn_save_txt.pack(side=tk.LEFT, padx=10)

        btn_clear_log = tk.Button(btn_bar, text="🧹 清空日志", font=("Segoe UI", 9), bg="#f1f5f9", fg="#64748b", relief="flat", padx=10, pady=8, command=self.clear_logs)
        btn_clear_log.pack(side=tk.RIGHT)

        # 4. 底部：实时运行日志
        log_frame = tk.Frame(self.root, bg="#f8fafc", padx=16, pady=6)
        log_frame.pack(fill=tk.BOTH, expand=True)

        tk.Label(log_frame, text="📋 实时执行日志与风控交互提示：", font=("Segoe UI", 9, "bold"), bg="#f8fafc", fg="#475569").pack(anchor="w", pady=(0, 4))
        self.log_text = scrolledtext.ScrolledText(log_frame, font=("Consolas", 9), bg="#0f172a", fg="#f1f5f9", insertbackground="#ffffff", relief="solid", bd=1)
        self.log_text.pack(fill=tk.BOTH, expand=True)

    def log(self, message):
        """线程安全的日志追加"""
        def _append():
            ts = datetime.now().strftime("%H:%M:%S")
            self.log_text.insert(tk.END, f"[{ts}] {message}\n")
            self.log_text.see(tk.END)
        self.root.after(0, _append)

    def clear_logs(self):
        self.log_text.delete("1.0", tk.END)

    def open_console_web(self):
        url = self.url_entry.get().strip()
        if not url.endswith("/management.html"):
            url = f"{url.rstrip('/')}/management.html"
        webbrowser.open(url)

    def load_initial_accounts(self):
        if os.path.exists(ACCOUNTS_TXT):
            try:
                with open(ACCOUNTS_TXT, "r", encoding="utf-8") as f:
                    content = f.read()
                self.accounts_text.insert(tk.END, content)
                self.log(f"已自动载入历史账号文件: {ACCOUNTS_TXT}")
            except Exception as e:
                self.log(f"载入 accounts.txt 异常: {e}")
        else:
            sample = (
                "# 在此直接粘贴您的账号，一行一个\n"
                "# 格式 1：邮箱----密码\n"
                "# 格式 2：邮箱----密码----client_id----refresh_token\n"
            )
            self.accounts_text.insert(tk.END, sample)

    def save_accounts_file(self):
        content = self.accounts_text.get("1.0", tk.END).strip()
        try:
            with open(ACCOUNTS_TXT, "w", encoding="utf-8") as f:
                f.write(content + "\n")
            messagebox.showinfo("成功", f"账号已成功保存至本地文件：\n{ACCOUNTS_TXT}")
            self.log(f"已保存到: {ACCOUNTS_TXT}")
        except Exception as e:
            messagebox.showerror("错误", f"保存失败: {e}")

    def parse_input_accounts(self):
        content = self.accounts_text.get("1.0", tk.END)
        lines = content.splitlines()
        accounts = []
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split("----")]
            if len(parts) >= 2:
                acc = {"email": parts[0], "password": parts[1]}
                if len(parts) >= 4:
                    acc["client_id"] = parts[2]
                    acc["refresh_token"] = parts[3]
                accounts.append(acc)
        return accounts

    def start_batch_process(self):
        if self.is_running:
            messagebox.showwarning("提示", "当前已有任务正在执行，请等待完成。")
            return

        accounts = self.parse_input_accounts()
        if not accounts:
            messagebox.showwarning("提示", "未检测到有效账号行，请在输入框中填入账号 (邮箱----密码)。")
            return

        render_url = self.url_entry.get().strip() or DEFAULT_RENDER_URL

        # 自动存盘
        self.save_accounts_file()

        self.is_running = True
        self.btn_start.configure(text="⏳ 正在流水线提取中...", bg="#94a3b8", state=tk.DISABLED)

        # 启动后台线程执行 Playwright
        threading.Thread(target=self._run_thread_worker, args=(accounts, render_url), daemon=True).start()

    def _run_thread_worker(self, accounts, render_url):
        self.log(f"🚀 开始批量处理 {len(accounts)} 个账号...")
        self.log(f"🎯 云端同步目标: {render_url}")

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._async_batch_worker(accounts, render_url))
        except Exception as e:
            self.log(f"❌ 批量流程未处理异常: {e}")
        finally:
            loop.close()
            self.root.after(0, self._on_finish)

    def _on_finish(self):
        self.is_running = False
        self.btn_start.configure(text="🚀 开始批量提取与云端同步 (半自动监护)", bg="#10b981", state=tk.NORMAL)
        messagebox.showinfo("完成", "全部账号批量处理流程已结束！\n请查看日志与云端账号池。")

    async def _async_batch_worker(self, accounts, render_url):
        from playwright.async_api import async_playwright

        success_count = 0

        async with async_playwright() as p:
            for idx, acc in enumerate(accounts, 1):
                email = acc.get("email")
                pwd = acc.get("password")
                cid = acc.get("client_id")
                rt = acc.get("refresh_token")

                self.log(f"\n==================================================")
                self.log(f"▶ [{idx}/{len(accounts)}] 正在处理: {email}")
                self.log(f"==================================================")

                browser = None
                try:
                    for channel in ["msedge", "chrome", None]:
                        try:
                            browser = await p.chromium.launch(
                                headless=False,
                                channel=channel,
                                args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
                            )
                            break
                        except Exception:
                            continue

                    if not browser:
                        self.log("❌ 无法启动本地 Edge 或 Chrome 浏览器。")
                        continue

                    context = await browser.new_context(
                        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
                        viewport={"width": 1280, "height": 800}
                    )
                    page = await context.new_page()

                    self.log("🌐 打开登录页: https://chat.qwen.ai/auth?action=signin ...")
                    await page.goto("https://chat.qwen.ai/auth?action=signin", timeout=30000)
                    await asyncio.sleep(2)

                    # 1. 自动填入账号
                    if email:
                        try:
                            email_input = await page.wait_for_selector('input[type="text"], input[type="email"], #username', timeout=6000)
                            if email_input:
                                await email_input.fill(email)
                                await page.keyboard.press("Enter")
                                await asyncio.sleep(2)
                        except Exception:
                            pass

                    # 2. 自动填入密码
                    if pwd:
                        try:
                            pwd_input = await page.wait_for_selector('input[type="password"], #password', timeout=5000)
                            if pwd_input:
                                await pwd_input.fill(pwd)
                                await page.keyboard.press("Enter")
                                await asyncio.sleep(2)
                        except Exception:
                            pass

                    # 3. Outlook Graph API 自动收码
                    if cid and rt:
                        self.log("📬 检测到 Outlook 凭证，后台自动接收 6 位验证码...")
                        code = get_outlook_verification_code(cid, rt, wait_seconds=30, log_cb=self.log)
                        if code:
                            self.log(f"✅ 自动收到验证码: 【{code}】，正在自动填入...")
                            try:
                                code_input = await page.wait_for_selector('input[maxlength="6"], input[placeholder*="验证码"]', timeout=6000)
                                if code_input:
                                    await code_input.fill(code)
                                    await page.keyboard.press("Enter")
                            except Exception as e:
                                self.log(f"填入验证码提示: {e}")

                    # 4. 人机协作等待提示
                    self.log("👀 [协作提示] 若弹窗要求【滑块验证】请在浏览器窗口手动滑一下；若需勾选协议请点击勾选。")
                    self.log("⏳ 正在监听登录成功凭证 (最长等待 120 秒)...")

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
                                        account_name = u_info.get("email") or u_info.get("name") or account_name
                                    except Exception:
                                        pass
                                break
                        except Exception:
                            pass

                    if not token:
                        self.log(f"❌ 账号 {email} 登录超时或未完成。")
                        await browser.close()
                        continue

                    self.log(f"🎉 登录成功！捕获主站 Token")
                    self.log("🎨 直连画王 Studio 激活 2K 原画与 5秒 视频 Cookies...")

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

                    # 存盘本地
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

                    self.log(f"💾 本地账号池已入库！")

                    # 自动推送到云端
                    synced = sync_account_to_cloud(account_id, cookie_str, token, render_url=render_url, log_cb=self.log)
                    if synced:
                        success_count += 1

                    await browser.close()
                    await asyncio.sleep(1)

                except Exception as err:
                    self.log(f"❌ 处理账号 {email} 异常: {err}")
                    if browser:
                        try:
                            await browser.close()
                        except Exception:
                            pass

        self.log(f"\n==================================================")
        self.log(f"🏆 流水线结束！本次成功同步账号: {success_count} / {len(accounts)} 个")
        self.log(f"🌐 任何客户端直接调用: {render_url}/v1")
        self.log(f"🔑 API Key: sk-antigravity-secret-8888")
        self.log(f"==================================================")

def main():
    root = tk.Tk()
    app = BatchImporterApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
