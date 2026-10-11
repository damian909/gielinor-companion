import { cached, DAY } from '../cache.ts';
import { WIKI_API } from '../config.ts';
import { getJson } from '../http.ts';
import { bucket } from '../wiki/client.ts';
import { cleanWikitext } from '../wiki/wikitext.ts';

export interface QuestRow {
  page_name: string;
  requirements?: string;
  items_required?: string;
  official_difficulty?: string;
  official_length?: string;
  start_point?: string;
}

export interface SkillReq {
  skill: string;
  level: number;
  boostable: boolean;
}

export interface QuestNode {
  title: string;
  depth: number;
  children: QuestNode[];
}

export interface ParsedRequirements {
  skills: SkillReq[];
  questPoints?: number;
  quests: QuestNode[];
  other: string[];
}

/** Every quest's requirement data in one request (cached a day); duplicate guide rows dropped. */
export async function allQuests(): Promise<Map<string, QuestRow>> {
  const rows = await bucket<QuestRow>(
    "bucket('quest').select('page_name','requirements','items_required','official_difficulty','official_length','start_point').limit(1000).run()",
  );
  const map = new Map<string, QuestRow>();
  for (const r of rows) {
    if (/\/Full guide$/.test(r.page_name)) continue;
    if (!map.has(norm(r.page_name))) map.set(norm(r.page_name), r);
  }
  return map;
}

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Recipe for Disaster subquests: wiki "Recipe for Disaster/Freeing X" vs RuneLite "Recipe for Disaster - X".
const RFD_ALIASES: Record<string, string> = { 'goblin generals': 'wartface and bentnoze' };

function rfdKey(part: string): string {
  const k = norm(part).replace(/^(freeing|defeating) /, '').replace(/^the /, '');
  return `rfd ${RFD_ALIASES[k] ?? k}`;
}

/** Canonical key for matching wiki quest titles with RuneLite quest names. */
export function questKey(name: string): string {
  const wikiRfd = name.match(/^Recipe for Disaster\/(.+)$/);
  if (wikiRfd) return rfdKey(wikiRfd[1]);
  const rlRfd = name.match(/^Recipe for Disaster - (.+)$/);
  if (rlRfd) return rfdKey(rlRfd[1]);
  return norm(name);
}

const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

export function parseRequirements(wikitext: string | undefined): ParsedRequirements {
  const out: ParsedRequirements = { skills: [], quests: [], other: [] };
  if (!wikitext) return out;
  const lines = wikitext.split('\n');
  let inQuests = false;
  const stack: QuestNode[] = [];
  for (const raw of lines) {
    const m = raw.match(/^(\*+)\s*(.*)$/);
    const depth = m ? m[1].length : 0;
    const body = m ? m[2] : raw;

    for (const s of body.matchAll(/data-skill="([^"]+)"\s+data-level="(\d+)"/g)) {
      const level = Number(s[2]);
      if (s[1] === 'Quest points') out.questPoints = Math.max(out.questPoints ?? 0, level);
      else if (s[1] !== 'Combat level') out.skills.push({ skill: s[1], level, boostable: /boost/i.test(body) && !/not boostable/i.test(body) });
    }

    if (depth === 1) {
      inQuests = /completion of the following quests/i.test(body);
      stack.length = 0;
      if (!inQuests && !/data-skill=/.test(body)) {
        const text = cleanWikitext(body);
        if (text) out.other.push(text);
      }
      continue;
    }
    if (inQuests && depth >= 2) {
      const link = [...body.matchAll(LINK)].map((l) => l[1].trim()).find((t) => !/^(File|Category):/i.test(t));
      if (!link) continue;
      const node: QuestNode = { title: link, depth, children: [] };
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      if (stack.length) stack[stack.length - 1].children.push(node);
      else out.quests.push(node);
      stack.push(node);
    }
  }
  return out;
}

/** Quest titles linked from the start of a wiki page (used for goals like "Barrows gloves"). */
export async function linkedTitlesInIntro(title: string): Promise<string[]> {
  return cached(`wiki:introlinks:${title.toLowerCase()}`, DAY, async () => {
    const q = new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext', section: '0', redirects: '1', format: 'json', formatversion: '2' });
    const json = await getJson<{ parse?: { wikitext?: string } }>(`${WIKI_API}?${q}`);
    // Skip templates (infoboxes) so we look at the prose.
    let text = json.parse?.wikitext ?? '';
    for (let prev = ''; prev !== text; ) {
      prev = text;
      text = text.replace(/\{\{[^{}]*\}\}/g, ''); // innermost first, so nested templates go too
    }
    return [...text.matchAll(LINK)].map((l) => l[1].trim());
  });
}
