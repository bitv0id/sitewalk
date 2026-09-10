import { setTimeout as sleep } from 'node:timers/promises';

/** Transient by nature — worth another attempt before reporting a failure. */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

const READABLE_TYPE = /^(text\/|application\/(xhtml\+xml|xml|json|rss\+xml|atom\+xml))|(\+xml)/i;
const HTML_TYPE = /text\/html|application\/xhtml\+xml/i;

const MAX_BODY_BYTES = 10 * 1024 * 1024;

function backoffMs(attempt) {
    return Math.min(500 * 2 ** attempt, 8000);
}

function retryAfterMs(response) {
    const header = response.headers.get('retry-after');
    if (!header) {
        return null;
    }

    const seconds = Number.parseFloat(header);
    if (Number.isFinite(seconds)) {
        return Math.min(seconds * 1000, 30000);
    }

    const date = Date.parse(header);

    return Number.isNaN(date) ? null : Math.min(Math.max(date - Date.now(), 0), 30000);
}

export function createClient(config) {
    let dispatcherPromise;

    async function dispatcher() {
        if (!config.proxy) {
            return null;
        }

        dispatcherPromise ??= import('undici')
            .then(
                ({ ProxyAgent }) =>
                    new ProxyAgent({
                        uri: config.proxy,
                        requestTls: { rejectUnauthorized: !config.insecureTLS },
                    }),
            )
            .catch(() => {
                throw new Error(
                    `A proxy is configured (${config.proxy}) but the optional "undici" package is missing. Run: npm install undici`,
                );
            });

        return dispatcherPromise;
    }

    async function get(url, { accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' } = {}) {
        const agent = await dispatcher();

        for (let attempt = 0; ; attempt++) {
            try {
                const options = {
                    method: 'GET',
                    redirect: 'manual',
                    signal: AbortSignal.timeout(config.timeout),
                    headers: {
                        'user-agent': config.userAgent,
                        accept,
                        'accept-language': config.acceptLanguage,
                    },
                };
                if (agent) {
                    options.dispatcher = agent;
                }

                const response = await fetch(url, options);

                if (RETRYABLE_STATUS.has(response.status) && attempt < config.retries) {
                    await response.body?.cancel().catch(() => {});
                    await sleep(retryAfterMs(response) ?? backoffMs(attempt));
                    continue;
                }

                const contentType = response.headers.get('content-type') ?? '';
                const length = Number.parseInt(response.headers.get('content-length') ?? '', 10);
                const readable = READABLE_TYPE.test(contentType) && !(length > MAX_BODY_BYTES);

                let body = null;
                if (readable) {
                    body = await response.text();
                } else {
                    await response.body?.cancel().catch(() => {});
                }

                return {
                    url,
                    status: response.status,
                    headers: response.headers,
                    contentType,
                    html: HTML_TYPE.test(contentType),
                    body,
                    attempts: attempt + 1,
                };
            } catch (error) {
                if (attempt < config.retries) {
                    await sleep(backoffMs(attempt));
                    continue;
                }

                return {
                    url,
                    status: 0,
                    error:
                        error?.name === 'TimeoutError'
                            ? `timeout after ${config.timeout}ms`
                            : (error?.message ?? String(error)),
                    attempts: attempt + 1,
                };
            }
        }
    }

    return { get };
}
