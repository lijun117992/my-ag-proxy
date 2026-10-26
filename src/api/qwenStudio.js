import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import crypto from 'crypto';
import { logInfo, logError, logDebug } from '../logger/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACCOUNTS_FILE = path.resolve(__dirname, '..', '..', 'session', 'studio_accounts.json');

function loadStudioAccounts() {
    if (process.env.STUDIO_ACCOUNTS_JSON) {
        try {
            const parsed = JSON.parse(process.env.STUDIO_ACCOUNTS_JSON);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) {
            logError('Error parsing STUDIO_ACCOUNTS_JSON env', e);
        }
    }
    if (!fs.existsSync(ACCOUNTS_FILE)) {
        logError(`Studio accounts file not found at: ${ACCOUNTS_FILE}`);
        return [];
    }
    try {
        return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    } catch (e) {
        logError('Error reading studio_accounts.json', e);
        return [];
    }
}

export function hasStudioAccount() {
    const accs = loadStudioAccounts();
    return accs.length > 0 && Boolean(accs[0].auth_token && accs[0].cookies);
}

export async function generateStudioImage(prompt, options = {}) {
    const accounts = loadStudioAccounts();
    if (!accounts.length) {
        throw new Error(`No studio accounts configured in ${ACCOUNTS_FILE}`);
    }
    const account = accounts[0];

    const size = options.size || '1:1';
    const resolution = options.resolution || '2K';
    const reqId = 'req-' + crypto.randomUUID();
    const ts = Date.now();

    const submitUrl = `https://sg-quark-ai-studio.qwen.com/api/web/ai/image/function?biz_id=ai_image&pr=kkpcweb&fr=win&ai_ts=${ts}&req_id=${reqId}`;

    const headers = {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'authorization': `Bearer ${account.auth_token}`,
        'content-type': 'application/json',
        'Cookie': account.cookies,
        'origin': 'https://create.qwen.com',
        'referer': 'https://create.qwen.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'
    };

    const submitPayload = {
        model: 'qwen3',
        rootModel: 'qwen3',
        reqId: reqId,
        prompt: prompt,
        materialId: '',
        from: 'ai_create_sidebar',
        params: {
            size: size,
            num: 1,
            features: ['qwen_image_3'],
            attachments: [],
            resolution: resolution,
            creditRuleVersion: 2
        },
        chid: crypto.randomUUID().replace(/-/g, ''),
        browserId: 'cba03f31bda36004b53888e60bf1b6ed',
        platform: 'pc',
        language: 'zh-CN'
    };

    logInfo(`[Qwen Studio] Submitting task: "${prompt}" (Res: ${resolution}, Size: ${size})`);

    const submitResp = await axios.post(submitUrl, submitPayload, { headers, timeout: 30000 });
    const submitData = submitResp.data;

    if (!submitData || !submitData.success || !submitData.data?.recordId) {
        throw new Error(`Task submission failed: ${JSON.stringify(submitData)}`);
    }

    const recordId = submitData.data.recordId;
    logInfo(`[Qwen Studio] Task recordId: ${recordId}. Polling status...`);

    const pollPayload = {
        items: [{ recordId: recordId, scene: 'qwen3_t2i' }],
        req_id: `poll-${recordId.substring(0, 8)}`,
        chid: `poll-${recordId.substring(0, 8)}`,
        browserId: 'cba03f31bda36004b53888e60bf1b6ed',
        platform: 'pc',
        language: 'zh-CN'
    };

    const maxAttempts = options.maxAttempts || 45;
    const interval = options.interval || 3000;

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, interval));
        const pollTs = Date.now();
        const pollUrl = `https://sg-quark-ai-studio.qwen.com/api/web/assets/v1/batch/get?biz_id=ai_image&pr=kkpcweb&fr=win&ai_ts=${pollTs}&req_id=poll-${recordId.substring(0, 8)}`;

        try {
            const pollResp = await axios.post(pollUrl, pollPayload, { headers, timeout: 20000 });
            const item = pollResp.data?.data?.list?.[0];
            const status = item?.content?.status;

            if (status === 1) {
                const images = item.content?.extra?.result_images;
                if (images && images.length > 0) {
                    const img = images[0];
                    const finalUrl = img.download_url || img.cdn_url || img.url;
                    logInfo(`[Qwen Studio] Success! Generated 2K Image: ${finalUrl}`);
                    return {
                        success: true,
                        recordId: recordId,
                        url: finalUrl,
                        cdnUrl: img.cdn_url,
                        downloadUrl: img.download_url,
                        width: img.width || 2048,
                        height: img.height || 2048,
                        prompt: prompt,
                        resolution: resolution
                    };
                }
            }
        } catch (err) {
            logDebug(`[Qwen Studio] Polling attempt ${i + 1} error: ${err.message}`);
        }
    }

    throw new Error(`[Qwen Studio] Generation timed out after ${maxAttempts * (interval / 1000)}s`);
}

