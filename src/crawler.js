import { clickScore, documentBase, extractAnchors } from './links.js';
import { shuffle } from './sitemap.js';
import {
    hostInScope,
    isAsset,
    isUnsafe,
    normalize,
    pathTemplate,
    pathWithQuery,
    resolveHref,
    shortUrl,
    suspicious,
} from './url.js';

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const MAX_ENTRY_REDIRECTS = 5;

/** Consecutive steps without a single new URL before the walk gives up. */
const STALL_LIMIT = 3;

function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}

/**
 * Walks a site the way a bored visitor would: load a page, pick one of the links
 * on it at random, load that, repeat. Anything that is not a 2xx is reported
 * together with the page it was reached from and the text of the link that led
 * there, which is what makes a failure actionable.
 *
 * Redirects are reported and skipped rather than followed — a 301 is a fact
 * about the site, not a failure, and following them would let one misconfigured
 * route swallow the whole budget. The single exception is the entry point,
 * because without a page to start from there is nothing to walk.
 */
export class Crawler {
    constructor({ config, client, robots, report }) {
        this.config = config;
        this.client = client;
        this.robots = robots;
        this.report = report;

        this.start = normalize(config.url);
        this.baseHost = new URL(this.start).hostname;

        this.visited = new Set();
        this.templates = new Map();
        this.errors = [];
        this.redirects = [];
        this.warnings = [];
        this.rejectedSeeds = [];
        this.seeds = this.inScopeSeeds(config.seeds);
        this.skipped = {
            offsite: 0,
            robots: 0,
            unsafe: 0,
            asset: 0,
            budget: 0,
            excluded: 0,
            nofollow: 0,
            suspicious: 0,
        };
        this.pagesOk = 0;
        this.stepsUsed = 0;
        this.entryRedirects = 0;
        this.stalledSteps = 0;
        this.exhausted = false;
    }

    get requestDelay() {
        const fromRobots = this.config.respectRobots ? (this.robots.crawlDelay ?? 0) * 1000 : 0;

        return Math.max(this.config.delay, fromRobots);
    }

    async run() {
        for (const { url, reason } of this.rejectedSeeds) {
            this.report.warning(`Ignoring seed ${url} — ${reason}.`);
        }

        let current = { url: this.start, from: this.start, clicked: null, siblings: [] };

        for (let step = 1; step <= this.config.steps; step++) {
            this.stepsUsed = step;
            const progress = `[${step}/${this.config.steps}]`;
            const { url, from, clicked } = current;
            const knownBefore = this.visited.size;

            this.visit(url);
            const response = await this.client.get(url);

            if (response.error) {
                this.report.failure(progress, url, '—', from, clicked, response.error);
                this.errors.push({ url, status: 'network', from, clicked, detail: response.error });
                current = this.restart(url, progress);
            } else if (REDIRECT_STATUS.has(response.status)) {
                current = this.handleRedirect(current, response, progress);
            } else if (response.status !== 200) {
                this.report.failure(progress, url, response.status, from, clicked);
                this.errors.push({ url, status: response.status, from, clicked });
                current = this.restart(url, progress);
            } else {
                this.pagesOk++;
                this.report.ok(progress, url, response.status);

                if (typeof response.body !== 'string' || !response.html) {
                    this.report.note(progress, `not an HTML document (${response.contentType || 'unknown type'})`);
                    current = this.restart(url, progress);
                } else {
                    current = this.pickNext(url, this.collectLinks(response.body, url), progress);
                }
            }

            if (current === null) {
                break;
            }

            this.stalledSteps = this.visited.size > knownBefore ? 0 : this.stalledSteps + 1;
            if (this.stalledSteps >= STALL_LIMIT) {
                this.exhausted = true;
                this.report.note(progress, 'nothing new left to visit, stopping early');
                break;
            }

            if (step < this.config.steps && this.requestDelay > 0) {
                await new Promise((resolve) => setTimeout(resolve, this.requestDelay));
            }
        }

        return this.stats();
    }

    visit(url) {
        this.visited.add(url);
        const template = pathTemplate(url);
        this.templates.set(template, (this.templates.get(template) ?? 0) + 1);
    }

    /**
     * The entry point is followed once so the walk has somewhere to begin; a
     * redirect anywhere else is recorded and the walk takes another link from
     * the page it came from.
     */
    handleRedirect(current, response, progress) {
        const { url, clicked } = current;
        const location = response.headers.get('location');

        if (url !== this.start) {
            this.report.redirect(progress, url, response.status, location, 'skipped', clicked);
            this.redirects.push({ url, status: response.status, location, from: current.from, clicked });

            return this.pickSibling(current, progress);
        }

        const target = location ? this.toCrawlable(location, url) : null;
        if (!target || this.visited.has(target) || this.entryRedirects >= MAX_ENTRY_REDIRECTS) {
            this.report.failure(
                progress,
                url,
                response.status,
                current.from,
                clicked,
                'entry point redirects out of scope',
            );
            this.errors.push({
                url,
                status: response.status,
                from: current.from,
                clicked,
                detail: 'entry point redirect',
            });

            return null;
        }

        this.entryRedirects++;
        this.report.redirect(progress, url, response.status, location, 'entry point, followed', clicked);
        this.start = target;
        this.baseHost = new URL(target).hostname;

        return { url: target, from: url, clicked, siblings: current.siblings };
    }

    toCrawlable(href, documentUrl) {
        const resolved = resolveHref(href, documentUrl);
        if (!resolved || !hostInScope(resolved.hostname, this.baseHost, this.config.subdomains)) {
            return null;
        }

        return normalize(resolved);
    }

