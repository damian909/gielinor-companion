import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { readCategory, resolveAccount } from '../account/store.ts';
import { config } from '../config.ts';
import { fetchHiscores } from '../external/hiscores.ts';
import { freshness, num, table } from '../format.ts';
import { fail, NO_EXPORT_HELP, READ_ONLY_LOCAL, safe, text } from './util.ts';

interface KillsData {
  bosses: { name: string; count: number }[];
  activities: { name: string; count: number }[];
  personalBestsSeconds: Record<string, number>;
}

/** 83.4 -> "1:23.40" */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  const ss = Number.isInteger(s) ? String(s).padStart(2, '0') : s.toFixed(2).padStart(5, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function registerKillTools(server: McpServer): void {
  server.registerTool(
    'get_boss_kills',
    {
      title: 'Boss kill counts',
      description:
        "The player's boss kill counts (exact, straight from the game — including low counts the hiscores leave out), activity scores (clues, Rifts, LMS…) and personal-best times saved by RuneLite. Optionally filter by boss name.",
      inputSchema: z.object({
        rsn: z.string().max(12).optional(),
        boss: z.string().max(60).optional().describe('Part of a boss/activity name; omit for everything with a count.'),
      }),
      annotations: READ_ONLY_LOCAL,
    },
    safe('get_boss_kills', async ({ rsn, boss }) => {
      const q = boss ? key(boss) : '';
      const acct = await resolveAccount(rsn);
      const env = acct ? await readCategory<KillsData>(acct, 'kills') : undefined;

      if (!acct || !env) {
        // Older plugin or no export yet: fall back to the official hiscores.
        const name = acct?.rsn ?? rsn ?? config.defaultRsn;
        if (!name) return fail(NO_EXPORT_HELP);
        const hs = (await fetchHiscores(name, 'hiscore_oldschool_ironman')) ?? (await fetchHiscores(name, 'hiscore_oldschool'));
        if (!hs) return fail(NO_EXPORT_HELP);
        const rows = hs.activities.filter((a) => a.score > 0 && (!q || key(a.name).includes(q)));
        return text(
          `Kill counts for ${name} from the official hiscores (exporter plugin 0.6.0+ gives exact counts incl. low ones, plus PBs):\n\n` +
            (rows.length ? table(['Boss / activity', 'Count'], rows.map((a) => [a.name, num(a.score)])) : 'Nothing listed.'),
        );
      }

      const d = env.data;
      const pbs = new Map(Object.entries(d.personalBestsSeconds ?? {}).map(([k, v]) => [key(k), { name: k, seconds: v }]));
      const pbFor = (name: string) => pbs.get(key(name));
      const match = (name: string) => !q || key(name).includes(q);
      const bosses = d.bosses.filter((b) => match(b.name) && (q ? true : b.count > 0)).sort((a, b) => b.count - a.count);
      const acts = d.activities.filter((a) => match(a.name) && a.count > 0);

      const lines = [`Kill counts for ${acct.rsn}, ${freshness(env.capturedAt)}.`];
      lines.push(
        '',
        bosses.length
          ? table(['Boss', 'Kills', 'Personal best'], bosses.map((b) => [b.name, num(b.count), pbFor(b.name) ? formatTime(pbFor(b.name)!.seconds) : '']))
          : q ? `No boss matches "${boss}".` : 'No boss kills yet.',
      );
      if (acts.length) lines.push('', table(['Activity', 'Score'], acts.map((a) => [a.name, num(a.count)])));
      // PBs for things that aren't hiscores bosses (e.g. agility laps, sub-bosses).
      const bossKeys = new Set(d.bosses.map((b) => key(b.name)));
      const otherPbs = [...pbs.values()].filter((p) => !bossKeys.has(key(p.name)) && match(p.name));
      if (otherPbs.length) lines.push('', `Other personal bests: ${otherPbs.map((p) => `${p.name} ${formatTime(p.seconds)}`).join(', ')}`);
      lines.push('', 'Personal bests are the times RuneLite\'s Chat Commands plugin has seen in chat; older ones may be missing.');
      return text(lines.join('\n'));
    }),
  );
}
