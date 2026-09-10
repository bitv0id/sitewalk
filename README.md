# sitewalk

[![CI](https://github.com/bitv0id/sitewalk/actions/workflows/ci.yml/badge.svg)](https://github.com/bitv0id/sitewalk/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-informational)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-informational)](LICENSE)
[![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-informational)](package.json)

> A random-walk crawler that checks whether a website is actually browsable.

It starts at one URL, loads the page, picks one of the links on it at random,
loads that, and repeats. Anything that is not a `200` is reported together with
the page it was reached from and the text of the link that led there — so a
failure tells you where to click, not just which URL is broken.

Point it at any site. No configuration is required beyond the address.

```console
$ sitewalk https://your-site.example

[1/14] ✓ / → 200
[2/14] ✓ /events/ → 200
[3/14] → /events/archive 301 → /events/?year=2024 (skipped) "Archive"
[4/14] ✗ /events/team.html → 404 ← /events/ "Our team"

────────────────────────────────────────────────────────────────
  Summary
────────────────────────────────────────────────────────────────
  Steps taken         14/14
  Pages OK            12
  Distinct URLs       13  6 page template(s)
  Redirects           1   reported, not followed
  Errors              1
  Links skipped       off-site 104, unsafe path 26, asset 54

  Failures
    HTTP 404 (1x)
      /events/team.html ← /events/ "Our team"

  FAILED — 1 broken link(s)
```

## Contents

- [Why](#why)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Use cases](#use-cases)
- [Running it in CI](#running-it-in-ci)
- [What it reports](#what-it-reports)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Limitations](#limitations)
- [Development](#development)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Author](#author)

## Why

A full crawl of a large site takes hours and mostly re-checks pages that did not
change. A random walk of 100 steps takes two minutes, reaches a different part of
the site every run, and reliably finds the things that break in practice: a route
that vanished in a refactor, a template emitting a wrong URL, a whole section
returning 500 because a service is misconfigured in that environment.

Run it on every deploy and the coverage accumulates.

## Requirements

Node 20 or newer. Nothing else — there are no runtime dependencies.

## Installation

```bash
git clone https://github.com/bitv0id/sitewalk.git
cd sitewalk
npm link
```

`npm link` puts the `sitewalk` command on your `PATH`, which is what every
example in this README assumes. It symlinks this checkout rather than copying it,
so your edits take effect immediately. Remove it again with
`npm unlink -g sitewalk`.

Under nvm the link belongs to the Node version that was active when you ran it —
switch versions and you will need to run `npm link` again.

**Without linking**, run it from the clone and read `node bin/cli.js` wherever an
example says `sitewalk`:

```bash
node bin/cli.js https://example.com
```

`example.com` is a single page with no internal links, so it only proves the
command runs. See [Quick start](#quick-start) for pointing it at a real site.

**Without cloning:**

```bash
npx github:bitv0id/sitewalk https://example.com
```

**In a container**, for hosts that have no Node:

```bash
docker build -t sitewalk .
docker run --rm sitewalk https://example.com --steps 100
```

## Quick start

Point it at a site you own, or at a local development server:

```bash
# 50 steps, the default
sitewalk https://your-site.example

# Against a local development server
sitewalk http://localhost:8000

# Deeper walk, gentler on the server
sitewalk https://your-site.example --steps 200 --delay 1000

# Include subdomains, and seed extra starting points from sitemap.xml
sitewalk https://your-site.example --subdomains --sitemap

# Only failures and the summary, plus a machine-readable result
sitewalk https://your-site.example --quiet --json result.json
```

A step is one request, not one new page: redirects are reported without being
followed, and the walk revisits the entry point whenever it runs out of new
links. Fifty steps usually means somewhat fewer distinct pages, which is what
the summary reports.

Exit code is `0` when no broken links were found, `1` when there were, `2` on a
configuration error.

## Use cases

**Smoke test on every deploy.** Point it at the review app or staging URL as the
last step of the pipeline. Fifty steps take about a minute and catch the class of
breakage unit tests never see.

**Scheduled monitoring of production.** A nightly or weekly walk from cron or a
scheduled pipeline. Because each run takes a different path, coverage accumulates
over time without ever running a full crawl.

**Verifying a migration or redesign.** Walk the old site, walk the new one, compare
the JSON output. Broken links introduced by a CMS migration show up immediately.

**Editorial QA.** On a content-heavy site, editors publish dead links faster than
anyone can check them. A scheduled walk finds them, and the report names the page
and the link text, so the person who wrote it can fix it.

**Catching template bugs.** Unrendered `{{ placeholders }}` in hrefs and email
addresses used without `mailto:` are reported as markup defects, grouped by
defect rather than by page — one broken partial is one line, not two hundred.

**Local check while working.** Run it against `localhost` before opening a pull
request.

## Running it in CI

The exit code is all the integration most systems need, so no wrapper script is
required anywhere. Works in GitLab CI, GitHub Actions, Jenkins, Woodpecker,
Drone — anything that can run Node or a container.

### GitLab CI

```yaml
crawl review:
  stage: test
  image: node:22-alpine
  allow_failure: true
  variables:
    SITEWALK_URL: 'https://$CI_COMMIT_REF_SLUG.review.example.com'
  script:
    - node bin/cli.js --steps 50 --json sitewalk.json
  artifacts:
    when: always
    paths: [sitewalk.json]
  rules:
    - if: $CI_PIPELINE_SOURCE == 'merge_request_event'
```

A fuller version — review apps, a scheduled production job, and notes on proxies
and self-signed staging certificates — is in
[`examples/ci/gitlab-ci.yml`](examples/ci/gitlab-ci.yml).

### GitHub Actions

See [`examples/ci/github-actions.yml`](examples/ci/github-actions.yml) for a
scheduled workflow with a manual trigger and an uploaded JSON artifact.

### cron

See [`examples/ci/crontab`](examples/ci/crontab). With `--quiet` a clean run
prints nothing at all, so cron only mails you when something is broken.

## What it reports

|                     |                                                                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Broken links**    | Any status other than `200`, apart from redirects, plus network failures and timeouts — each with the page and the link text that led there.                                                                                                 |
| **Malformed links** | Hrefs that are defects in the markup rather than broken targets: unrendered template placeholders (`{{ data.url }}`, `${…}`, `<%= … %>`), or an email address used as an href without `mailto:`. Detected in the markup and never requested. |
| **Redirects**       | Reported, never followed. A `301` is a fact about the site, not a failure, and following redirects would let one misconfigured route swallow the whole run.                                                                                  |

With `--json` the same data is written as a structured file: every failure, every
redirect, every malformed href, and the counts of what was skipped and why.

## Configuration

### Command line

```
sitewalk <url> [options]
sitewalk --config sitewalk.config.js
```

| Option                |                                                                   |
| --------------------- | ----------------------------------------------------------------- |
| `-u, --url <url>`     | Entry point. May also be given as the first positional argument.  |
| `-c, --config <path>` | Configuration file (default: `./sitewalk.config.js` when present) |
| `-s, --steps <n>`     | Steps to take, one request each (default 50)                      |
| `--delay <ms>`        | Pause between requests (default 250)                              |
| `--timeout <ms>`      | Per-request timeout (default 15000)                               |
| `--retries <n>`       | Retries for network errors and 429/502/503/504 (default 2)        |
| `--subdomains`        | Treat subdomains of the entry host as part of the site            |
| `--no-robots`         | Ignore `robots.txt` and `rel=nofollow` — only for a site you own  |
| `--sitemap`           | Seed extra starting points from `sitemap.xml`                     |
| `--seed <url>`        | Extra starting point, repeatable                                  |
| `--exclude <pattern>` | Skip matching paths, repeatable                                   |
| `--per-template <n>`  | Max pages per URL shape (default 8)                               |
| `--user-agent <s>`    | User-Agent to send                                                |
| `--proxy <url>`       | Route requests through an HTTP proxy                              |
| `--insecure`          | Accept invalid TLS certificates                                   |
| `--json <path>`       | Write the full result as JSON                                     |
| `-q, --quiet`         | Only failures and the summary                                     |
| `-h, --help`          | Show help                                                         |
| `-V, --version`       | Show the version                                                  |

### Configuration file

Copy [`sitewalk.config.example.js`](sitewalk.config.example.js) to
`sitewalk.config.js` and it is picked up automatically:

```js
export default {
  url: 'https://example.com',
  steps: 100,
  subdomains: true,
  exclude: ['/search', /\?page=\d{3,}/],
  perTemplate: 5,
};
```

That filename is git-ignored, so target hostnames stay out of the repository.

### Environment

`SITEWALK_URL`, `SITEWALK_STEPS`, `SITEWALK_PROXY`, `SITEWALK_INSECURE`, and `HTTP_PROXY`
(lowercase `http_proxy` is accepted too).

Order of precedence: **defaults → config file → environment → command line**.

### Proxy

A proxy is the one thing that needs a package, because `fetch` has no built-in
proxy support:

```bash
npm install undici
sitewalk https://your-site.example --proxy http://proxy.internal:3128
```

## How it works

### Behaviour on an unknown site

The defaults assume you may be pointing this at a site you do not control:

|                      |                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `robots.txt`         | Read and honoured, including `Crawl-delay`. It is the site owner's own statement about where a crawler may go.                                           |
| `rel="nofollow"`     | Honoured.                                                                                                                                                |
| Requests             | One at a time, with a pause between them. Never anything but `GET`.                                                                                      |
| State-changing paths | A built-in list of routes that log out, delete, order, download or otherwise act rather than display is never followed — in English and Czech spellings. |
| Rate limiting        | `429`, `502`, `503` and `504` are retried with backoff, honouring `Retry-After`, and are not counted as failures.                                        |
| Scope                | Only the entry host. Apex and `www` count as the same site; anything else needs `--subdomains`.                                                          |

### Traps it avoids

A crawler pointed at an arbitrary site walks into infinite URL spaces —
calendars, faceted filters, pagination without end. Every URL is therefore
reduced to the _shape_ of the page behind it:

```
/news/12345/some-article-title?page=2   →   /news/:num/:slug?page
```

At most `--per-template` pages are visited per shape, so one listing cannot
consume the whole run. URLs are also normalised before de-duplication: fragments
and tracking parameters are stripped, query parameters sorted, host lowercased —
otherwise the same page reached three ways counts as three pages.

The walk stops early once several consecutive steps discover nothing new, so a
small site does not burn a large `--steps` budget re-reading itself.

## Limitations

- **Client-rendered pages.** Links built by JavaScript are not in the HTML, so
  there is nothing to follow. `--sitemap` is the workaround: it seeds real URLs
  from `sitemap.xml` and checks those instead of discovering them.
- **Content behind a login.** Only the public site is reachable.
- **Soft 404s.** A page that returns `200` with "not found" in the body counts as
  fine.
- **One host per run.** Sites split across several domains need one run each.

## Development

```bash
npm test          # Node's built-in test runner, no install needed
npm install       # eslint + prettier, for linting only
npm run lint
npm run format
npm run check     # lint + format check + tests
```

The module layout and the constraints the project holds itself to are described
in [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

Ideas, not promises:

- Additional checks beyond the walk — a fixed URL list, feed validation, expected
  status codes for legacy routes, response header assertions, content assertions.
- Comparing two JSON results, for before-and-after migration checks.
- JUnit XML output, so CI systems can render failures natively.
- Optional headless rendering for client-rendered sites.
- Publishing to npm.

## Contributing

Bug reports, ideas and pull requests are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md), the
[Code of Conduct](CODE_OF_CONDUCT.md), and the
[Security policy](SECURITY.md).

Release notes are in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © bitv0id

## Author

**bitv0id**

- Email: <4squall@gmail.com>
- GitHub: [@bitv0id](https://github.com/bitv0id)

Questions and bug reports are best filed as
[issues](https://github.com/bitv0id/sitewalk/issues); email is fine for anything
that does not belong in public.
