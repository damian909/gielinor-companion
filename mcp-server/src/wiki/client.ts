import { cached, DAY, HOUR } from '../cache.ts';
import { WIKI_API, WIKI_BASE } from '../config.ts';
import { getJson, HttpError } from '../http.ts';
import { htmlToMarkdown, MARKDOWN_VERSION } from './markdown.ts';

// All calls ask Cloudflare to cache responses (maxage/smaxage), so repeated questions are cheap
// for the wiki as well as for us.
function apiUrl(params: Record<string, string>): string {
  const q = new URLSearchParams({ format: 'json', formatversion: '2', maxage: '3600', smaxage: '3600', ...params });
  return `${WIKI_API}?${q.toString()}`;
}

export function pageUrl(title: string): string {
  return `${WIKI_BASE}/w/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/')}`;
}

export interface SearchHit {
  title: string;
  snippet: string;
  section?: string;
  guide: boolean;
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'");

/** Full-text search over articles (namespace 0) and community guides (namespace 3002). */
export async function search(query: string, limit: number, includeGuides: boolean): Promise<{ hits: SearchHit[]; suggestion?: string }> {
  const ns = includeGuides ? '0|3002' : '0';
  return cached(`wiki:search:${ns}:${limit}:${query.toLowerCase()}`, DAY, async () => {
    const json = await getJson<{
      query?: { search: { ns: number; title: string; snippet: string; sectiontitle?: string }[]; searchinfo?: { suggestion?: string } };
    }>(
      apiUrl({
        action: 'query',
        list: 'search',
        srsearch: query,
        srnamespace: ns,
        srlimit: String(limit),
        srprop: 'snippet|sectiontitle',
        srinfo: 'suggestion',
      }),
    );
    return {
      hits: (json.query?.search ?? []).map((h) => ({
        title: h.title,
        snippet: stripTags(h.snippet),
        section: h.sectiontitle,
        guide: h.ns === 3002,
      })),
      suggestion: json.query?.searchinfo?.suggestion,
    };
  });
}

export interface Outline {
  title: string;
  revid: number;
  sections: { index: string; level: number; heading: string }[];
}

interface ParseResponse {
  parse?: {
    title: string;
    revid: number;
    text?: string;
    sections?: { index: string; level: string; line: string }[];
  };
  error?: { code: string; info: string };
}

/** Section list of a page (follows redirects). Returns null if the page doesn't exist. */
export async function outline(title: string): Promise<Outline | null> {
  return cached(`wiki:outline:${title.toLowerCase()}`, 6 * HOUR, async () => {
    const json = await getJson<ParseResponse>(apiUrl({ action: 'parse', page: title, prop: 'sections|revid', redirects: '1' }));
    if (json.error?.code === 'missingtitle') return null;
    if (!json.parse) throw new HttpError(json.error?.info ?? 'wiki parse failed', 500);
    return {
      title: json.parse.title,
      revid: json.parse.revid,
      sections: (json.parse.sections ?? []).map((s) => ({
        index: s.index,
        level: Number(s.level),
        heading: stripTags(s.line),
      })),
    };
  });
}

/** One section (index "0" is the intro) as markdown. */
export async function sectionMarkdown(title: string, index: string): Promise<string> {
  return cached(`wiki:section:${MARKDOWN_VERSION}:${title.toLowerCase()}:${index}`, 6 * HOUR, async () => {
    const json = await getJson<ParseResponse>(
      apiUrl({
        action: 'parse',
        page: title,
        section: index,
        prop: 'text',
        redirects: '1',
        disableeditsection: '1',
        disablelimitreport: '1',
        disabletoc: '1',
      }),
    );
    if (!json.parse?.text) throw new HttpError(json.error?.info ?? 'wiki parse failed', 500);
    return htmlToMarkdown(json.parse.text);
  });
}

export interface MapPoint {
  name: string;
  x: number;
  y: number;
  plane: number;
}

/** Every {{Map|x=..|y=..}} marker on a page (infobox maps, location maps), deduplicated. */
export async function mapPoints(title: string): Promise<{ title: string; points: MapPoint[] } | null> {
  return cached(`wiki:mappoints:${title.toLowerCase()}`, DAY, async () => {
    const json = await getJson<{ parse?: { title: string; wikitext?: string }; error?: { code: string } }>(
      apiUrl({ action: 'parse', page: title, prop: 'wikitext', redirects: '1' }),
    );
    if (json.error?.code === 'missingtitle' || !json.parse) return null;
    const points: MapPoint[] = [];
    const seen = new Set<string>();
    for (const m of (json.parse.wikitext ?? '').matchAll(/\{\{\s*Map\s*\|([^{}]*)\}\}/gi)) {
      const params = new Map<string, string>();
      for (const part of m[1].split('|')) {
        const eq = part.indexOf('=');
        if (eq > 0) params.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim());
      }
      const x = Number(params.get('x'));
      const y = Number(params.get('y'));
      if (!Number.isInteger(x) || !Number.isInteger(y) || x <= 0 || y <= 0) continue;
      const plane = Number(params.get('plane') ?? 0) || 0;
      const key = `${x},${y},${plane}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({ name: params.get('name') || json.parse.title, x, y, plane });
    }
    return { title: json.parse.title, points };
  });
}

/**
 * Runs a Bucket query (the wiki's structured data store). Only called with queries built by this
 * server from fixed templates — never with raw user/model input.
 */
export async function bucket<T>(query: string): Promise<T[]> {
  return cached(`wiki:bucket:${query}`, DAY, async () => {
    const json = await getJson<{ bucket?: T[]; error?: string }>(apiUrl({ action: 'bucket', query }));
    if (json.error) throw new HttpError(`wiki data query failed: ${json.error}`, 400);
    if (!json.bucket) throw new HttpError('wiki data service is rate limiting; try again shortly', 429);
    return json.bucket;
  });
}

/** Quotes a value for a Bucket (Lua) string literal. */
export function luaString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
