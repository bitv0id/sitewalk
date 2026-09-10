/**
 * Seed URLs from sitemap.xml. Useful on sites where the entry page links to
 * very little, and as a fallback where links are rendered client-side and the
 * HTML alone yields nothing to walk.
 */

const LOC = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

function extractLocations(xml) {
    const locations = [];
    let match;

    while ((match = LOC.exec(xml)) !== null) {
        locations.push(match[1].replace(/&amp;/gi, '&'));
    }
    LOC.lastIndex = 0;

    return locations;
}

function isSitemapIndex(xml) {
    return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * Collect page URLs from the given sitemap entry points, following a sitemap
 * index one level deep. Returns at most `limit` URLs, sampled at random so
 * repeated runs cover different parts of a large site.
 */
export async function collectSitemapUrls(client, entryPoints, { limit = 25, maxDocuments = 5 } = {}) {
    const found = new Set();
    const queue = [...entryPoints];
    let documents = 0;

    while (queue.length > 0 && documents < maxDocuments && found.size < limit * 20) {
        const url = queue.shift();
        documents++;

        const response = await client.get(url, { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' });
        if (response.error || response.status !== 200 || !response.body) {
            continue;
        }

        const locations = extractLocations(response.body);
        if (isSitemapIndex(response.body)) {
            for (const location of shuffle(locations).slice(0, maxDocuments - documents)) {
                queue.push(location);
            }
            continue;
        }

        for (const location of locations) {
            found.add(location);
        }
    }

    return shuffle([...found]).slice(0, limit);
}

export function shuffle(items) {
    const copy = [...items];

    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
}
