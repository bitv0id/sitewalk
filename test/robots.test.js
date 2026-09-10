import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { allowAll, parseRobots } from '../src/robots.js';

const UA = 'sitewalk/0.1 (link checker)';

describe('parseRobots', () => {
    it('applies Disallow rules from the wildcard group', () => {
        const robots = parseRobots('User-agent: *\nDisallow: /private/\n', UA);

        assert.equal(robots.isAllowed('/private/x'), false);
        assert.equal(robots.isAllowed('/public/x'), true);
    });

    it('lets the longest matching rule win, with Allow breaking a tie', () => {
        const robots = parseRobots('User-agent: *\nDisallow: /a/\nAllow: /a/public\n', UA);

        assert.equal(robots.isAllowed('/a/secret'), false);
        assert.equal(robots.isAllowed('/a/public'), true);
        assert.equal(robots.isAllowed('/a/public/deep'), true);
    });

    it('supports * wildcards and the $ end anchor', () => {
        const robots = parseRobots('User-agent: *\nDisallow: /*.json$\nDisallow: /x/*/private\n', UA);

        assert.equal(robots.isAllowed('/a.json'), false);
        assert.equal(robots.isAllowed('/a.jsonp'), true);
        assert.equal(robots.isAllowed('/x/any/private'), false);
        assert.equal(robots.isAllowed('/x/any/public'), true);
    });

    it('treats an empty Disallow as permission for everything', () => {
        const robots = parseRobots('User-agent: *\nDisallow:\n', UA);

        assert.equal(robots.isAllowed('/anything'), true);
    });

    it('prefers the group naming our user agent over the wildcard group', () => {
        const text = 'User-agent: *\nDisallow: /\n\nUser-agent: sitewalk\nDisallow: /admin/\n';
        const ours = parseRobots(text, UA);

        assert.equal(ours.isAllowed('/'), true);
        assert.equal(ours.isAllowed('/admin/x'), false);

        const others = parseRobots(text, 'SomeOtherBot/1.0');
        assert.equal(others.isAllowed('/'), false);
    });

    it('shares rules across consecutive user-agent lines', () => {
        const robots = parseRobots('User-agent: sitewalk\nUser-agent: otherbot\nDisallow: /shared/\n', UA);

        assert.equal(robots.isAllowed('/shared/x'), false);
    });

    it('reads Crawl-delay and Sitemap hints', () => {
        const robots = parseRobots(
            'Sitemap: https://x.test/sitemap.xml\nUser-agent: *\nCrawl-delay: 2.5\nDisallow: /a\n',
            UA,
        );

        assert.equal(robots.crawlDelay, 2.5);
        assert.deepEqual(robots.sitemaps, ['https://x.test/sitemap.xml']);
    });

    it('ignores comments and blank lines', () => {
        const robots = parseRobots('# hello\n\nUser-agent: *   # everyone\nDisallow: /a   # nope\n', UA);

        assert.equal(robots.isAllowed('/a'), false);
        assert.equal(robots.isAllowed('/b'), true);
    });
});

describe('allowAll', () => {
    it('permits everything and reports itself as unavailable', () => {
        const robots = allowAll();

        assert.equal(robots.isAllowed('/anything'), true);
        assert.equal(robots.available, false);
    });
});
