import http from 'http';
import { logError, logInfo } from '../logger/index.js';

/**
 * 将 HTTP 请求无缝反向代理转发至上游内部服务（如 CLIProxyAPI 8081）
 * 支持完整的 SSE 流式传输 (Transfer-Encoding: chunked / text/event-stream)
 */
export function proxyRequestToUpstream(req, res, targetPort = 8081, rewritePath = null) {
    const targetPath = rewritePath || req.originalUrl || req.url;

    // 复制请求头并清理外部 Host
    const headers = { ...req.headers };
    headers.host = `127.0.0.1:${targetPort}`;
    delete headers['content-length'];

    const hasBody = req.body && Object.keys(req.body).length > 0;
    const bodyData = hasBody 
        ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
        : null;

    if (bodyData) {
        headers['content-length'] = Buffer.byteLength(bodyData);
        headers['content-type'] = 'application/json';
    }

    const options = {
        hostname: '127.0.0.1',
        port: targetPort,
        path: targetPath,
        method: req.method,
        headers
    };

    const upstreamReq = http.request(options, (upstreamRes) => {
        // 透传响应状态与响应头
        res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
        upstreamRes.pipe(res);
    });

    upstreamReq.on('error', (err) => {
        logError(`Upstream proxy error to 127.0.0.1:${targetPort}${targetPath}:`, err.message);
        if (!res.headersSent) {
            res.status(502).json({
                error: {
                    message: `Upstream gateway error: ${err.message}`,
                    type: 'upstream_error'
                }
            });
        }
    });

    if (bodyData) {
        upstreamReq.write(bodyData);
        upstreamReq.end();
    } else {
        req.pipe(upstreamReq);
    }
}
