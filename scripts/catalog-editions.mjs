#!/usr/bin/env node

/**
 * Read-only research helper for the public commerce-platform release archives.
 *
 * It intentionally writes to stdout only. The source pages have used several
 * different HTML structures since 2022, so extraction is based on their
 * stable feature anchors and product markers rather than CSS class names.
 */

const EDITIONS = [
  'summer2022',
  'winter2023',
  'summer2023',
  'winter2024',
  'summer2024',
  'winter2025',
  'summer2025',
  'winter2026',
  'spring2026',
];

const BASE_URL = 'https://www.shopify.com/es-es/editions';

function decodeHtml(value) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    hellip: '…',
    laquo: '«',
    lt: '<',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    raquo: '»',
  };

  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, entity) => named[entity] ?? match);
}

function textContent(value) {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function slugFromMarker(marker) {
  const extraHandle = marker.match(/data-component-extra-handle="([^"]+)"/i)?.[1];
  if (extraHandle) return extraHandle;

  const articleId = marker.match(/\bid="([^"]+)"/i)?.[1];
  if (articleId && !articleId.startsWith('card-heading-')) return articleId;

  const sectionName = marker.match(/data-section-name="product-\d+-([^"]+)"/i)?.[1];
  if (sectionName) return sectionName;

  return marker.match(/data-component-name="product-([^"]+)"/i)?.[1] ?? null;
}

function nearestSection(html, position) {
  const before = html.slice(0, position);
  const headings = [...before.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
  return textContent(headings.at(-1)?.[1] ?? '') || 'General';
}

function followingHeading(html, position) {
  const window = html.slice(position, position + 7_500);
  const match =
    window.match(/<h[34]\b[^>]*(?:id="card-heading-|aria-labelledby="card-heading-)[^>]*>([\s\S]*?)<\/h[34]>/i) ??
    window.match(/<h[34]\b[^>]*>([\s\S]*?)<\/h[34]>/i) ??
    window.match(/<a\b[^>]*data-component-name="(?:cta-title-link|header)"[^>]*>([\s\S]*?)<\/a>/i) ??
    window.match(/<p\b[^>]*class="[^"]*(?:font-bold|title)[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  return match ? { raw: match[0], title: textContent(match[1]), offset: match.index ?? 0 } : null;
}

function followingDescription(html, position, heading) {
  const start = position + heading.offset + heading.raw.length;
  const window = html.slice(start, start + 6_000);
  for (const match of window.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const description = textContent(match[1]);
    if (description.length >= 35 && !description.startsWith('Copiar enlace')) return description;
  }
  return '';
}

function extractMarkerFeatures(html) {
  const markers = [
    ...html.matchAll(/<article\b[^>]*(?:data-section-name="product-[^"]+"|data-component-name="product(?:-[^"]+)?")[^>]*>/gi),
    ...html.matchAll(/<div\b[^>]*data-component-name="product-[^"]+"[^>]*>/gi),
  ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  const features = [];
  for (const [index, markerMatch] of markers.entries()) {
    const marker = markerMatch[0];
    const position = markerMatch.index ?? 0;
    const nextPosition = markers[index + 1]?.index ?? html.length;
    const segment = html.slice(position, nextPosition);
    const slug = slugFromMarker(marker);
    const heading = followingHeading(segment, 0);
    if (!slug || !heading?.title || heading.title.length > 220) continue;

    features.push({
      slug,
      title: heading.title,
      description: followingDescription(segment, 0, heading),
      section: nearestSection(html, position),
    });
  }
  return features;
}

function extractAnchoredHeadingFeatures(html) {
  const features = [];
  const headings = html.matchAll(/<h3\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h3>/gi);
  for (const match of headings) {
    const slug = match[1].replace(/^card-heading-/, '');
    const title = textContent(match[2]);
    if (!title || slug.startsWith('section-heading-')) continue;
    const position = match.index ?? 0;
    features.push({
      slug,
      title,
      description: followingDescription(html, position, {
        raw: match[0],
        offset: 0,
      }),
      section: nearestSection(html, position),
    });
  }
  return features;
}

function deduplicate(features) {
  const bySlug = new Map();
  for (const feature of features) {
    const current = bySlug.get(feature.slug);
    if (!current || feature.description.length > current.description.length) {
      bySlug.set(feature.slug, feature);
    }
  }
  return [...bySlug.values()];
}

async function readEdition(edition) {
  const url = `${BASE_URL}/${edition}`;
  const response = await fetch(url, { headers: { 'user-agent': 'Logic2B research catalog/1.0' } });
  if (!response.ok) throw new Error(`${edition}: HTTP ${response.status}`);
  const html = await response.text();
  const title = textContent(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? edition);
  const markerFeatures = extractMarkerFeatures(html);
  const features = deduplicate(
    markerFeatures.length >= 10
      ? markerFeatures
      : [...markerFeatures, ...extractAnchoredHeadingFeatures(html)],
  );
  return { edition, url, title, features };
}

const requested = process.argv.slice(2).filter((value) => !value.startsWith('--'));
const editions = requested.length ? requested : EDITIONS;
const output = await Promise.all(editions.map(readEdition));

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} else {
  for (const item of output) {
    process.stdout.write(`\n# ${item.title}\n\nFuente: ${item.url}\n\n`);
    for (const feature of item.features) {
      const description = feature.description ? ` — ${feature.description}` : '';
      process.stdout.write(`- [${feature.section}] ${feature.title} (${feature.slug})${description}\n`);
    }
  }
}
