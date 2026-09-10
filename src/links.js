import { decodeEntities } from './url.js';

const ANCHOR = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
const ATTRIBUTE = /([:@\w-]+)\s*=\s*(?:(["'])(.*?)\2|([^\s"'>]+))/gi;
const BASE_HREF = /<base\s+[^>]*href\s*=\s*(["'])(.*?)\1/i;

function parseAttributes(source) {
    const attributes = {};
    let match;

    while ((match = ATTRIBUTE.exec(source)) !== null) {
        attributes[match[1].toLowerCase()] = match[3] ?? match[4] ?? '';
    }
    ATTRIBUTE.lastIndex = 0;

    return attributes;
}

function visibleText(innerHtml) {
    return decodeEntities(innerHtml.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
}

/** Documents can move their own resolution base; honour it before resolving hrefs. */
export function documentBase(html, documentUrl) {
    const match = html.match(BASE_HREF);
    if (!match) {
        return documentUrl;
    }

    try {
        return new URL(decodeEntities(match[2]).trim(), documentUrl).href;
    } catch {
        return documentUrl;
    }
}

/**
 * A link that carries an id, a stable test identifier or visible text is a more
 * meaningful thing to click than a bare wrapper around an image, and it makes a
 * far better failure report.
 */
export function clickScore(link) {
    let score = 0;

    if (link.id) {
        score += 4;
    }
    if (link.identifier) {
        score += 3;
    }
    if (/\b(js-|test-|e2e-|data-)/.test(link.className)) {
        score += 2;
    }
    if (link.text) {
        score += 1;
    }
    if (link.ariaLabel) {
        score += 1;
    }

    return score;
}

export function extractAnchors(html) {
    const anchors = [];
    let match;

    while ((match = ANCHOR.exec(html)) !== null) {
        const attributes = parseAttributes(match[1]);
        if (!attributes.href) {
            continue;
        }

        anchors.push({
            href: attributes.href,
            id: attributes.id ?? '',
            className: attributes.class ?? '',
            identifier: attributes['data-identifier'] ?? attributes['data-testid'] ?? attributes['data-test'] ?? '',
            ariaLabel: attributes['aria-label'] ?? '',
            rel: (attributes.rel ?? '').toLowerCase(),
            text: visibleText(match[2]),
        });
    }
    ANCHOR.lastIndex = 0;

    return anchors;
}
