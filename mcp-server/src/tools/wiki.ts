import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { readCategory, resolveAccount } from '../account/store.ts';
import type { QuestsData, SkillsData } from '../account/types.ts';
import { clip } from '../wiki/markdown.ts';
import { bucket, luaString, outline, pageUrl, search, sectionMarkdown } from '../wiki/client.ts';
import { cleanWikitext } from '../wiki/wikitext.ts';
import { gp, num } from '../format.ts';
import { fail, READ_ONLY_WEB, safe, text } from './util.ts';

const LICENSE = 'Source: Old School RuneScape Wiki, CC BY-NC-SA 3.0.';

/** Finds the canonical page title: exact title first, then the top search hit. */
async function resolveTitle(name: string): Promise<{ title: string; guessed: boolean } | null> {
  const exact = await outline(name);
  if (exact) return { title: exact.title, guessed: false };
  const { hits } = await search(name, 1, false);
  return hits[0] ? { title: hits[0].title, guessed: true } : null;
}

export function registerWikiTools(server: McpServer): void {
  server.registerTool(
    'wiki_search',
    {
      title: 'Search the OSRS Wiki',
      description:
        'Full-text search of the Old School RuneScape Wiki (articles plus community "Guide:" pages). Returns page titles with snippets; then use wiki_read for content. Prefer this over general web search for anything about OSRS.',
      inputSchema: z.object({
        query: z.string().min(2).max(200),
        include_guides: z.boolean().default(true).describe('Also search the community Guide: namespace (user-written, less authoritative).'),
        limit: z.number().int().min(1).max(10).default(6),
      }),
      annotations: READ_ONLY_WEB,
    },
    safe('wiki_search', async ({ query, include_guides, limit }) => {
      const { hits, suggestion } = await search(query, limit, include_guides);
      if (!hits.length) return text(`No wiki results for "${query}".${suggestion ? ` Did you mean "${suggestion}"?` : ''}`);
      const lines = hits.map(
        (h) => `- **${h.title}**${h.section ? ` § ${h.section}` : ''}${h.guide ? ' (community guide)' : ''} — ${h.snippet.trim()} <${pageUrl(h.title)}>`,
      );
      if (suggestion) lines.push(`\nSpelling suggestion: "${suggestion}"`);
      return text(lines.join('\n'));
    }),
  );

  server.registerTool(
    'wiki_read',
    {
      title: 'Read an OSRS Wiki page',
      description:
        'Reads an OSRS Wiki page as compact markdown. Without `section` you get the intro plus the list of sections; then request a section by number or heading text. Long sections are clipped. Cite the returned URL.',
      inputSchema: z.object({
        title: z.string().min(1).max(200).describe('Page title, e.g. "Barrows gloves", "Ironman Guide/Agility", "Pay-to-play Herblore training".'),
        section: z.string().max(100).optional().describe('Section number (e.g. "3") or part of its heading (e.g. "Requirements").'),
        max_chars: z.number().int().min(1000).max(40000).default(12000),
      }),
      annotations: READ_ONLY_WEB,
    },
    safe('wiki_read', async ({ title, section, max_chars }) => {
      const resolved = await resolveTitle(title);
      if (!resolved) return fail(`No wiki page found for "${title}". Try wiki_search.`);
      const o = await outline(resolved.title);
      if (!o) return fail(`No wiki page found for "${title}".`);
      const url = pageUrl(o.title);
      const note = resolved.guessed ? `(No page named "${title}"; showing the closest match.)\n` : '';

      let index = '0';
      let heading = 'Introduction';
      if (section) {
        const s = section.trim().toLowerCase();
        const match = o.sections.find((x) => x.index === s) ?? o.sections.find((x) => x.heading.toLowerCase() === s) ?? o.sections.find((x) => x.heading.toLowerCase().includes(s));
        if (!match) {
          return fail(`Section "${section}" not found on ${o.title}. Sections: ${o.sections.map((x) => `${x.index} ${x.heading}`).join('; ')}`);
        }
        index = match.index;
        heading = match.heading;
      }
      const md = await sectionMarkdown(o.title, index);
      const { text: body, clipped } = clip(md, max_chars);
      const lines = [`# ${o.title} — ${heading}`, note + `<${url}${index === '0' ? '' : '#' + encodeURIComponent(heading.replace(/ /g, '_'))}>`, '', body];
      if (clipped) lines.push(`\n[Clipped at ${max_chars} characters — request a narrower section or a larger max_chars.]`);
      if (!section && o.sections.length) {
        lines.push('', '**Sections:** ' + o.sections.map((x) => `${x.index}. ${'  '.repeat(Math.max(0, x.level - 2))}${x.heading}`).join(' · '));
      }
      lines.push('', LICENSE);
      return text(lines.join('\n'));
    }),
  );

  server.registerTool(
    'wiki_lookup',
    {
      title: 'OSRS Wiki structured data',
      description:
        "Structured OSRS Wiki data. dataset 'quest': requirements, items needed, difficulty, start point and ironman notes — checked against the player's exported skills and quests when available. 'item': ids, high alch, value, buy limit, tradeable, members. 'monster': combat stats, slayer level/category, attack style. 'drop_sources': which monsters drop an item and how often.",
      inputSchema: z.object({
        dataset: z.enum(['quest', 'item', 'monster', 'drop_sources']),
        name: z.string().min(1).max(120).describe('Exact or approximate quest/item/monster name.'),
        rsn: z.string().max(12).optional().describe('Account to check quest requirements against (default: most recent).'),
      }),
      annotations: READ_ONLY_WEB,
    },
    safe('wiki_lookup', async ({ dataset, name, rsn }) => {
      const resolved = await resolveTitle(name);
      const title = resolved?.title ?? name;
      switch (dataset) {
        case 'quest':
          return questLookup(title, rsn);
        case 'item':
          return itemLookup(title);
        case 'monster':
          return monsterLookup(title);
        case 'drop_sources':
          return dropSources(title);
      }
    }),
  );
}

