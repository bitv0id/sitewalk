/**
 * Copy to sitewalk.config.js and edit. The local copy is git-ignored, so target
 * hostnames never end up in the repository.
 *
 * Every value here is optional except `url`.
 */
export default {
    url: 'https://example.com',

    // How many pages to visit. The walk stops early once nothing new is left.
    steps: 50,

    // Pause between requests. Raise it on small servers or behind a strict WAF.
    delay: 250,

    // Follow links to subdomains of the target host as well.
    subdomains: false,

    // robots.txt rules and rel="nofollow" are honoured by default.
    // Turn this off only for a site you own.
    respectRobots: true,

    // Add starting points from sitemap.xml. Useful when the entry page links to
    // very little, or when most links are rendered client-side.
    sitemap: false,

    // Extra starting points, picked up when the walk runs out of new links.
    seeds: [],

    // Skipped on top of robots.txt. A string starting with "/" matches a path
    // prefix, any other string matches a substring, and regular expressions work too.
    exclude: [
        // '/search',
        // /\?page=\d{3,}/,
    ],

    // Cap per URL shape, so a single listing cannot swallow the whole run:
    // /news/12/some-title and /news/34/other-title share the shape /news/:num/:slug.
    perTemplate: 8,

    // Requests through an HTTP proxy need the optional undici package.
    // proxy: 'http://proxy.internal:3128',

    // Accept invalid certificates, e.g. on a staging box with a self-signed cert.
    insecureTLS: false,

    // Write the full machine-readable result next to the console output.
    // json: 'results/latest.json',
};
