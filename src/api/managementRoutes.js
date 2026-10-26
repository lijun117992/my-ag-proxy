import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchOutlookVerificationCode } from '../utils/outlookReceiver.js';
import { generateStudioImage, generateStudioVideo } from './qwenStudio.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.resolve(__dirname, '..', '..', 'session');
const STUDIO_FILE = path.join(SESSION_DIR, 'studio_accounts.json');
const TOKENS_FILE = path.join(SESSION_DIR, 'tokens.json');

function loadJson(file, fallback = []) {
    if (file === STUDIO_FILE && process.env.STUDIO_ACCOUNTS_JSON) {
        try { return JSON.parse(process.env.STUDIO_ACCOUNTS_JSON); } catch (e) {}
    }
    if (file === TOKENS_FILE && process.env.TOKENS_JSON) {
        try { return JSON.parse(process.env.TOKENS_JSON); } catch (e) {}
    }
    if (!fs.existsSync(file)) return fallback;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return fallback;
    }
}

function saveJson(file, data) {
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// 1. 获取账号池概况与配额
router.get('/accounts', (req, res) => {
    const studios = loadJson(STUDIO_FILE, []);
    const tokens = loadJson(TOKENS_FILE, []);

    const allIds = Array.from(new Set([
        ...studios.map(s => s.id),
        ...tokens.map(t => t.id)
    ]));

    const accounts = allIds.map(id => {
        const studio = studios.find(s => s.id === id);
        const token = tokens.find(t => t.id === id);
        return {
            id,
            name: studio?.name || id,
            hasStudio: Boolean(studio?.auth_token),
            hasChat: Boolean(token?.token && !token?.invalid),
            dailyCredits: studio?.daily_credits || 50,
            imageCapacity2k: 25,
            videoCapacityHappyHorse: 1,
            chatImageCapacity: 40,
            updatedAt: studio?.updated_at || token?.added_at || new Date().toISOString()
        };
    });

    const totalAccounts = accounts.length;
    res.json({
        success: true,
        totalAccounts,
        summary: {
            total2kImagesPerDay: totalAccounts * 25,
            totalVideosPerDay: totalAccounts * 1,
            totalChatImagesPerDay: totalAccounts * 40
        },
        accounts
    });
});

// 2. 测试 Outlook Graph API 自动取件
router.post('/fetch-code', async (req, res) => {
    const { client_id, refresh_token } = req.body;
    if (!client_id || !refresh_token) {
        return res.status(400).json({ error: '缺少 client_id 或 refresh_token' });
    }

    try {
        const code = await fetchOutlookVerificationCode(client_id, refresh_token, 15);
        if (code) {
            return res.json({ success: true, code, message: '成功自动收取验证码！' });
        }
        return res.json({ success: false, message: '未检测到来自 Qwen 的最新验证码邮件（或仍在接收中）。' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 3. 批量解析并入库账号
router.post('/import', async (req, res) => {
    const { raw_text } = req.body;
    if (!raw_text || typeof raw_text !== 'string') {
        return res.status(400).json({ error: '请提供待导入的账号文本' });
    }

    const lines = raw_text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const parsedAccounts = [];

    for (const line of lines) {
        const parts = line.split('----').map(p => p.trim());
        if (parts.length >= 2) {
            const acc = {
                email: parts[0],
                password: parts[1]
            };
            if (parts.length >= 4) {
                acc.client_id = parts[2];
                acc.refresh_token = parts[3];
            }
            parsedAccounts.push(acc);
        }
    }

    if (!parsedAccounts.length) {
        return res.status(400).json({ error: '未能解析出有效账号，请检查格式 (邮箱----密码----client_id----refresh_token)' });
    }

    // 针对每个解析出的账号，优先检查 Graph API 取件能力
    const results = [];
    const studios = loadJson(STUDIO_FILE, []);
    const tokens = loadJson(TOKENS_FILE, []);

    for (const acc of parsedAccounts) {
        let codeCheck = null;
        if (acc.client_id && acc.refresh_token) {
            try {
                codeCheck = await fetchOutlookVerificationCode(acc.client_id, acc.refresh_token, 5);
            } catch (e) {}
        }

        const existingIdx = studios.findIndex(s => s.id === acc.email || s.name === acc.email);
        const studioEntry = {
            id: acc.email,
            name: acc.email,
            email: acc.email,
            password: acc.password,
            client_id: acc.client_id,
            refresh_token: acc.refresh_token,
            auth_token: acc.refresh_token,
            daily_credits: 50,
            has_graph: Boolean(acc.client_id && acc.refresh_token),
            status: 'active',
            updated_at: new Date().toISOString()
        };

        if (existingIdx >= 0) {
            studios[existingIdx] = { ...studios[existingIdx], ...studioEntry };
        } else {
            studios.push(studioEntry);
        }

        results.push({
            email: acc.email,
            hasGraphApi: Boolean(acc.client_id && acc.refresh_token),
            lastCodeFound: codeCheck || '就绪 (可随时自动取件)',
            status: '已录入并激活'
        });
    }

    saveJson(STUDIO_FILE, studios);

    res.json({
        success: true,
        importedCount: parsedAccounts.length,
        results,
        message: `成功解析并录入 ${parsedAccounts.length} 个账号！已打通微软 Graph API 自动取件通道。`
    });
});

// 4. 导出与备份凭证池（防止 Render 免费实例重启重置）
router.get('/auths-backup', (req, res) => {
    const authDir = '/data/auths';
    const altDir = '/root/.cli-proxy-api';
    const dirsToCheck = [authDir, altDir].filter(d => fs.existsSync(d));

    const files = [];
    const contentsMap = {};

    dirsToCheck.forEach(d => {
        try {
            const list = fs.readdirSync(d);
            list.forEach(fname => {
                const fullPath = path.join(d, fname);
                const stat = fs.statSync(fullPath);
                if (stat.isFile() && fname.endsWith('.json')) {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    files.push({
                        filename: fname,
                        dir: d,
                        size: stat.size,
                        modified: stat.mtime
                    });
                    contentsMap[fname] = content;
                }
            });
        } catch (e) {}
    });

    const backupB64 = Buffer.from(JSON.stringify(contentsMap)).toString('base64');

    res.json({
        success: true,
        count: files.length,
        files,
        backup_b64: files.length > 0 ? backupB64 : null
    });
});

// 5. 还原凭据池
router.post('/auths-restore', (req, res) => {
    const { backup_b64, files } = req.body;
    let targetMap = files || {};

    if (backup_b64) {
        try {
            targetMap = JSON.parse(Buffer.from(backup_b64, 'base64').toString('utf8'));
        } catch (e) {
            return res.status(400).json({ error: '无效的 Base64 凭据备份字符串' });
        }
    }

    const authDir = '/data/auths';
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

    let restored = 0;
    Object.entries(targetMap).forEach(([fname, content]) => {
        if (fname.endsWith('.json')) {
            fs.writeFileSync(path.join(authDir, fname), typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8');
            restored++;
        }
    });

    res.json({
        success: true,
        restored,
        message: `成功还原 ${restored} 个凭据文件至 /data/auths！`
    });
});

export default router;
