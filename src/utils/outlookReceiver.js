/**
 * Outlook 微软 Graph API 自动取件引擎
 * 通过 client_id 与 refresh_token 自动获取最新的 Qwen 6位验证码
 */

export async function fetchOutlookVerificationCode(clientId, refreshToken, waitSeconds = 30) {
    if (!clientId || !refreshToken) return null;

    try {
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refreshToken);
        params.append('scope', 'https://graph.microsoft.com/.default offline_access');

        const tokenResp = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;
        if (!accessToken) {
            console.error('获取微软 access_token 失败:', tokenData);
            return null;
        }

        const graphUrl = 'https://graph.microsoft.com/v1.0/me/messages?$top=5&$orderby=receivedDateTime desc';
        const startTime = Date.now();

        while (Date.now() - startTime < waitSeconds * 1000) {
            try {
                const msgResp = await fetch(graphUrl, {
                    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
                });
                const msgData = await msgResp.json();
                const msgs = msgData.value || [];

                for (const m of msgs) {
                    const subject = m.subject || '';
                    const preview = m.bodyPreview || '';
                    const full = subject + ' ' + preview;

                    if (/qwen|通义|alibaba|验证码|verification|sign-in code/i.test(full)) {
                        const match = preview.match(/\b\d{6}\b/) || subject.match(/\b\d{6}\b/);
                        if (match) {
                            return match[0];
                        }
                    }
                }
            } catch (err) {
                // ignore and retry
            }
            await new Promise(r => setTimeout(r, 3000));
        }

        return null;
    } catch (error) {
        console.error('自动取件异常:', error.message);
        return null;
    }
}