interface QuestRow {
  page_name: string;
  official_difficulty?: string;
  official_length?: string;
  requirements?: string;
  items_required?: string;
  start_point?: string;
  ironman_concerns?: string;
  description?: string;
}

async function questLookup(title: string, rsn?: string) {
  const rows = await bucket<QuestRow>(
    `bucket('quest').select('page_name','official_difficulty','official_length','requirements','items_required','start_point','ironman_concerns','description').where('page_name',${luaString(title)}).limit(1).run()`,
  );
  const q = rows[0];
  if (!q) return fail(`"${title}" is not a quest page on the wiki (try wiki_search).`);
  const reqText = cleanWikitext(q.requirements);
  const lines = [
    `# ${q.page_name}`,
    `<${pageUrl(q.page_name)}>`,
    `Difficulty: ${q.official_difficulty ?? '?'} · Length: ${q.official_length ?? '?'}`,
    q.start_point ? `Start: ${cleanWikitext(q.start_point)}` : '',
    '',
    '## Requirements',
    reqText || 'None listed.',
  ];
  if (q.items_required) lines.push('', '## Items required', cleanWikitext(q.items_required));
  if (q.ironman_concerns) lines.push('', '## Ironman notes', cleanWikitext(q.ironman_concerns));

  // Check requirements against the player's export.
  const acct = await resolveAccount(rsn);
  if (acct) {
    const [skillsEnv, questsEnv] = await Promise.all([readCategory<SkillsData>(acct, 'skills'), readCategory<QuestsData>(acct, 'quests')]);
    const check: string[] = [];
    if (skillsEnv) {
      const levels = new Map(skillsEnv.data.skills.map((s) => [s.name.toLowerCase(), s]));
      for (const m of reqText.matchAll(/(\d+)\s+([A-Z][a-z]+)/g)) {
        const skill = levels.get(m[2].toLowerCase());
        if (!skill) continue;
        const need = Number(m[1]);
        check.push(`${skill.level >= need ? '✓' : '✗'} ${need} ${skill.name} (you: ${skill.level}${skill.boostedLevel !== skill.level ? `, boosted ${skill.boostedLevel}` : ''})`);
      }
      const qpNeed = reqText.match(/(\d+)\s+Quest points/i);
      if (qpNeed && questsEnv) {
        check.push(`${questsEnv.data.questPoints >= Number(qpNeed[1]) ? '✓' : '✗'} ${qpNeed[1]} quest points (you: ${questsEnv.data.questPoints})`);
      }
    }
    if (questsEnv) {
      const states = new Map(questsEnv.data.quests.map((x) => [x.name.toLowerCase(), x.state]));
      for (const line of reqText.split('\n')) {
        const name = line.replace(/^\s*-\s*/, '').trim();
        const state = states.get(name.toLowerCase());
        if (state) check.push(`${state === 'FINISHED' ? '✓' : '✗'} ${name} (${state.toLowerCase().replace('_', ' ')})`);
      }
    }
    if (check.length) {
      lines.push('', `## Your status (${acct.rsn}, from the RuneLite export)`, ...[...new Set(check)].map((c) => `- ${c}`));
      lines.push('Note: requirements marked boostable on the wiki can be met with boosts; check the wiki page for details.');
    }
  }
  lines.push('', LICENSE);
  return text(lines.filter((l) => l !== undefined).join('\n'));
}

async function itemLookup(title: string) {
  const rows = await bucket<{
    page_name: string;
    item_name: string;
    item_id?: string[];
    high_alchemy_value?: number;
    value?: number;
    buy_limit?: number;
    tradeable?: string | boolean;
    is_members_only?: string | boolean;
    weight?: number;
    examine?: string;
    quest?: string;
  }>(
    `bucket('infobox_item').select('page_name','item_name','item_id','high_alchemy_value','value','buy_limit','tradeable','is_members_only','weight','examine','quest').where('page_name',${luaString(title)}).limit(10).run()`,
  );
  if (!rows.length) return fail(`No item data for "${title}" (try wiki_search for the exact item page).`);
  const yes = (v: unknown) => (v === true || v === 'true' || v === 1 || v === '1' ? 'yes' : v === '' || v === undefined ? '?' : 'no');
  const lines = [`# ${rows[0].page_name}`, `<${pageUrl(rows[0].page_name)}>`, ''];
  for (const r of rows) {
    lines.push(
      `- **${r.item_name}** (id ${(r.item_id ?? []).join(', ') || '?'}) — high alch ${r.high_alchemy_value != null ? gp(r.high_alchemy_value) : '?'}, value ${num(r.value)}, buy limit ${num(r.buy_limit)}, tradeable ${yes(r.tradeable)}, members ${yes(r.is_members_only)}${r.weight != null ? `, ${r.weight} kg` : ''}${r.quest ? `, quest item: ${cleanWikitext(r.quest)}` : ''}${r.examine ? `\n  Examine: ${cleanWikitext(r.examine)}` : ''}`,
    );
  }
  lines.push('', LICENSE);
  return text(lines.join('\n'));
}

