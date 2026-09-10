import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULTS, loadConfig, parseArgs } from '../src/config.js';

describe('parseArgs', () => {
    it('takes the target as a positional argument', () => {
        assert.equal(parseArgs(['https://x.test']).cli.url, 'https://x.test');
    });

    it('collects repeatable options', () => {
        const { cli } = parseArgs(['--seed', 'https://x.test/a', '--seed', 'https://x.test/b', '--exclude', '/p']);

        assert.deepEqual(cli.seeds, ['https://x.test/a', 'https://x.test/b']);
        assert.deepEqual(cli.exclude, ['/p']);
    });

    it('rejects unknown options and missing values', () => {
        assert.throws(() => parseArgs(['--bogus']), /Unknown option/);
        assert.throws(() => parseArgs(['--steps']), /expects a value/);
        assert.throws(() => parseArgs(['--steps', 'lots']), /non-negative number/);
    });

    it('short-circuits on help and version', () => {
        assert.equal(parseArgs(['--help']).help, true);
        assert.equal(parseArgs(['-V']).version, true);
    });
});

describe('loadConfig', () => {
    it('falls back to the documented defaults', async () => {
        const config = await loadConfig(['https://x.test'], {});

        assert.equal(config.steps, DEFAULTS.steps);
        assert.equal(config.respectRobots, true);
        assert.equal(config.url, 'https://x.test/');
    });

    it('lets the command line win over the environment', async () => {
        const fromEnv = await loadConfig(['https://x.test'], { SITEWALK_STEPS: '7' });
        assert.equal(fromEnv.steps, 7);

        const fromCli = await loadConfig(['https://x.test', '--steps', '9'], { SITEWALK_STEPS: '7' });
        assert.equal(fromCli.steps, 9);
    });

    it('picks up a proxy from the usual environment variables', async () => {
        const config = await loadConfig(['https://x.test'], { HTTP_PROXY: 'http://proxy.test:3128' });

        assert.equal(config.proxy, 'http://proxy.test:3128');
    });

    it('compiles exclude patterns into matchers over path and query', async () => {
        const config = await loadConfig(['https://x.test', '--exclude', '/private', '--exclude', 'draft'], {});

        assert.equal(config.exclude.length, 2);
        assert.equal(config.exclude[0]('/private/x'), true);
        assert.equal(config.exclude[0]('/public/private'), false, 'a leading slash anchors to a prefix');
        assert.equal(config.exclude[1]('/news/draft-1'), true, 'anything else matches a substring');
    });

    it('explains what is wrong instead of crashing', async () => {
        await assert.rejects(() => loadConfig([], {}), /No target URL/);
        await assert.rejects(() => loadConfig(['not-a-url'], {}), /not a valid URL/);
        await assert.rejects(() => loadConfig(['ftp://x.test'], {}), /http and https/);
        await assert.rejects(() => loadConfig(['https://x.test', '--config', '/nope.js'], {}), /not found/);
    });
});