    collectLinks(html, documentUrl) {
        const base = documentBase(html, documentUrl);
        const byUrl = new Map();

        for (const anchor of extractAnchors(html)) {
            const resolved = resolveHref(anchor.href, base);
            if (!resolved) {
                continue;
            }

            if (!hostInScope(resolved.hostname, this.baseHost, this.config.subdomains)) {
                this.skipped.offsite++;
                continue;
            }

            const url = normalize(resolved);
            if (this.visited.has(url) || byUrl.has(url)) {
                const previous = byUrl.get(url);
                if (previous && clickScore(anchor) > clickScore(previous)) {
                    byUrl.set(url, { ...anchor, url });
                }
                continue;
            }

            const defect = suspicious(resolved);
            if (defect) {
                this.skipped.suspicious++;
                this.warnings.push({ url, href: anchor.href, from: documentUrl, reason: defect, text: anchor.text });
                continue;
            }

            const reason = this.rejectionReason(resolved, anchor);
            if (reason) {
                this.skipped[reason]++;
                continue;
            }

            byUrl.set(url, { ...anchor, url });
        }

        return [...byUrl.values()];
    }

    rejectionReason(resolved, anchor) {
        if (isAsset(resolved.pathname)) {
            return 'asset';
        }
        if (isUnsafe(resolved)) {
            return 'unsafe';
        }
        if (anchor.rel.split(/\s+/).includes('nofollow') && this.config.respectRobots) {
            return 'nofollow';
        }
        if (this.config.exclude.some((matcher) => matcher(pathWithQuery(resolved)))) {
            return 'excluded';
        }
        if (this.config.respectRobots && !this.robots.isAllowed(pathWithQuery(resolved))) {
            return 'robots';
        }
        if ((this.templates.get(pathTemplate(resolved)) ?? 0) >= this.config.perTemplate) {
            return 'budget';
        }

        return null;
    }

    pickNext(currentUrl, links, progress) {
        const unvisited = links.filter((link) => !this.visited.has(link.url));
        if (unvisited.length > 0) {
            return this.stepTo(pickRandom(unvisited), unvisited, currentUrl);
        }

        if (currentUrl !== this.start) {
            this.report.note(progress, 'no new links here, back to the entry point');

            return { url: this.start, from: currentUrl, clicked: null, siblings: [] };
        }

        const seed = this.nextSeed();
        if (seed) {
            this.report.note(progress, `entry point exhausted, jumping to a seed: ${shortUrl(seed)}`);

            return { url: seed, from: currentUrl, clicked: null, siblings: [] };
        }

        if (links.length > 0) {
            this.report.note(progress, 'everything reachable has been visited, revisiting at random');

            return this.stepTo(pickRandom(links), links, currentUrl);
        }

        this.report.note(progress, 'no crawlable links found on the entry point');

        return { url: this.start, from: currentUrl, clicked: null, siblings: [] };
    }

    stepTo(next, pool, from) {
        return { url: next.url, from, clicked: next, siblings: pool.filter((link) => link !== next) };
    }

    /**
     * A link we skipped should not cost us the page it was found on — take a
     * different link from the same page instead of walking back.
     */
    pickSibling(current, progress) {
        const remaining = current.siblings.filter((link) => !this.visited.has(link.url));
        if (remaining.length > 0) {
            return this.stepTo(pickRandom(remaining), remaining, current.from);
        }

        this.report.note(progress, `no other links left on ${shortUrl(current.from)}, back to the entry point`);

        return { url: this.start, from: current.from, clicked: null, siblings: [] };
    }

    restart(from, progress) {
        const seed = this.nextSeed();
        if (seed) {
            this.report.note(progress, `continuing from a seed: ${shortUrl(seed)}`);

            return { url: seed, from, clicked: null, siblings: [] };
        }

        return { url: this.start, from, clicked: null, siblings: [] };
    }

    nextSeed() {
        while (this.seeds.length > 0) {
            const seed = this.seeds.shift();
            if (!this.visited.has(seed)) {
                return seed;
            }
        }

        return null;
    }

    stats() {
        return {
            start: this.start,
            steps: this.config.steps,
            stepsUsed: this.stepsUsed,
            pagesOk: this.pagesOk,
            visited: this.visited.size,
            templates: this.templates.size,
            exhausted: this.exhausted,
            errors: this.errors,
            redirects: this.redirects,
            warnings: this.warnings,
            skipped: this.skipped,
        };
    }

    /**
     * A seed is only useful if the walk is allowed to go there. Anything outside
     * the scope is dropped and reported rather than silently ignored — a seed
     * that does nothing is a mistake the caller wants to hear about.
     */
    inScopeSeeds(urls) {
        const accepted = [];

        for (const url of urls) {
            let normalized;
            try {
                normalized = normalize(url);
            } catch {
                this.rejectedSeeds.push({ url, reason: 'not a valid URL' });
                continue;
            }

            if (normalized === this.start) {
                continue;
            }

            if (!hostInScope(new URL(normalized).hostname, this.baseHost, this.config.subdomains)) {
                this.rejectedSeeds.push({ url, reason: 'outside the scope of this walk' });
                continue;
            }

            accepted.push(normalized);
        }

        return accepted;
    }

    /** Seeds are consumed in random order so repeated runs cover different ground. */
    addSeeds(urls) {
        const seeds = this.inScopeSeeds(shuffle(urls));
        this.seeds.push(...seeds);

        return seeds.length;
    }
}