async function monsterLookup(title: string) {
  const rows = await bucket<Record<string, unknown>>(
    `bucket('infobox_monster').select('page_name','name','version_anchor','combat_level','hitpoints','max_hit','attack_style','attack_speed','attribute','slayer_level','slayer_category','assigned_by','is_aggressive','poisonous','elemental_weakness','elemental_weakness_percent','examine').where('page_name',${luaString(title)}).limit(10).run()`,
  );
  if (!rows.length) return fail(`No monster data for "${title}" (try wiki_search for the exact monster page).`);
  const fmt = (v: unknown) => (Array.isArray(v) ? v.map((x) => cleanWikitext(String(x))).join(', ') : v == null || v === '' ? '?' : cleanWikitext(String(v)));
  const lines = [`# ${rows[0].page_name}`, `<${pageUrl(String(rows[0].page_name))}>`, ''];
  for (const r of rows) {
    lines.push(
      `- **${fmt(r.name)}${r.version_anchor ? ` (${fmt(r.version_anchor)})` : ''}** — combat ${fmt(r.combat_level)}, HP ${fmt(r.hitpoints)}, max hit ${fmt(r.max_hit)}, style ${fmt(r.attack_style)}, speed ${fmt(r.attack_speed)}, attributes ${fmt(r.attribute)}; slayer level ${fmt(r.slayer_level)}, category ${fmt(r.slayer_category)}, assigned by ${fmt(r.assigned_by)}; aggressive ${fmt(r.is_aggressive)}, poisonous ${fmt(r.poisonous)}; weakness ${fmt(r.elemental_weakness)} ${r.elemental_weakness_percent ? `(${fmt(r.elemental_weakness_percent)}%)` : ''}`,
    );
  }
  const drops = await bucket<{ item_name: string; drop_json: string }>(
    `bucket('dropsline').select('item_name','drop_json').where('page_name',${luaString(title)}).limit(200).run()`,
  );
  if (drops.length) {
    const parsed = drops.map((d) => ({ ...(JSON.parse(d.drop_json) as Record<string, unknown>), item: d.item_name }) as Record<string, unknown> & { item: string });
    const notable = parsed.filter((d) => d.Rarity && !/^always$/i.test(String(d.Rarity)));
    lines.push('', `## Drops (${drops.length} entries; showing non-guaranteed, rarest first)`);
    const rarity = (r: unknown) => {
      const m = String(r).match(/^([\d.]+)\/([\d.,]+)$/);
      return m ? Number(m[1]) / Number(m[2].replace(/,/g, '')) : 1;
    };
    notable.sort((a, b) => rarity(a.Rarity) - rarity(b.Rarity));
    lines.push(...notable.slice(0, 25).map((d) => `- ${d.item} × ${d['Drop Quantity'] ?? '?'} — ${d.Rarity}`));
    const always = parsed.filter((d) => /^always$/i.test(String(d.Rarity))).map((d) => d.item);
    if (always.length) lines.push(`- Always: ${[...new Set(always)].join(', ')}`);
  }
  lines.push('', LICENSE);
  return text(lines.join('\n'));
}

async function dropSources(title: string) {
  const drops = await bucket<{ page_name: string; drop_json: string }>(
    `bucket('dropsline').select('page_name','drop_json').where('item_name',${luaString(title)}).limit(300).run()`,
  );
  if (!drops.length) return fail(`No monster drops found for "${title}". It may come from shops, skilling or other sources — try wiki_read on the item page.`);
  const rows = drops.map((d) => {
    const j = JSON.parse(d.drop_json) as Record<string, unknown>;
    return { from: String(j['Dropped from'] ?? d.page_name).replace(/#/g, ' — '), level: String(j['Drop level'] ?? ''), qty: String(j['Drop Quantity'] ?? ''), rarity: String(j.Rarity ?? '') };
  });
  const lines = [
    `# Monsters that drop ${title}`,
    `<${pageUrl(title)}>`,
    '',
    ...rows.slice(0, 60).map((r) => `- ${r.from} (lvl ${r.level || '?'}) — ${r.qty} @ ${r.rarity}`),
  ];
  if (rows.length > 60) lines.push(`…and ${rows.length - 60} more.`);
  lines.push('', LICENSE);
  return text(lines.join('\n'));
}
