# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-10

### Added

- Random-walk crawler: starts at one URL, follows a random link per step, reports
  every non-2xx together with the page and link text that led there.
- `robots.txt` support — `Disallow`/`Allow` with longest-match precedence,
  wildcards and `$` anchors, `Crawl-delay`, and `Sitemap:` discovery.
- `rel="nofollow"` is honoured.
- Malformed link detection: unrendered template placeholders (`{{ … }}`, `${…}`)
  and email addresses used as an href without `mailto:`, grouped by defect.
- Per-template budget — URLs are reduced to their shape (`/news/:num/:slug`) so a
  single listing cannot consume the whole run.
- URL normalisation before de-duplication: fragments and tracking parameters
  stripped, query parameters sorted, host lowercased.
- Built-in safety list of state-changing paths (logout, cart, checkout, delete,
  admin, export …) in English and Czech spellings. Only `GET` is ever sent.
- Retries with backoff for network errors and `429`/`502`/`503`/`504`, honouring
  `Retry-After`; these are not counted as failures.
- Redirects are reported and skipped, never followed — except the entry point.
- Early stop once several consecutive steps discover nothing new.
- `--sitemap` seeds extra starting points from `sitemap.xml`, following a sitemap
  index one level deep.
- Configuration via CLI flags, a `sitewalk.config.js` file, or environment
  variables, in that order of precedence.
- JSON output via `--json`, and exit codes suitable for CI: `0` clean, `1` broken
  links found, `2` configuration error.
- Optional HTTP proxy support through `undici`.

[Unreleased]: https://github.com/bitv0id/sitewalk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bitv0id/sitewalk/releases/tag/v0.1.0
