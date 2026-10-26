import express from 'express';
import bodyParser from 'body-parser';

import { initBrowser, shutdownBrowser } from './src/browser/browser.js';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './src/api/routes.js';
import managementRoutes from './src/api/managementRoutes.js';
import { proxyRequestToUpstream } from './src/api/upstreamProxy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { getAvailableModelsFromFile, getApiKeys } from './src/api/chat.js';
import { loadTokens } from './src/api/tokenManager.js';
import { addAccountInteractive } from './src/utils/accountSetup.js';
import { logHttpRequest, logInfo, logError, logWarn } from './src/logger/index.js';
import { prompt } from './src/utils/prompt.js';
import { FORGETMEAI_WATERMARK } from './src/utils/branding.js';
import { PORT, HOST } from './src/config.js';
import { isBrowserOriginAllowed, normalizeOrigin, parseAllowedOrigins } from './src/api/originPolicy.js';

const app = express();

const port = Number.parseInt(process.env.PORT ?? PORT, 10);
const host = process.env.HOST || HOST;
const allowedBrowserOrigins = parseAllowedOrigins(process.env.CORS_ORIGINS);

if (Number.isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`Некорректное значение переменной PORT: ${process.env.PORT}`);
}

function toBoolean(value) {
    if (typeof value !== 'string') return false;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

const skipAccountMenu = toBoolean(process.env.SKIP_ACCOUNT_MENU) || toBoolean(process.env.NON_INTERACTIVE);

function ensureNonInteractiveTokens() {
    const tokens = loadTokens();
    const now = Date.now();
    const validTokens = tokens.filter(t => (!t.resetAt || new Date(t.resetAt).getTime() <= now) && !t.invalid);
    if (!validTokens.length) {
        logWarn('Внимание: нет активных токенов. Сервер запущен для управления через веб-интерфейс (/management.html).');
        return;
    }
    logInfo(`Автоматический запуск: обнаружено ${tokens.length} аккаунтов, из них ${validTokens.length} активны.`);
}

app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    res.header('Vary', 'Origin');
    if (!isBrowserOriginAllowed(requestOrigin, allowedBrowserOrigins)) {
        return res.status(403).json({ error: 'Browser origin is not allowed', type: 'cors_error' });
    }
    if (requestOrigin) res.header('Access-Control-Allow-Origin', normalizeOrigin(requestOrigin));
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.use(logHttpRequest);
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

app.use((err, req, res, next) => {
    const isJsonSyntaxError = err instanceof SyntaxError && err.status === 400 && Object.prototype.hasOwnProperty.call(err, 'body');

    if (isJsonSyntaxError) {
        logWarn(`Некорректный JSON в запросе: ${err.message}`);
        return res.status(400).json({
            error: 'Некорректный JSON',
            message: 'Проверьте тело запроса: используйте валидный JSON с двойными кавычками.'
        });
    }

    return next(err);
});

app.get(['/health', '/v1/health'], (req, res) => res.status(200).send('OK'));
app.use('/api', apiRoutes);
app.use('/v1', apiRoutes);
app.use('/api/management', managementRoutes);

// CPAMC 控制台无缝代理 (Google Antigravity / Claude / Codex OAuth 令牌管理)
app.use(['/cpamc', '/antigravity-manage'], (req, res) => {
    return proxyRequestToUpstream(req, res, 8081, '/management.html');
});

app.use(express.static(path.resolve(__dirname, 'public')));
app.get(['/', '/dashboard', '/management.html'], (req, res) => res.sendFile(path.resolve(__dirname, 'public', 'index.html')));

app.use((req, res) => {
    logWarn(`404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: 'Эндпоинт не найден' });
});

app.use((err, req, res, next) => {
    logError('Внутренняя ошибка сервера', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
process.on('SIGHUP', handleShutdown);
process.on('uncaughtException', async (error) => {
    logError('Необработанное исключение', error);
    await handleShutdown();
});

async function handleShutdown() {
    logInfo('\nПолучен сигнал завершения. Закрываем браузер...');
    await shutdownBrowser();
    logInfo('Завершение работы.');
    process.exit(0);
}

async function startServer() {
    console.log(`
███████ ██████  ███████ ███████  ██████  ██     ██ ███████ ███    ██  █████  ██████  ██ 
██      ██   ██ ██      ██      ██    ██ ██     ██ ██      ████   ██ ██   ██ ██   ██ ██ 
█████   ██████  █████   █████   ██    ██ ██  █  ██ █████   ██ ██  ██ ███████ ██████  ██ 
██      ██   ██ ██      ██      ██ ▄▄ ██ ██ ███ ██ ██      ██  ██ ██ ██   ██ ██      ██ 
██      ██   ██ ███████ ███████  ██████   ███ ███  ███████ ██   ████ ██   ██ ██      ██ 
                                    ▀▀                                                    
   API-прокси для Qwen
   ${FORGETMEAI_WATERMARK}
`);

    logInfo('Запуск сервера...');

    if (!skipAccountMenu) {
        while (true) {
            const tokens = loadTokens();
            console.log('\nСписок аккаунтов:');
            if (!tokens.length) {
                console.log('  (пусто)');
            } else {
                tokens.forEach((token, i) => {
                    const now = Date.now();
                    const isInvalid = token.invalid === true;
                    const isWaiting = Boolean(token.resetAt && new Date(token.resetAt).getTime() > now);
                    const statusLabel = isInvalid ? '❌ Недействителен' : isWaiting ? '⏳ Ожидание сброса' : '✅ OK';
                    const statusCode = isInvalid ? 0 : isWaiting ? 1 : 2;
                    console.log(`${String(i + 1).padStart(2, ' ')} | ${token.id} | ${statusLabel} (${statusCode})`);
                });
            }
            console.log('\n=== Меню ===');
            console.log(`ForgetMeAI: ${FORGETMEAI_WATERMARK}`);
            console.log('1 - Добавить новый аккаунт');
            console.log('2 - Перелогинить аккаунт с истекшим токеном');
            console.log('3 - Запустить прокси (по умолчанию)');
            console.log('4 - Удалить аккаунт');

            let choice = await prompt('Ваш выбор (Enter = 3): ');
            if (!choice) choice = '3';

            if (choice === '1') {
                await addAccountInteractive();
            } else if (choice === '2') {
                const { reloginAccountInteractive } = await import('./src/utils/accountSetup.js');
                await reloginAccountInteractive();
            } else if (choice === '3') {
                const hasValidToken = tokens.some(t => {
                    if (t.invalid) return false;
                    if (!t.resetAt) return true;
                    return new Date(t.resetAt).getTime() <= Date.now();
                });
                if (!tokens.length || !hasValidToken) {
                    console.log('Нужен хотя бы один валидный аккаунт для запуска.');
                    continue;
                }
                break;
            } else if (choice === '4') {
                const { removeAccountInteractive } = await import('./src/utils/accountSetup.js');
                await removeAccountInteractive();
            }
        }
    } else {
        ensureNonInteractiveTokens();
    }

    try {
        const browserInitialized = await initBrowser(false);
        if (browserInitialized) {
            logInfo('Браузер успешно инициализирован.');
        } else {
            logWarn('Браузер не запущен. Сервер работает в режиме Direct API / Qwen Studio / Cloud Gateway.');
        }
    } catch (browserErr) {
        logWarn(`Внимание: Ошибка запуска браузера (работа в режиме Cloud Gateway): ${browserErr.message}`);
    }

    try {
        const primaryPort = Number(process.env.PORT) || 8080;
        const listenHost = '0.0.0.0';

        app.listen(primaryPort, listenHost, () => {
            logInfo(`主网关服务已成功启动在: ${listenHost}:${primaryPort}`);
            logInfo(`统一 API 入口: http://${listenHost}:${primaryPort}/v1`);
            getApiKeys();
            getAvailableModelsFromFile();
        });

        // 如果主端口不是 8080，同时监听 8080 端口，确保无论 Render 探测 8080 还是 10000 均 100% 成功
        if (primaryPort !== 8080) {
            try {
                app.listen(8080, listenHost, () => {
                    logInfo(`Render 兼容端口已激活: ${listenHost}:8080`);
                });
            } catch (err8080) {
                logWarn(`8080 兼容端口绑定提示: ${err8080.message}`);
            }
        }
    } catch (err) {
        logError('服务器启动异常', err);
        process.exit(1);
    }
}

startServer().catch(async error => {
    logError('Ошибка при запуске сервера', error);
    await shutdownBrowser();
    process.exit(1);
});
