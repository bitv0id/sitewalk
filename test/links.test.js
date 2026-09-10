import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { clickScore, documentBase, extractAnchors } from '../src/links.js';

describe('extractAnchors', () => {
    it('reads href, attributes and visible text', () => {
        const [link] = extractAnchors('<a href="/a" id="main" class="js-link" aria-label="Go">Read <b>more</b></a>');

        assert.equal(link.href, '/a');
        assert.equal(link.id, 'main');
        assert.equal(link.className, 'js-link');
        assert.equal(link.ariaLabel, 'Go');
        assert.equal(link.text, 'Read more');
    });

    it('handles unquoted and single-quoted attributes', () => {
        const links = extractAnchors("<a href=/a>A</a><a href='/b'>B</a>");

        assert.deepEqual(
            links.map((link) => link.href),
            ['/a', '/b'],
        );
    });

    it('skips anchors without an href', () => {
        assert.equal(extractAnchors('<a name="anchor">x</a>').length, 0);
    });

    it('picks up test identifiers and rel', () => {
        const [link] = extractAnchors('<a href="/a" data-testid="cta" rel="NOFOLLOW noopener">x</a>');

        assert.equal(link.identifier, 'cta');
        assert.equal(link.rel, 'nofollow noopener');
    });

    it('collapses whitespace and caps very long link text', () => {
        const [link] = extractAnchors(`<a href="/a">${'x'.repeat(200)}</a>`);

        assert.equal(link.text.length, 80);
    });
});

describe('documentBase', () => {
    it('honours a <base href> when the document sets one', () => {
        assert.equal(documentBase('<base href="/app/">', 'https://x.test/page'), 'https://x.test/app/');
    });

    it('falls back to the document URL', () => {
        assert.equal(documentBase('<p>no base</p>', 'https://x.test/page'), 'https://x.test/page');
    });
});

describe('clickScore', () => {
    it('ranks identifiable links above anonymous ones', () => {
        const identified = { id: 'cta', identifier: '', className: '', text: 'Buy', ariaLabel: '' };
        const anonymous = { id: '', identifier: '', className: '', text: '', ariaLabel: '' };

        assert.ok(clickScore(identified) > clickScore(anonymous));
    });
});
