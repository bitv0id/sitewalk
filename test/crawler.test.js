import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Crawler } from '../src/crawler.js';
import { allowAll, parseRobots } from '../src/robots.js';

const silentReport = {
    header() {},
    seeds() {},
    ok() {},
    failure() {},
    redirect() {},
    note() {},
    summary() {},
};

/** Serves an in-memory site; anything not defined is a 404, as on a real server. */
function fakeClient(pages) {
    return {
        requests: [],
        async get(url) {
            this.requests.push(url);
            const page = pages[url];

            if (!page) {
                return { url, status: 404, headers: new Headers(), html: false, body: null };
            }
            if (page.location) {
                return {
                    url,
                    status: page.status ?? 301,
                    headers: new Headers({ location: page.location }),
                    html: false,
                    body: null,
                };
            }

            return {
                url,
                status: page.status ?? 200,
                headers: new Headers({ 'content-type': 'text/html' }),
                contentType: 'text/html',
                html: true,
                body: page.body ?? '',
            };
        },
    };
}

function config(overrides = {}) {
    return {
        url: 'https://site.test/',
        steps: 40,
        delay: 0,
        subdomains: false,
        respectRobots: true,
        perTemplate: 8,
        exclude: [],
        seeds: [],
        ...overrides,
    };
}

function crawl(pages, overrides = {}, robots = allowAll()) {
    const client = fakeClient(pages);
    const crawler = new Crawler({ config: config(overrides), client, robots, report: silentReport });

    return { crawler, client, run: () => crawler.run() };
}

const HOME = `
    <a href="/a">Page A</a>
    <a href="/broken">Broken page</a>
    <a href="/redir">Moved page</a>
    <a href="/logout">Log out</a>
    <a href="https://other.test/x">External</a>
    <a href="/doc.pdf">Brochure</a>
    <a href="/{{ data.url }}">Placeholder</a>
    <a href="info@site.test">Write to us</a>
`;

const SITE = {
    'https://site.test/': { body: HOME },
    'https://site.test/a': { body: '<a href="/">Home</a>' },
    'https://site.test/broken': { status: 404 },
    'https://site.test/redir': { location: '/a' },
};

