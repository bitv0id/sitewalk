# Contributing

Thanks for taking the time. Bug reports, ideas and pull requests are all welcome.

## Getting started

```bash
git clone https://github.com/bitv0id/sitewalk.git
cd sitewalk
node bin/cli.js https://example.com --steps 10
```

There are no runtime dependencies, so the tool runs straight from a clone.
Development tooling is optional and only needed to lint or format:

```bash
npm install     # eslint + prettier
npm test        # uses the Node built-in test runner, no install needed
npm run check   # lint + format check + tests
```

Node 20 or newer.

## Working on the code

Every module has one job:

| File             | Responsibility                                            |
| ---------------- | --------------------------------------------------------- |
| `bin/cli.js`     | Entry point, exit codes                                   |
| `src/config.js`  | Defaults, CLI flags, config file, environment, validation |
| `src/main.js`    | Wiring: build the client, read robots.txt, run, report    |
| `src/crawler.js` | The walk itself and everything it decides to skip         |
| `src/http.js`    | One request: timeouts, retries, proxy, body handling      |
| `src/robots.js`  | `robots.txt` parsing and rule matching                    |
| `src/sitemap.js` | Seed URLs from `sitemap.xml`                              |
| `src/url.js`     | Resolution, normalisation, scope, shape, safety checks    |
| `src/links.js`   | Extracting anchors from HTML                              |
| `src/report.js`  | Everything printed to the terminal                        |

Guidelines:

- **No runtime dependencies.** This is a deliberate constraint. Anything the tool
  needs at run time should be in the standard library, or it does not go in.
  `undici` is the single exception and is loaded dynamically, only when a proxy
  is configured.
- **Safe by default.** The tool gets pointed at sites people do not own. New
  behaviour must not send anything but `GET`, must not follow paths that look
  state-changing, and must not ignore `robots.txt` unless explicitly told to.
- **Comments explain why, not what.** The code should say what it does on its own.
- Match the surrounding style: 4 spaces, single quotes, trailing commas.

## Tests

Tests use the Node built-in runner (`node:test`), so no install is required:

```bash
npm test
node --test test/url.test.js    # a single file
```

Anything touching URL handling, `robots.txt` matching or the crawler's skip rules
needs a test — those are the parts where a subtle mistake silently changes what
gets checked.

## Pull requests

1. Branch from `main`.
2. Keep the change focused; unrelated cleanups belong in their own PR.
3. Run `npm run check` before pushing.
4. Add a line to `CHANGELOG.md` under `## [Unreleased]`.
5. Describe what changed and why. If it changes what the crawler visits or skips,
   say so explicitly.

## Reporting bugs

Include the command you ran, the output, and the Node version. If the site is
public, the URL helps enormously — most bugs here are "this particular markup
does something unexpected".
