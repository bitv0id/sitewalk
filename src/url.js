const TRACKING_PARAM =
    /^(utm_|_ga$|_gl$|fbclid$|gclid$|gbraid$|wbraid$|msclkid$|yclid$|igshid$|mc_cid$|mc_eid$|ref$|ref_src$|source$|_openstat$|hsa_|pk_|piwik_|matomo_)/i;

const ASSET_EXTENSION =
    /\.(jpe?g|png|gif|webp|avif|svgz?|ico|bmp|tiff?|pdf|docx?|xlsx?|pptx?|odt|ods|zip|rar|7z|gz|bz2|tar|mp3|m4a|wav|ogg|flac|mp4|m4v|avi|mov|mkv|webm|css|js|mjs|cjs|map|json|xml|rss|atom|txt|csv|woff2?|ttf|otf|eot|apk|exe|dmg|iso)$/i;

/**
 * Paths that commonly change state, end the session or start a download.
 * A crawler must never spend a step on them, and on an unknown site following
 * one can do real damage. English and Czech spellings of the usual CMS routes.
 */
const UNSAFE_PATH =
    /(^|\/)(log[-_]?out|sign[-_]?out|odhlasit|odhlaseni|log[-_]?in|sign[-_]?in|prihlaseni|prihlasit|register|registration|registrace|password|heslo|admin|administrace|wp-admin|wp-login|dashboard|cart|basket|kosik|checkout|objednavka|pokladna|payment|platba|order|delete|smazat|remove|odebrat|destroy|edit|upravit|unsubscribe|odhlasit-odber|print|tisk|export|download|stahnout|share|sdilet)(\/|$|\.|-)/i;

const UNSAFE_QUERY =
    /(^|&)(action|do|op|cmd|task)=(delete|remove|destroy|logout|signout|unsubscribe|purge|clear)(&|$)/i;

/**
 * Template placeholders that reached the browser unrendered, and bare email
 * addresses used as an href without the mailto: scheme. Both are authoring
 * bugs rather than broken targets, and both are worth naming as such.
 */
const UNRENDERED = /(\{|\}|%7B|%7D|%24%7B|<%|%3C%|\[\[|\]\])/i;
const BARE_EMAIL = /(^|\/)[^/\s@]+@[^/\s@]+\.[a-z]{2,}$/i;

const NON_HTTP_SCHEME = /^(javascript|mailto|tel|sms|data|blob|file|ftp|whatsapp|viber|skype|callto|geo|intent):/i;

/** Resolve an href found in a document into an absolute http(s) URL, or null when it is not crawlable. */
export function resolveHref(href, documentUrl) {
    if (!href) {
        return null;
    }

    const value = decodeEntities(href).trim();
    if (!value || value.startsWith('#') || NON_HTTP_SCHEME.test(value)) {
        return null;
    }

    let resolved;
    try {
        resolved = new URL(value, documentUrl);
    } catch {
        return null;
    }

    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
        return null;
    }

    return resolved;
}

export function decodeEntities(value) {
    return value
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&nbsp;/gi, ' ');
}

/**
 * Canonical form used for de-duplication: no fragment, lowercase host, no default
 * port, tracking parameters removed, remaining query parameters sorted.
 * The trailing slash is left alone — for many servers it is a different resource.
 */
export function normalize(input) {
    const url = input instanceof URL ? new URL(input.href) : new URL(input);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();

    if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
        url.port = '';
    }

    const params = [...url.searchParams.entries()].filter(([key]) => !TRACKING_PARAM.test(key));
    params.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

    url.search = '';
    for (const [key, value] of params) {
        url.searchParams.append(key, value);
    }

    return url.href;
}

/**
 * Apex and www are always treated as the same site — most hosts redirect one to
 * the other. Everything else needs `subdomains` to be enabled.
 */
export function hostInScope(host, baseHost, subdomains = false) {
    const target = host.toLowerCase();
    const base = baseHost.toLowerCase();

    if (target === base) {
        return true;
    }

    const root = base.replace(/^www\./, '');
    if (!subdomains) {
        return target === root || target === `www.${root}`;
    }

    return target === root || target.endsWith(`.${root}`);
}

/**
 * Collapse a URL into the shape of the page behind it, so that a thousand
 * articles under /news/123/some-title count as one template. Used to stop the
 * walk from spending every step inside a single listing.
 */
export function pathTemplate(input) {
    const url = input instanceof URL ? input : new URL(input);

    const segments = url.pathname
        .split('/')
        .filter(Boolean)
        .map((segment) => {
            if (/^\d+$/.test(segment)) {
                return ':num';
            }
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
                return ':uuid';
            }
            if (/^[0-9a-f]{16,}$/i.test(segment)) {
                return ':hash';
            }
            if (segment.length >= 24 || (segment.includes('-') && segment.length >= 12)) {
                return ':slug';
            }

            return segment.toLowerCase();
        });

    const keys = [...new Set(url.searchParams.keys())].sort();

    return `/${segments.join('/')}${keys.length > 0 ? `?${keys.join('&')}` : ''}`;
}

/** Describe why a link looks like a markup defect, or null when it looks fine. */
export function suspicious(url) {
    const target = url instanceof URL ? url : new URL(url);
    const path = `${target.pathname}${target.search}`;

    if (UNRENDERED.test(path)) {
        return 'unrendered template placeholder';
    }
    if (BARE_EMAIL.test(target.pathname)) {
        return 'email address used as href without mailto:';
    }

    return null;
}

export function isAsset(pathname) {
    return ASSET_EXTENSION.test(pathname);
}

export function isUnsafe(url) {
    const target = url instanceof URL ? url : new URL(url);

    return UNSAFE_PATH.test(target.pathname) || UNSAFE_QUERY.test(target.search.replace(/^\?/, ''));
}

/** Path + query, the form robots.txt rules and exclude patterns are matched against. */
export function pathWithQuery(url) {
    const target = url instanceof URL ? url : new URL(url);

    return `${target.pathname}${target.search}`;
}

/** Short label for logs: path and query only. */
export function shortUrl(input) {
    try {
        const url = new URL(input);
        return `${url.pathname}${url.search}` || '/';
    } catch {
        return String(input);
    }
}
