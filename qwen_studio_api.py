"""
Qwen Studio API (Qwen-Image 3.0 2K) Engine
Direct reverse proxy for https://create.qwen.com
Supports 2048x2048 2K photorealistic image generation with 30-day session management.
"""

import os
import sys
import json
import time
import uuid
import urllib.request
import urllib.error

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ACCOUNTS_FILE = os.path.join(CURRENT_DIR, "session", "studio_accounts.json")

def load_accounts():
    if not os.path.exists(ACCOUNTS_FILE):
        return []
    with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_accounts(accounts):
    os.makedirs(os.path.dirname(ACCOUNTS_FILE), exist_ok=True)
    with open(ACCOUNTS_FILE, "w", encoding="utf-8") as f:
        json.dump(accounts, f, indent=2, ensure_ascii=False)

def get_active_account():
    accounts = load_accounts()
    if not accounts:
        raise ValueError(f"No accounts found in {ACCOUNTS_FILE}")
    return accounts[0]

def create_task(prompt, size="1:1", resolution="2K", account=None):
    if account is None:
        account = get_active_account()

    req_id = "req-" + str(uuid.uuid4())
    ts = int(time.time() * 1000)
    url = f"https://sg-quark-ai-studio.qwen.com/api/web/ai/image/function?biz_id=ai_image&pr=kkpcweb&fr=win&ai_ts={ts}&req_id={req_id}"

    headers = {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        "authorization": f"Bearer {account['auth_token']}",
        "content-type": "application/json",
        "Cookie": account["cookies"],
        "origin": "https://create.qwen.com",
        "referer": "https://create.qwen.com/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
    }

    body = {
        "model": "qwen3",
        "rootModel": "qwen3",
        "reqId": req_id,
        "prompt": prompt,
        "materialId": "",
        "from": "ai_create_sidebar",
        "params": {
            "size": size,
            "num": 1,
            "features": ["qwen_image_3"],
            "attachments": [],
            "resolution": resolution,
            "creditRuleVersion": 2
        },
        "chid": str(uuid.uuid4()).replace("-", ""),
        "browserId": "cba03f31bda36004b53888e60bf1b6ed",
        "platform": "pc",
        "language": "zh-CN"
    }

    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        if not res.get("success"):
            raise RuntimeError(f"Qwen Studio Task Submission Failed: {res}")
        record_id = res["data"]["recordId"]
        return record_id

def poll_result(record_id, account=None, max_attempts=40, interval=3):
    if account is None:
        account = get_active_account()

    data = json.dumps({
        "items": [{"recordId": record_id, "scene": "qwen3_t2i"}],
        "req_id": f"poll-{record_id[:8]}",
        "chid": f"poll-{record_id[:8]}",
        "browserId": "cba03f31bda36004b53888e60bf1b6ed",
        "platform": "pc",
        "language": "zh-CN"
    }).encode("utf-8")

    headers = {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        "authorization": f"Bearer {account['auth_token']}",
        "content-type": "application/json",
        "Cookie": account["cookies"],
        "origin": "https://create.qwen.com",
        "referer": "https://create.qwen.com/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
    }

    for attempt in range(max_attempts):
        time.sleep(interval)
        ts = int(time.time() * 1000)
        url = f"https://sg-quark-ai-studio.qwen.com/api/web/assets/v1/batch/get?biz_id=ai_image&pr=kkpcweb&fr=win&ai_ts={ts}&req_id=poll-{record_id[:8]}"
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                item = res.get("data", {}).get("list", [{}])[0]
                status = item.get("content", {}).get("status")
                # status 1 = completed, 2 = generating
                if status == 1:
                    images = item.get("content", {}).get("extra", {}).get("result_images", [])
                    if images:
                        img = images[0]
                        return {
                            "success": True,
                            "record_id": record_id,
                            "url": img.get("cdn_url") or img.get("url"),
                            "download_url": img.get("download_url"),
                            "thumbnail_url": img.get("thumbnail_url"),
                            "width": img.get("width", 2048),
                            "height": img.get("height", 2048)
                        }
        except Exception as e:
            pass

    raise TimeoutError(f"Generation timed out after {max_attempts * interval}s for recordId {record_id}")

def generate_image(prompt, size="1:1", resolution="2K", save_path=None):
    print(f"[Qwen Studio] Dispatching: '{prompt}' (Size: {size}, Res: {resolution})...")
    record_id = create_task(prompt, size=size, resolution=resolution)
    print(f"[Qwen Studio] Task recordId: {record_id}. Polling progress...")
    result = poll_result(record_id)
    print(f"[Qwen Studio] Complete! Image URL: {result['url']}")

    if save_path:
        os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)
        download_target = result.get("download_url") or result["url"]
        urllib.request.urlretrieve(download_target, save_path)
        result["local_path"] = os.path.abspath(save_path)
        print(f"[Qwen Studio] Saved image to: {result['local_path']}")

    return result

if __name__ == "__main__":
    prompt_arg = sys.argv[1] if len(sys.argv) > 1 else "A magical forest cottage with glowing fairy lanterns, 2k octane render"
    out_file = sys.argv[2] if len(sys.argv) > 2 else os.path.join(CURRENT_DIR, "output_latest.png")
    res = generate_image(prompt_arg, save_path=out_file)
    print(json.dumps(res, indent=2, ensure_ascii=False))
