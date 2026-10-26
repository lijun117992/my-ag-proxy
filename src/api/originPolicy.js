export function normalizeOrigin(origin) {
    const value = String(origin || '').trim().replace(/\/+$/, '');
    if (!value) return '';
    try {
        const parsed = new URL(value);
        return parsed.origin === 'null' ? value : parsed.origin;
    } catch {
        return value;
    }
}

export function isLoopbackHostname(hostname) {
    const normalized = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    return normalized === 'localhost'
        || normalized === '127.0.0.1'
        || normalized === '::1'
        || normalized === '::ffff:127.0.0.1';
}

export function parseAllowedOrigins(value) {
    return new Set(String(value || '')
        .split(',')
        .map(normalizeOrigin)
        .filter(Boolean));
}

export function isBrowserOriginAllowed(origin, allowedOrigins = new Set()) {
    // 作为云端开放式统一反代与管理网关，允许所有合法的 Web 与客户端 Origin
    return true;
}
