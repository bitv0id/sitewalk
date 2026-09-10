/**
 * Minimal robots.txt support: the Disallow/Allow rules of the most specific
 * matching group, plus Crawl-delay and Sitemap hints.
 *
 * On an unknown site robots.txt is the only machine-readable statement about
 * which paths the owner does not want a crawler in, so it replaces the
 * hand-written exclude lists a site-specific crawler would need.
 */

function patternToRegExp(pattern) {
    let source = '';
    let anchorEnd = false;
    let value = pattern;

    if (value.endsWith('$')) {
        anchorEnd = true;
        value = value.slice(0, -1);
    }

    for (const char of value) {
        if (char === '*') {
            source += '.*';
        } else {
            source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
    }

    return new RegExp(`^${source}${anchorEnd ? '$' : ''}`);
}

function parseGroups(text) {
    const groups = [];
    let current = null;
    let expectingAgent = false;

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.split('#')[0].trim();
        if (!line) {
            continue;
        }

        const separator = line.indexOf(':');
        if (separator === -1) {
            continue;
        }

        const field = line.slice(0, separator).trim().toLowerCase();
        const value = line.slice(separator + 1).trim();

        if (field === 'user-agent') {
            if (!current || !expectingAgent) {
                current = { agents: [], rules: [], crawlDelay: null };
                groups.push(current);
                expectingAgent = true;
            }
            current.agents.push(value.toLowerCase());
            continue;
        }

        if (!current) {
            continue;
        }

        expectingAgent = false;

        if (field === 'disallow' || field === 'allow') {
            // "Disallow:" with an empty value means "nothing is disallowed".
            if (field === 'disallow' && value === '') {
                continue;
            }
            current.rules.push({ allow: field === 'allow', pattern: value, match: patternToRegExp(value) });
        } else if (field === 'crawl-delay') {
            const seconds = Number.parseFloat(value);
            if (Number.isFinite(seconds)) {
                current.crawlDelay = seconds;
            }
        }
    }

    return groups;
}

function parseSitemaps(text) {
    const sitemaps = [];

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.split('#')[0].trim();
        const match = line.match(/^sitemap\s*:\s*(\S+)$/i);
        if (match) {
            sitemaps.push(match[1]);
        }
    }

    return sitemaps;
}

/** Pick the group whose user-agent token is the longest match for ours, falling back to `*`. */
function selectGroup(groups, userAgent) {
    const agent = userAgent.toLowerCase();
    let best = null;
    let bestLength = -1;

    for (const group of groups) {
        for (const candidate of group.agents) {
            const isMatch = candidate === '*' ? true : agent.includes(candidate);
            const length = candidate === '*' ? 0 : candidate.length;

            if (isMatch && length > bestLength) {
                best = group;
                bestLength = length;
            }
        }
    }

    return best;
}

/** A checker that allows everything — used when robots.txt is missing or unreadable. */
export function allowAll() {
    return { isAllowed: () => true, crawlDelay: null, sitemaps: [], available: false };
}

export function parseRobots(text, userAgent) {
    const groups = parseGroups(text);
    const group = selectGroup(groups, userAgent);
    const rules = group ? group.rules : [];

    return {
        available: true,
        crawlDelay: group?.crawlDelay ?? null,
        sitemaps: parseSitemaps(text),
        /**
         * Longest matching rule wins; Allow wins a tie. This is the behaviour
         * documented by the major crawlers.
         */
        isAllowed(pathWithQuery) {
            let decision = true;
            let decidedLength = -1;

            for (const rule of rules) {
                if (!rule.match.test(pathWithQuery)) {
                    continue;
                }

                const length = rule.pattern.length;
                if (length > decidedLength || (length === decidedLength && rule.allow)) {
                    decision = rule.allow;
                    decidedLength = length;
                }
            }

            return decision;
        },
    };
}
