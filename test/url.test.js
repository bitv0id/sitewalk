import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    hostInScope,
    isAsset,
    isUnsafe,
    normalize,
    pathTemplate,
    resolveHref,
    shortUrl,
    suspicious,
} from '../src/url.js';

describe('resolveHref', () => {
    it('resolves relative links against the document', () => {
        assert.equal(resolveHref('/a', 'https://x.test/b/c').href, 'https://x.test/a');
        assert.equal(resolveHref('d', 'https://x.test/b/c').href, 'https://x.test/b/d');
    });

    it('rejects non-navigational schemes and bare fragments', () => {
        for (const href of ['javascript:void(0)', 'mailto:a@b.test', 'tel:+420', 'data:text/html,x', '#top', '']) {
            assert.equal(resolveHref(href, 'https://x.test/'), null, href);
        }
    });

    it('decodes entities that survive in raw markup', () => {
        assert.equal(resolveHref('/a?x=1&amp;y=2', 'https://x.test/').href, 'https://x.test/a?x=1&y=2');
    });
});

describe('normalize', () => {
    it('drops the fragment, lowercases the host and removes the default port', () => {
        assert.equal(normalize('https://Example.COM:443/a#top'), 'https://example.com/a');
        assert.equal(normalize('http://example.com:80/a'), 'http://example.com/a');
    });

    it('strips tracking parameters and sorts the rest', () => {
        assert.equal(normalize('https://x.test/a?b=2&utm_source=news&a=1&fbclid=zz'), 'https://x.test/a?a=1&b=2');
    });

    it('keeps the trailing slash, which servers may treat as a different resource', () => {
        assert.notEqual(normalize('https://x.test/a'), normalize('https://x.test/a/'));
    });
});

describe('hostInScope', () => {
    it('treats apex and www as the same site', () => {
        assert.equal(hostInScope('www.x.test', 'x.test'), true);
        assert.equal(hostInScope('x.test', 'www.x.test'), true);
    });

    it('excludes other subdomains unless asked', () => {
        assert.equal(hostInScope('blog.x.test', 'x.test'), false);
        assert.equal(hostInScope('blog.x.test', 'x.test', true), true);
    });

    it('never matches a different registrable domain', () => {
        assert.equal(hostInScope('x.test.evil.test', 'x.test', true), false);
        assert.equal(hostInScope('notx.test', 'x.test', true), false);
    });
});

describe('pathTemplate', () => {
    it('collapses ids and slugs into a shape', () => {
        assert.equal(pathTemplate('https://x.test/news/12345/some-article-title'), '/news/:num/:slug');
        assert.equal(pathTemplate('https://x.test/p/550e8400-e29b-41d4-a716-446655440000'), '/p/:uuid');
    });

    it('keeps short static segments literal', () => {
        assert.equal(pathTemplate('https://x.test/about/team'), '/about/team');
    });

    it('groups by parameter names, not their values', () => {
        assert.equal(pathTemplate('https://x.test/l?page=2'), pathTemplate('https://x.test/l?page=99'));
        assert.notEqual(pathTemplate('https://x.test/l?page=2'), pathTemplate('https://x.test/l?page=2&sort=asc'));
    });
});

describe('isAsset', () => {
    it('recognises files that are not pages', () => {
        for (const path of ['/a.pdf', '/a.JPG', '/style.css', '/app.min.js', '/f.woff2']) {
            assert.equal(isAsset(path), true, path);
        }
    });

    it('leaves pages alone', () => {
        for (const path of ['/a', '/a/', '/news/some-title', '/a.html']) {
            assert.equal(isAsset(path), false, path);
        }
    });
});

describe('isUnsafe', () => {
    it('blocks paths that act rather than display', () => {
        for (const url of [
            'https://x.test/logout',
            'https://x.test/user/sign-out',
            'https://x.test/odhlaseni/',
            'https://x.test/cart',
            'https://x.test/checkout/step-1',
            'https://x.test/wp-admin/',
            'https://x.test/p?action=delete',
        ]) {
            assert.equal(isUnsafe(new URL(url)), true, url);
        }
    });

    it('does not block ordinary content that merely contains a keyword', () => {
        for (const url of ['https://x.test/blog/logistika', 'https://x.test/prints-and-posters', 'https://x.test/']) {
            assert.equal(isUnsafe(new URL(url)), false, url);
        }
    });
});

describe('suspicious', () => {
    it('flags template placeholders that reached the browser unrendered', () => {
        assert.match(suspicious(new URL('https://x.test/{{ data.url }}')), /placeholder/);
        assert.match(suspicious(new URL('https://x.test/${item.href}')), /placeholder/);
    });

    it('flags an email address used as an href', () => {
        assert.match(suspicious(new URL('https://x.test/info@x.test')), /mailto/);
    });

    it('passes ordinary URLs', () => {
        assert.equal(suspicious(new URL('https://x.test/news/hello-world')), null);
    });
});

describe('shortUrl', () => {
    it('reduces a URL to path and query', () => {
        assert.equal(shortUrl('https://x.test/a/b?c=1'), '/a/b?c=1');
    });
});