export async function generateStudioVideo(prompt, options = {}) {
    const accounts = loadStudioAccounts();
    if (!accounts.length) {
        throw new Error(`No studio accounts configured in ${ACCOUNTS_FILE}`);
    }
    const account = accounts[0];

    const size = options.size || '16:9';
    const duration = options.duration || 5;
    const model = options.model || 'happyhorse1.1';
    const reqId = 'req-video-' + crypto.randomUUID();
    const ts = Date.now();

    // 解析单参考或多参考图
    let attachments = [];
    if (Array.isArray(options.attachments)) {
        attachments = options.attachments;
    } else if (Array.isArray(options.reference_images)) {
        attachments = options.reference_images.map((img, idx) => ({
            type: 'image',
            url: typeof img === 'string' ? img : img.url,
            index: idx
        }));
    } else if (options.image_url || options.image) {
        attachments = [{
            type: 'image',
            url: options.image_url || options.image,
            index: 0
        }];
    }

    const submitUrl = `https://sg-quark-ai-studio.qwen.com/api/web/ai/video/function?biz_id=ai_video&pr=kkpcweb&fr=win&ai_ts=${ts}&req_id=${reqId}`;

    const headers = {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'authorization': `Bearer ${account.auth_token}`,
        'content-type': 'application/json',
        'Cookie': account.cookies,
        'origin': 'https://create.qwen.com',
        'referer': 'https://create.qwen.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'
    };

    const submitPayload = {
        model: model,
        rootModel: model,
        reqId: reqId,
        prompt: prompt,
        materialId: '',
        from: 'ai_create_sidebar',
        params: {
            features: [model],
            duration: duration,
            size: size,
            attachments: attachments,
            creditRuleVersion: 2
        },
        chid: crypto.randomUUID().replace(/-/g, ''),
        browserId: 'cba03f31bda36004b53888e60bf1b6ed',
        platform: 'pc',
        language: 'zh-CN'
    };

    logInfo(`[Qwen Studio] Submitting Video task: "${prompt}" (Model: ${model}, Duration: ${duration}s, Size: ${size})`);

    const submitResp = await axios.post(submitUrl, submitPayload, { headers, timeout: 30000 });
    const submitData = submitResp.data;

    if (!submitData || !submitData.success || !submitData.data?.recordId) {
        throw new Error(`Video task submission failed: ${JSON.stringify(submitData)}`);
    }

    const recordId = submitData.data.recordId;
    logInfo(`[Qwen Studio] Video task recordId: ${recordId}. Polling status...`);

    const pollPayload = {
        items: [{ recordId: recordId, scene: 'happyhorse_t2v' }],
        req_id: `poll-${recordId.substring(0, 8)}`,
        chid: `poll-${recordId.substring(0, 8)}`,
        browserId: 'cba03f31bda36004b53888e60bf1b6ed',
        platform: 'pc',
        language: 'zh-CN'
    };

    const maxAttempts = options.maxAttempts || 80;
    const interval = options.interval || 4000;

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, interval));
        const pollTs = Date.now();
        const pollUrl = `https://sg-quark-ai-studio.qwen.com/api/web/assets/v1/batch/get?biz_id=ai_video&pr=kkpcweb&fr=win&ai_ts=${pollTs}&req_id=poll-${recordId.substring(0, 8)}`;

        try {
            const pollResp = await axios.post(pollUrl, pollPayload, { headers, timeout: 20000 });
            const item = pollResp.data?.data?.list?.[0];
            const status = item?.content?.status;

            if (status === 1) {
                const videos = item.content?.extra?.result_videos || item.content?.extra?.videos;
                const videoObj = videos?.[0] || item.content?.extra;
                const finalUrl = videoObj?.download_url || videoObj?.cdn_url || videoObj?.url || item.content?.video_url;
                if (finalUrl) {
                    logInfo(`[Qwen Studio] Success! Generated Video: ${finalUrl}`);
                    return {
                        success: true,
                        recordId: recordId,
                        url: finalUrl,
                        duration: duration,
                        prompt: prompt,
                        model: model
                    };
                }
            }
        } catch (err) {
            logDebug(`[Qwen Studio Video] Polling attempt ${i + 1} error: ${err.message}`);
        }
    }

    throw new Error(`Timed out waiting for Qwen Studio video after ${maxAttempts} attempts.`);
}
