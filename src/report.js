import { bold, dim, fail, info, ok, pad, warn } from './colors.js';
import { shortUrl } from './url.js';

/** How many entries of one kind to print before collapsing the rest into a count. */
const LIST_LIMIT = 10;

const SKIP_LABELS = {
    offsite: 'off-site',
    robots: 'robots.txt',
    unsafe: 'unsafe path',
    asset: 'asset',
    budget: 'template budget',
    excluded: 'excluded',
    nofollow: 'rel=nofollow',
    suspicious: 'malformed href',
};

function describeClick(clicked) {
    return clicked?.text ? dim(`“${clicked.text}”`) : '';
}

/** Redirect targets read better as a path, unless they leave the current host. */
function redirectTarget(location, from) {
    if (!location) {
        return 'no Location header';
    }

    try {
        const target = new URL(location, from);

        return target.host === new URL(from).host ? shortUrl(target.href) : target.href;
    } catch {
        return location;
    }
}

export function createReport({ quiet = false } = {}) {
    const out = (text) => process.stdout.write(`${text}\n`);

    return {
        header(config, robots) {
            out('');
            out(bold(info('sitewalk')));
            out(`  target      ${bold(config.url)}`);
            out(`  steps       ${bold(String(config.steps))}   delay ${config.delay}ms   timeout ${config.timeout}ms`);
            out(`  scope       ${config.subdomains ? 'host and its subdomains' : 'single host'}`);
            out(
                `  robots.txt  ${
                    !config.respectRobots
                        ? warn('ignored')
                        : robots.available
                          ? `honoured${robots.crawlDelay ? `, crawl-delay ${robots.crawlDelay}s` : ''}`
                          : dim('not found')
                }`,
            );
            out('');
        },

        seeds(count, source) {
            out(`  ${dim(`+ ${count} seed URL(s) from ${source}`)}`);
        },

        ok(progress, url, status) {
            if (!quiet) {
                out(`${progress} ${ok('✓')} ${shortUrl(url)} ${dim('→')} ${ok(status)}`);
            }
        },

        failure(progress, url, status, from, clicked, detail) {
            const parts = [
                progress,
                fail('✗'),
                shortUrl(url),
                dim('→'),
                fail(status),
                dim('←'),
                shortUrl(from),
                describeClick(clicked),
                detail ? dim(detail) : '',
            ];
            out(parts.filter(Boolean).join(' '));
        },

        redirect(progress, url, status, location, note, clicked) {
            if (!quiet) {
                const target = redirectTarget(location, url);
                out(
                    [progress, dim('→'), shortUrl(url), dim(`${status} → ${target} (${note})`), describeClick(clicked)]
                        .filter(Boolean)
                        .join(' '),
                );
            }
        },

        note(progress, text) {
            if (!quiet) {
                out(`${progress} ${dim('ℹ')} ${dim(text)}`);
            }
        },

        summary(stats) {
            const line = dim('─'.repeat(64));
            const skipped = Object.entries(stats.skipped).filter(([, count]) => count > 0);

            out('');
            out(line);
            out(bold('  Summary'));
            out(line);
            out(`  ${pad('Steps taken', 20)}${bold(`${stats.stepsUsed}/${stats.steps}`)}`);
            out(`  ${pad('Pages OK', 20)}${ok(String(stats.pagesOk))}`);
            out(
                `  ${pad('Distinct URLs', 20)}${bold(String(stats.visited))}  ${dim(`${stats.templates} page template(s)`)}`,
            );
            out(`  ${pad('Redirects', 20)}${bold(String(stats.redirects.length))}  ${dim('reported, not followed')}`);
            out(`  ${pad('Errors', 20)}${stats.errors.length > 0 ? fail(String(stats.errors.length)) : ok('0')}`);

            if (skipped.length > 0) {
                const detail = skipped.map(([key, count]) => `${SKIP_LABELS[key] ?? key} ${count}`).join(', ');
                out(`  ${pad('Links skipped', 20)}${dim(detail)}`);
            }

            if (stats.warnings.length > 0) {
                out('');
                out(`  ${warn('Malformed links')} ${dim('(detected in markup, not requested)')}`);

                // The same broken href usually repeats on every page built from
                // one template — group by the defect, not by the page.
                const groups = new Map();
                for (const warning of stats.warnings) {
                    const key = `${warning.reason}|${warning.href}`;
                    const group = groups.get(key) ?? { ...warning, count: 0, pages: new Set() };
                    group.count++;
                    group.pages.add(warning.from);
                    groups.set(key, group);
                }

                const ordered = [...groups.values()].sort((a, b) => b.count - a.count);
                for (const group of ordered.slice(0, LIST_LIMIT)) {
                    out(
                        [
                            `      ${pad(`${group.count}x`, 5, 'right')}`,
                            `href="${group.href}"`,
                            dim(`— ${group.reason}`),
                            dim(`on ${group.pages.size} page(s), e.g. ${shortUrl([...group.pages][0])}`),
                        ].join(' '),
                    );
                }
                if (ordered.length > LIST_LIMIT) {
                    out(dim(`      … and ${ordered.length - LIST_LIMIT} more`));
                }
            }

            if (stats.errors.length > 0) {
                out('');
                out(`  ${fail('Failures')}`);

                const grouped = new Map();
                for (const error of stats.errors) {
                    const key = String(error.status);
                    grouped.set(key, [...(grouped.get(key) ?? []), error]);
                }

                for (const [status, items] of [...grouped.entries()].sort()) {
                    out(
                        `    ${fail(status === 'network' ? 'network error' : `HTTP ${status}`)} ${dim(`(${items.length}x)`)}`,
                    );
                    for (const { url, from, clicked, detail } of items) {
                        out(
                            [
                                `      ${shortUrl(url)}`,
                                dim('←'),
                                shortUrl(from),
                                describeClick(clicked),
                                detail ? dim(detail) : '',
                            ]
                                .filter(Boolean)
                                .join(' '),
                        );
                    }
                }
            }

            if (stats.redirects.length > 0 && !quiet) {
                out('');
                out(`  ${dim('Redirects')}`);
                for (const { url, status, location } of stats.redirects.slice(0, LIST_LIMIT)) {
                    out(dim(`      ${status}  ${shortUrl(url)} → ${redirectTarget(location, url)}`));
                }
                if (stats.redirects.length > LIST_LIMIT) {
                    out(dim(`      … and ${stats.redirects.length - LIST_LIMIT} more`));
                }
            }

            out('');
            out(
                stats.errors.length > 0
                    ? `  ${fail(`FAILED — ${stats.errors.length} broken link(s)`)}`
                    : `  ${ok('PASSED — no broken links found')}`,
            );
            out('');
        },
    };
}
