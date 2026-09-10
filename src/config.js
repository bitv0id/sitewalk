import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONFIG_FILENAMES = ['sitewalk.config.js', 'sitewalk.config.mjs'];

export const DEFAULTS = {
    url: null,
    steps: 50,
    delay: 250,
    timeout: 15000,
    retries: 2,
    userAgent: 'sitewalk/0.1 (link checker)',
    acceptLanguage: '*',
    subdomains: false,
    respectRobots: true,
    sitemap: false,
    seeds: [],
    exclude: [],
    perTemplate: 8,
    insecureTLS: false,
    proxy: null,
    json: null,
    quiet: false,
};

export const HELP = `
sitewalk — random-walk crawler that checks a website for broken links.

Usage
  sitewalk <url> [options]
  sitewalk --config sitewalk.config.js

Options
  -u, --url <url>          Entry point to start walking from.
  -c, --config <path>      Configuration file (default: ./sitewalk.config.js when present).
  -s, --steps <n>          Number of pages to visit (default: ${DEFAULTS.steps}).
      --delay <ms>         Pause between requests (default: ${DEFAULTS.delay}).
      --timeout <ms>       Per-request timeout (default: ${DEFAULTS.timeout}).
      --retries <n>        Retries for network errors and 429/502/503/504 (default: ${DEFAULTS.retries}).
      --subdomains         Treat subdomains of the entry host as part of the site.
      --no-robots          Do not read robots.txt (rules and rel=nofollow are ignored).
      --sitemap            Seed extra starting points from sitemap.xml.
      --seed <url>         Extra starting point, repeatable.
      --exclude <pattern>  Skip paths starting with, or containing, this string. Repeatable.
      --per-template <n>   Max pages per URL shape, e.g. /news/:num/:slug (default: ${DEFAULTS.perTemplate}).
      --user-agent <s>     User-Agent header to send.
      --proxy <url>        Send requests through an HTTP proxy (needs: npm install undici).
      --insecure           Accept invalid TLS certificates.
      --json <path>        Write the full result as JSON.
  -q, --quiet              Only print failures and the summary.
  -h, --help               Show this help.
  -V, --version            Show the version.

Environment
  SITEWALK_URL, SITEWALK_STEPS, SITEWALK_PROXY, SITEWALK_INSECURE, HTTP_PROXY

Exit code
  0 when no broken links were found, 1 when there were, 2 on a configuration error.
`;

class ConfigError extends Error {}

function toInt(value, flag) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number) || number < 0) {
        throw new ConfigError(`Option ${flag} expects a non-negative number, got "${value}".`);
    }

    return number;
}

export function parseArgs(argv) {
    const cli = { seeds: [], exclude: [] };
    let configPath = null;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = () => {
            const value = argv[++i];
            if (value === undefined) {
                throw new ConfigError(`Option ${arg} expects a value.`);
            }

            return value;
        };

        switch (arg) {
            case '-h':
            case '--help':
                return { help: true };
            case '-V':
            case '--version':
                return { version: true };
            case '-u':
            case '--url':
                cli.url = next();
                break;
            case '-c':
            case '--config':
                configPath = next();
                break;
            case '-s':
            case '--steps':
                cli.steps = toInt(next(), arg);
                break;
            case '--delay':
                cli.delay = toInt(next(), arg);
                break;
            case '--timeout':
                cli.timeout = toInt(next(), arg);
                break;
            case '--retries':
                cli.retries = toInt(next(), arg);
                break;
            case '--per-template':
                cli.perTemplate = toInt(next(), arg);
                break;
            case '--subdomains':
                cli.subdomains = true;
                break;
            case '--no-robots':
                cli.respectRobots = false;
                break;
            case '--sitemap':
                cli.sitemap = true;
                break;
            case '--seed':
                cli.seeds.push(next());
                break;
            case '--exclude':
                cli.exclude.push(next());
                break;
            case '--user-agent':
                cli.userAgent = next();
                break;
            case '--proxy':
                cli.proxy = next();
                break;
            case '--insecure':
                cli.insecureTLS = true;
                break;
            case '--json':
                cli.json = next();
                break;
            case '-q':
            case '--quiet':
                cli.quiet = true;
                break;
            default:
                if (arg.startsWith('-')) {
                    throw new ConfigError(`Unknown option ${arg}. Run with --help to see what is available.`);
                }
                cli.url ??= arg;
        }
    }

    if (cli.seeds.length === 0) {
        delete cli.seeds;
    }
    if (cli.exclude.length === 0) {
        delete cli.exclude;
    }

    return { cli, configPath };
}

function fromEnvironment(env) {
    const values = {};

    if (env.SITEWALK_URL) {
        values.url = env.SITEWALK_URL;
    }
    if (env.SITEWALK_STEPS) {
        values.steps = toInt(env.SITEWALK_STEPS, 'SITEWALK_STEPS');
    }
    if (env.SITEWALK_PROXY || env.HTTP_PROXY || env.http_proxy) {
        values.proxy = env.SITEWALK_PROXY || env.HTTP_PROXY || env.http_proxy;
    }
    if (env.SITEWALK_INSECURE === '1' || env.SITEWALK_INSECURE === 'true') {
        values.insecureTLS = true;
    }

    return values;
}

async function loadConfigFile(configPath) {
    const explicit = Boolean(configPath);
    const candidates = explicit ? [configPath] : CONFIG_FILENAMES;

    for (const candidate of candidates) {
        const absolute = resolve(process.cwd(), candidate);
        if (!existsSync(absolute)) {
            continue;
        }

        const module = await import(pathToFileURL(absolute).href);
        const config = module.default ?? module.config;
        if (!config || typeof config !== 'object') {
            throw new ConfigError(`${candidate} must export a configuration object as its default export.`);
        }

        return { config, path: absolute };
    }

    if (explicit) {
        throw new ConfigError(`Configuration file not found: ${configPath}`);
    }

    return { config: {}, path: null };
}

/**
 * Exclude patterns are plain strings on the command line and may be regular
 * expressions in a configuration file; both end up as a predicate over path+query.
 */
function compileExcludes(patterns) {
    return patterns.map((pattern) => {
        if (pattern instanceof RegExp) {
            return (path) => pattern.test(path);
        }

        const value = String(pattern);

        return value.startsWith('/') ? (path) => path.startsWith(value) : (path) => path.includes(value);
    });
}

export async function loadConfig(argv, env = process.env) {
    const parsed = parseArgs(argv);
    if (parsed.help || parsed.version) {
        return parsed;
    }

    const { config: fileConfig, path } = await loadConfigFile(parsed.configPath);
    const merged = { ...DEFAULTS, ...fileConfig, ...fromEnvironment(env), ...parsed.cli };

    if (!merged.url) {
        throw new ConfigError('No target URL. Pass one as an argument, or set "url" in a configuration file.');
    }

    let target;
    try {
        target = new URL(merged.url);
    } catch {
        throw new ConfigError(
            `"${merged.url}" is not a valid URL. Include the scheme, for example https://example.com`,
        );
    }

    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        throw new ConfigError(`Only http and https targets are supported, got "${target.protocol}".`);
    }

    if (merged.steps < 1) {
        throw new ConfigError('"steps" must be at least 1.');
    }

    return {
        ...merged,
        url: target.href,
        seeds: [...(merged.seeds ?? [])],
        exclude: compileExcludes(merged.exclude ?? []),
        excludeSource: [...(merged.exclude ?? [])].map(String),
        configPath: path,
    };
}

export { ConfigError };