describe('Crawler', () => {
    it('reports a broken link with the page and link text that led to it', async () => {
        const stats = await crawl(SITE).run();

        assert.equal(stats.errors.length, 1);
        const [error] = stats.errors;
        assert.equal(error.url, 'https://site.test/broken');
        assert.equal(error.status, 404);
        assert.equal(error.from, 'https://site.test/');
        assert.equal(error.clicked.text, 'Broken page');
    });

    it('records redirects without following them', async () => {
        const { client, run } = crawl(SITE);
        const stats = await run();

        assert.equal(stats.redirects.length, 1);
        assert.equal(stats.redirects[0].url, 'https://site.test/redir');
        assert.equal(stats.redirects[0].location, '/a');
        assert.ok(
            client.requests.filter((url) => url === 'https://site.test/a').length <= 1,
            'the redirect target must not be requested because of the redirect',
        );
    });

    it('never requests off-site, unsafe or asset links', async () => {
        const { client, run } = crawl(SITE);
        const stats = await run();

        assert.ok(!client.requests.some((url) => url.includes('other.test')), 'left the site');
        assert.ok(!client.requests.some((url) => url.includes('logout')), 'followed a logout link');
        assert.ok(!client.requests.some((url) => url.includes('.pdf')), 'downloaded an asset');

        assert.ok(stats.skipped.offsite >= 1);
        assert.ok(stats.skipped.unsafe >= 1);
        assert.ok(stats.skipped.asset >= 1);
    });

    it('flags malformed hrefs instead of requesting them', async () => {
        const { client, run } = crawl(SITE);
        const stats = await run();

        const reasons = new Set(stats.warnings.map((warning) => warning.reason));
        assert.equal(reasons.size, 2);
        assert.ok([...reasons].some((reason) => /placeholder/.test(reason)));
        assert.ok([...reasons].some((reason) => /mailto/.test(reason)));
        assert.ok(!client.requests.some((url) => url.includes('info@')));
    });

    it('honours robots.txt', async () => {
        const robots = parseRobots('User-agent: *\nDisallow: /a\n', 'sitewalk');
        const { client, run } = crawl(SITE, {}, robots);
        const stats = await run();

        assert.ok(!client.requests.includes('https://site.test/a'), 'visited a disallowed path');
        assert.ok(stats.skipped.robots >= 1);
    });

    it('ignores robots.txt when told to', async () => {
        const robots = parseRobots('User-agent: *\nDisallow: /a\n', 'sitewalk');
        const { client, run } = crawl(SITE, { respectRobots: false }, robots);
        await run();

        assert.ok(client.requests.includes('https://site.test/a'));
    });

    it('applies exclude patterns', async () => {
        const { client, run } = crawl(SITE, { exclude: [(path) => path.startsWith('/a')] });
        const stats = await run();

        assert.ok(!client.requests.includes('https://site.test/a'));
        assert.ok(stats.skipped.excluded >= 1);
    });

    it('caps how many pages of one shape it visits', async () => {
        const listing = Array.from({ length: 30 }, (_, i) => `<a href="/news/${i + 1}">Item ${i + 1}</a>`).join('');
        const pages = { 'https://site.test/': { body: listing } };
        for (let i = 1; i <= 30; i++) {
            pages[`https://site.test/news/${i}`] = { body: '<a href="/">Home</a>' };
        }

        const stats = await crawl(pages, { perTemplate: 3, steps: 40 }).run();
        const visitedArticles = [...stats.errors, ...stats.redirects].length;

        assert.equal(visitedArticles, 0, 'the fixture has no failures');
        assert.ok(stats.skipped.budget > 0, 'the budget was never applied');

        const articleCount = stats.visited;
        assert.ok(articleCount <= 5, `visited ${articleCount} URLs, expected the budget to hold it down`);
    });

    it('follows a redirect on the entry point, since there is nothing to walk otherwise', async () => {
        const pages = {
            'https://site.test/': { location: '/home' },
            'https://site.test/home': { body: '<a href="/a">A</a>' },
            'https://site.test/a': { body: '<a href="/home">Home</a>' },
        };

        const { crawler, client, run } = crawl(pages, { steps: 10 });
        const stats = await run();

        assert.equal(stats.errors.length, 0);
        assert.equal(crawler.start, 'https://site.test/home');
        assert.ok(client.requests.includes('https://site.test/a'));
    });

    it('stops early once nothing new is left', async () => {
        const stats = await crawl(
            { 'https://site.test/': { body: '<a href="https://other.test/">Out</a>' } },
            {
                steps: 100,
            },
        ).run();

        assert.equal(stats.exhausted, true);
        assert.ok(stats.stepsUsed < 100, `used ${stats.stepsUsed} steps on a one-page site`);
    });

    it('treats a subdomain as off-site unless asked otherwise', async () => {
        const pages = {
            'https://site.test/': { body: '<a href="https://blog.site.test/">Blog</a>' },
            'https://blog.site.test/': { body: '<a href="/">Blog home</a>' },
        };

        const strict = crawl(pages, { steps: 6 });
        await strict.run();
        assert.ok(!strict.client.requests.some((url) => url.includes('blog.')));

        const wide = crawl(pages, { steps: 6, subdomains: true });
        await wide.run();
        assert.ok(wide.client.requests.some((url) => url.includes('blog.')));
    });

    it('counts a network failure as an error', async () => {
        const client = {
            requests: [],
            async get(url) {
                this.requests.push(url);
                return { url, status: 0, error: 'timeout after 15000ms' };
            },
        };
        const crawler = new Crawler({ config: config({ steps: 2 }), client, robots: allowAll(), report: silentReport });
        const stats = await crawler.run();

        assert.ok(stats.errors.length >= 1);
        assert.equal(stats.errors[0].status, 'network');
        assert.match(stats.errors[0].detail, /timeout/);
    });
});
