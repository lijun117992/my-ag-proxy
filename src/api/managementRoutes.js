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
const DASHSCOPE_FILE = path.join(SESSION_DIR, 'dashscope.json');

// 启动时自动检查 dashscope.json 并载入环境变量
if (fs.existsSync(DASHSCOPE_FILE)) {
    try {
        const d = JSON.parse(fs.readFileSync(DASHSCOPE_FILE, 'utf8'));
        if (d.api_key && !process.env.DASHSCOPE_API_KEY) {
            process.env.DASHSCOPE_API_KEY = d.api_key;
        }
    } catch (e) {}
}

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
    if (!process.env.DASHSCOPE_API_KEY && fs.existsSync(DASHSCOPE_FILE)) {
        try {
            const d = JSON.parse(fs.readFileSync(DASHSCOPE_FILE, 'utf8'));
            if (d.api_key) process.env.DASHSCOPE_API_KEY = d.api_key;
        } catch (e) {}
    }

    const studios = loadJson(STUDIO_FILE, []);
    const tokens = loadJson(TOKENS_FILE, []);

    const allIds = Array.from(new Set([
        ...studios.map(s => s.id),
        ...tokens.map(t => t.id)
    ]));

    let validStudioCount = 0;
    let validChatCount = 0;

    const accounts = allIds.map(id => {
        const studio = studios.find(s => s.id === id);
        const token = tokens.find(t => t.id === id);
        const hasStudio = Boolean(studio && (studio.auth_token || studio.cookies));
        const hasChat = Boolean(token?.token && !token?.invalid);
        if (hasStudio) validStudioCount++;
        if (hasChat) validChatCount++;

        return {
            id,
            name: studio?.name || id,
            hasStudio,
            hasChat,
            hasCookies: Boolean(studio?.cookies),
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
        validStudioCount,
        validChatCount,
        dashscopeConfigured: Boolean(process.env.DASHSCOPE_API_KEY),
        summary: {
            total2kImagesPerDay: validStudioCount * 25,
            totalVideosPerDay: validStudioCount * 1,
            totalChatImagesPerDay: validChatCount * 40
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

// 3. 直接录入通义千问 Cookie / Token 凭证
router.post('/qwen-credential', (req, res) => {
    const { name, cookies, auth_token, token } = req.body;
    if (!cookies && !auth_token && !token) {
        return res.status(400).json({ error: '请至少提供通义千问 Cookie、auth_token 或 JWT Token 中的一项' });
    }

    const id = (name || '').trim() || `qwen_acc_${Date.now()}`;
    const studios = loadJson(STUDIO_FILE, []);
    const tokens = loadJson(TOKENS_FILE, []);

    // 尝试从 Cookie 中提取 refresh_token
    let cookieRefreshToken = '';
    if (cookies) {
        const match = cookies.match(/refresh_token=([^;]+)/);
        if (match) cookieRefreshToken = match[1];
    }

    const finalToken = (auth_token || token || cookieRefreshToken || '').trim();

    // 更新 Studio 账号池
    const existingStudioIdx = studios.findIndex(s => s.id === id || s.name === id);
    const studioEntry = {
        id,
        name: id,
        auth_token: finalToken,
        refresh_token: cookieRefreshToken || (existingStudioIdx >= 0 ? studios[existingStudioIdx].refresh_token : ''),
        cookies: cookies ? cookies.trim() : (existingStudioIdx >= 0 ? studios[existingStudioIdx].cookies : ''),
        daily_credits: 50,
        cost_per_image: 2,
        status: 'active',
        updated_at: new Date().toISOString()
    };

    if (existingStudioIdx >= 0) {
        studios[existingStudioIdx] = { ...studios[existingStudioIdx], ...studioEntry };
    } else {
        studios.push(studioEntry);
    }
    saveJson(STUDIO_FILE, studios);

    // 同步更新主站对话 Token 池
    if (finalToken) {
        const existingTokenIdx = tokens.findIndex(t => t.id === id);
        const tokenEntry = {
            id,
            token: finalToken,
            added_at: new Date().toISOString(),
            invalid: false,
            resetAt: null
        };
        if (existingTokenIdx >= 0) {
            tokens[existingTokenIdx] = { ...tokens[existingTokenIdx], ...tokenEntry };
        } else {
            tokens.push(tokenEntry);
        }
        saveJson(TOKENS_FILE, tokens);
    }

    res.json({
        success: true,
        message: `成功录入通义千问凭证【${id}】！2K 原画与视频生成通道已即刻激活。`,
        account: studioEntry
    });
});

// 4. 一键配置并保存 DashScope (阿里云百炼) 密钥
router.post('/dashscope-key', (req, res) => {
    const { api_key } = req.body;
    if (!api_key || typeof api_key !== 'string') {
        return res.status(400).json({ error: '请提供有效的 API Key (例如 sk-...)' });
    }
    const cleanKey = api_key.trim();
    process.env.DASHSCOPE_API_KEY = cleanKey;
    saveJson(DASHSCOPE_FILE, { api_key: cleanKey, updated_at: new Date().toISOString() });
    res.json({ success: true, message: 'DashScope API Key 已成功保存并在云端即时生效！' });
});

// 5. 批量解析并入库账号
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
            status: '已录入微软 Graph 自动取件池'
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

// 6. 导出与备份全量凭证池（包含 Antigravity、Qwen Studio、Tokens、DashScope 等所有凭据）
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

    // 附带打包通义千问与 DashScope 配置
    if (fs.existsSync(STUDIO_FILE)) {
        const content = fs.readFileSync(STUDIO_FILE, 'utf8');
        contentsMap['__session_studio_accounts.json'] = content;
        files.push({ filename: '通义千问 Studio 凭证 (studio_accounts.json)', dir: 'session', size: fs.statSync(STUDIO_FILE).size });
    }
    if (fs.existsSync(TOKENS_FILE)) {
        const content = fs.readFileSync(TOKENS_FILE, 'utf8');
        contentsMap['__session_tokens.json'] = content;
        files.push({ filename: '通义千问主站对话 Token (tokens.json)', dir: 'session', size: fs.statSync(TOKENS_FILE).size });
    }
    if (fs.existsSync(DASHSCOPE_FILE)) {
        const content = fs.readFileSync(DASHSCOPE_FILE, 'utf8');
        contentsMap['__session_dashscope.json'] = content;
        files.push({ filename: '阿里云百炼 DashScope 密钥 (dashscope.json)', dir: 'session', size: fs.statSync(DASHSCOPE_FILE).size });
    }

    const backupB64 = Buffer.from(JSON.stringify(contentsMap)).toString('base64');

    res.json({
        success: true,
        count: files.length,
        files,
        backup_b64: files.length > 0 ? backupB64 : null
    });
});

// 7. 还原全量凭据池
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
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    let restored = 0;
    Object.entries(targetMap).forEach(([fname, content]) => {
        const strContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        if (fname === '__session_studio_accounts.json') {
            fs.writeFileSync(STUDIO_FILE, strContent, 'utf8');
            restored++;
        } else if (fname === '__session_tokens.json') {
            fs.writeFileSync(TOKENS_FILE, strContent, 'utf8');
            restored++;
        } else if (fname === '__session_dashscope.json') {
            fs.writeFileSync(DASHSCOPE_FILE, strContent, 'utf8');
            try {
                const parsed = JSON.parse(strContent);
                if (parsed.api_key) process.env.DASHSCOPE_API_KEY = parsed.api_key;
            } catch (e) {}
            restored++;
        } else if (fname.endsWith('.json')) {
            fs.writeFileSync(path.join(authDir, fname), strContent, 'utf8');
            restored++;
        }
    });

    res.json({
        success: true,
        restored,
        message: `成功还原 ${restored} 个持久化凭据文件！`
    });
});

export default router;
