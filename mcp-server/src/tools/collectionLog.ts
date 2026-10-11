import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { readCategory, resolveAccount } from '../account/store.ts';
import type { CollectionLogData } from '../account/types.ts';
import { ago, freshness, itemName, num, table } from '../format.ts';
import { bucket } from '../wiki/client.ts';
import { cleanWikitext } from '../wiki/wikitext.ts';
import { fail, NO_EXPORT_HELP, READ_ONLY_WEB, safe, text } from './util.ts';

const HOW_TO_CAPTURE =
  'Open the collection log in-game and press its "Search" button once: that sends every obtained item, and the plugin records it. Viewing single pages also records those pages.';

interface SourceRow {
  item_id: number;
  sources?: string[];
  rates?: string[];
}

/** Wiki drop sources and rates for every collection log item, keyed by item id (one request, cached a day). */
async function sourcesById(): Promise<Map<number, string>> {
  const rows = await bucket<SourceRow>("bucket('collection_log_source').select('item_id','sources','rates').limit(5000).run()");
  const map = new Map<number, string>();
  for (const r of rows) {
    const parts = (r.sources ?? []).map((s, i) => {
      const rate = r.rates?.[i] ? cleanWikitext(r.rates[i]) : '';
      return `${cleanWikitext(s)}${rate ? ` (${rate})` : ''}`;
    });
    if (parts.length) map.set(r.item_id, parts.join('; '));
  }
  return map;
}

export function registerCollectionLogTools(server: McpServer): void {
  server.registerTool(
    'get_collection_log',
    {
      title: 'Collection log',
      description:
        "The player's collection log: overall and per-tab progress, pages with their obtained/missing items, and for missing items the wiki's drop sources and rates. Without `page` it gives an overview; with `page` (e.g. \"Barrows Chests\", \"Vorkath\", \"Wintertodt\") it lists that page's items.",
      inputSchema: z.object({
        rsn: z.string().max(12).optional(),
        page: z.string().max(60).optional().describe('Part of a collection log page name.'),
        tab: z.enum(['Bosses', 'Raids', 'Clues', 'Minigames', 'Other']).optional().describe('Overview of one tab, listing all its pages.'),
        missing_only: z.boolean().default(false).describe('Page view: only list items not yet obtained.'),
      }),
      annotations: READ_ONLY_WEB,
    },
    safe('get_collection_log', async ({ rsn, page, tab, missing_only }) => {
      const acct = await resolveAccount(rsn);
      if (!acct) return fail(NO_EXPORT_HELP);
      const env = await readCategory<CollectionLogData>(acct, 'collection_log');
      if (!env) return fail(`No collection log captured yet for ${acct.rsn}. ${HOW_TO_CAPTURE}`);
      const d = env.data;
      const have = (id: number) => (d.obtained[String(id)] ?? 0) > 0;

      const status = [
        `Collection log for ${acct.rsn}: ${num(d.obtainedCount)}/${num(d.totalSlots)} unique items obtained (updated ${ago(d.updatedAt)}).`,
        d.knownObtained >= d.obtainedCount && d.obtainedCount > 0
          ? `Item details are complete${d.lastCompleteCaptureAt ? ` (full capture ${ago(d.lastCompleteCaptureAt)})` : ''}.`
          : `Item details are partial: ${num(d.knownObtained)} of ${num(d.obtainedCount)} obtained items are known, so some items listed as missing may actually be obtained. ${HOW_TO_CAPTURE}`,
      ];
      if (!d.tabs?.length) return text(`${status.join('\n')}\nThe log layout hasn't been captured yet; open the log in-game once.`);

      if (page) {
        const q = page.toLowerCase();
        const all = d.tabs.flatMap((t) => t.pages.map((p) => ({ tab: t.name, ...p })));
        const matches = all.filter((p) => p.name.toLowerCase() === q);
        const found = matches.length ? matches : all.filter((p) => p.name.toLowerCase().includes(q));
        if (!found.length) return fail(`No collection log page matches "${page}". Pages include: ${all.slice(0, 40).map((p) => p.name).join(', ')}…`);
        if (found.length > 3) return text(`${status.join('\n')}\n\nSeveral pages match "${page}": ${found.map((p) => `${p.name} (${p.tab})`).join(', ')}. Ask for one.`);

        const sources = await sourcesById();
        const out = [...status];
        for (const p of found) {
          const got = p.items.filter((i) => have(i.id)).length;
          const rows = p.items
            .filter((i) => !missing_only || !have(i.id))
            .map((i) => [itemName(i.name), have(i.id) ? `✓ ×${num(d.obtained[String(i.id)])}` : '—', have(i.id) ? '' : sources.get(i.id) ?? '']);
          out.push('', `## ${p.name} (${p.tab}) — ${got}/${p.items.length}`, rows.length ? table(['Item', 'Obtained', 'Source (drop rate)'], rows) : 'Page complete!');
        }
        out.push('', 'Sources and rates: OSRS Wiki (CC BY-NC-SA 3.0).');
        return text(out.join('\n'));
      }

      const out = [...status, ''];
      const tabs = tab ? d.tabs.filter((t) => t.name === tab) : d.tabs;
      for (const t of tabs) {
        const ids = new Set(t.pages.flatMap((p) => p.items.map((i) => i.id)));
        const got = [...ids].filter(have).length;
        const pages = t.pages.map((p) => ({ name: p.name, got: p.items.filter((i) => have(i.id)).length, total: p.items.length }));
        const shown = tab ? pages : pages.filter((p) => p.got > 0);
        out.push(`### ${t.name}: ${got}/${ids.size}`);
        out.push(
          shown.length ? shown.map((p) => `${p.name} ${p.got}/${p.total}${p.got === p.total ? ' ✓' : ''}`).join(' · ') : 'Nothing obtained yet.',
        );
        if (!tab && shown.length < pages.length) out.push(`(${pages.length - shown.length} pages with nothing yet — pass tab="${t.name}" to list them.)`);
        out.push('');
      }
      out.push(`Data ${freshness(env.capturedAt)}.`);
      return text(out.join('\n'));
    }),
  );
}
