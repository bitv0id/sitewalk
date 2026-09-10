import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { warn } from './colors.js';
import { ConfigError, HELP, loadConfig } from './config.js';
import { Crawler } from './crawler.js';
import { createClient } from './http.js';
import { createReport } from './report.js';
import { allowAll, parseRobots } from './robots.js';
import { collectSitemapUrls } from './sitemap.js';

function version() {
    const manifest = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');

    return JSON.parse(readFileSync(manifest, 'utf8')).version;
}

async function loadRobots(client, config) {
    if (!config.respectRobots) {
        return allowAll();
    }

    const response = await client.get(new URL('/robots.txt', config.url).href, { accept: 'text/plain,*/*;q=0.8' });
    if (response.error || response.status !== 200 || typeof response.body !== 'string') {
        return allowAll();
    }

    return parseRobots(response.body, config.userAgent);
}

async function seedFromSitemap(client, crawler, robots, config, report) {
    const entryPoints = robots.sitemaps.length > 0 ? robots.sitemaps : [new URL('/sitemap.xml', config.url).href];
    const urls = await collectSitemapUrls(client, entryPoints);
    if (urls.length === 0) {
        return;
    }

    const added = crawler.addSeeds(urls);
    if (added > 0) {
        report.seeds(added, 'sitemap.xml');
    }
}

export async function run(argv) {
    let config;

    try {
        const parsed = await loadConfig(argv);
        if (parsed.help) {
            process.stdout.write(`${HELP}\n`);

            return 0;
        }
        if (parsed.version) {
            process.stdout.write(`${version()}\n`);

            return 0;
        }
        config = parsed;
    } catch (error) {
        if (error instanceof ConfigError) {
            process.stderr.write(`${error.message}\n`);

            return 2;
        }
        throw error;
    }

    if (config.insecureTLS) {
        // fetch has no per-request TLS switch without a custom dispatcher.
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        process.stderr.write(`${warn('TLS certificate verification is disabled for this run.')}\n`);
    }

    const client = createClient(config);
    const report = createReport({ quiet: config.quiet });
    const robots = await loadRobots(client, config);

    report.header(config, robots);

    if (config.respectRobots && !robots.isAllowed(new URL(config.url).pathname)) {
        process.stderr.write(
            `${warn('robots.txt disallows the entry point. Use --no-robots if you own this site.')}\n`,
        );

        return 2;
    }

    const crawler = new Crawler({ config, client, robots, report });

    if (config.sitemap) {
        await seedFromSitemap(client, crawler, robots, config, report);
    }

    const stats = await crawler.run();
    report.summary(stats);

    if (config.json) {
        writeFileSync(
            config.json,
            `${JSON.stringify(
                {
                    target: config.url,
                    startedFrom: stats.start,
                    finishedAt: new Date().toISOString(),
                    settings: {
                        steps: config.steps,
                        delay: config.delay,
                        subdomains: config.subdomains,
                        respectRobots: config.respectRobots,
                        perTemplate: config.perTemplate,
                        exclude: config.excludeSource,
                    },
                    ...stats,
                },
                null,
                2,
            )}\n`,
        );
    }

    return stats.errors.length > 0 ? 1 : 0;
}
