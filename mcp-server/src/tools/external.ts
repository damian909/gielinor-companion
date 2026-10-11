import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { accountTypeInfo, HISCORE_BOARDS } from '../account/accountType.ts';
import { readCategory, resolveAccount } from '../account/store.ts';
import type { AccountData } from '../account/types.ts';
import { config } from '../config.ts';
import { fetchHiscores } from '../external/hiscores.ts';
import { findItems, latestPrices } from '../external/prices.ts';
import { womGains, womPlayer } from '../external/wom.ts';
import { ago, gp, num, table } from '../format.ts';
import { fail, READ_ONLY_WEB, safe, text } from './util.ts';

/** The RSN and hiscores board to use: explicit input, else the exported account, else the configured default. */
async function playerContext(rsn?: string): Promise<{ rsn: string; board: string } | null> {
  const acct = await resolveAccount(rsn);
  if (acct) {
    const a = (await readCategory<AccountData>(acct, 'account'))?.data;
    return { rsn: acct.rsn, board: accountTypeInfo(a?.accountTypeName ?? acct.accountType, a?.hardcoreStatusLost).board };
  }
  const name = rsn || config.defaultRsn;
  return name ? { rsn: name, board: 'hiscore_oldschool_ironman' } : null;
}

export function registerExternalTools(server: McpServer): void {
  if (config.external.has('hiscores')) {
    server.registerTool(
      'hiscores_lookup',
      {
        title: 'Official hiscores',
        description:
          'Official Jagex hiscores for a player: skills plus boss kill counts, clue scrolls and minigames. Use for kill counts and for other players. Hiscores only update when the player logs out, and low-ranked entries are not listed.',
        inputSchema: z.object({
          rsn: z.string().max(12).optional().describe('Player name; default is the exported/configured account.'),
          board: z.enum(HISCORE_BOARDS).optional().describe('Default: chosen from the account type.'),
          only: z.enum(['all', 'skills', 'activities']).default('all'),
        }),
        annotations: READ_ONLY_WEB,
      },
      safe('hiscores_lookup', async ({ rsn, board, only }) => {
        const ctx = await playerContext(rsn);
        if (!ctx) return fail('No player name known yet: pass rsn.');
        const boards = [board ?? ctx.board, ...(board ? [] : ['hiscore_oldschool'])];
        for (const b of [...new Set(boards)]) {
          const hs = await fetchHiscores(ctx.rsn, b);
          if (!hs) continue;
          const out = [`Official hiscores for ${ctx.rsn} (${b}); updated when the player last logged out.`];
          if (only !== 'activities') {
            out.push('', table(['Skill', 'Level', 'XP', 'Rank'], hs.skills.map((s) => [s.name, s.level < 0 ? 'unranked' : s.level, s.xp < 0 ? '—' : num(s.xp), s.rank < 0 ? '—' : num(s.rank)])));
          }
          if (only !== 'skills') {
            const acts = hs.activities.filter((a) => a.score > 0);
            out.push('', acts.length ? table(['Activity / boss', 'Score', 'Rank'], acts.map((a) => [a.name, num(a.score), a.rank < 0 ? '—' : num(a.rank)])) : 'No ranked activities or boss kills.');
          }
          return text(out.join('\n'));
        }
        return fail(`${ctx.rsn} was not found on the ${boards.join(' or ')} hiscores.`);
      }),
    );
  }

  if (config.external.has('wom')) {
    server.registerTool(
      'progress_history',
      {
        title: 'Progress over time',
        description:
          "XP, level and boss-kill gains over a period from Wise Old Man (wiseoldman.net), e.g. 'what did I do this month'. Only covers what Wise Old Man recorded: it updates when the player logs out with RuneLite's XP Updater plugin enabled.",
        inputSchema: z.object({
          rsn: z.string().max(12).optional(),
          period: z.enum(['day', 'week', 'month', 'year']).default('month'),
        }),
        annotations: READ_ONLY_WEB,
      },
      safe('progress_history', async ({ rsn, period }) => {
        const ctx = await playerContext(rsn);
        if (!ctx) return fail('No player name known yet: pass rsn.');
        const player = await womPlayer(ctx.rsn);
        if (!player) return fail(`${ctx.rsn} is not tracked on Wise Old Man yet. Enable RuneLite's "XP Updater" plugin (tick Wise Old Man) and log out once.`);
        const g = await womGains(ctx.rsn, period);
        const skills = Object.values(g.data.skills).filter((s) => s.metric !== 'overall' && s.experience.gained > 0);
        const overall = g.data.skills.overall;
        const bosses = Object.values(g.data.bosses ?? {}).filter((b) => b.kills.gained > 0);
        const lines = [
          `Wise Old Man: ${player.displayName} (${player.type}), last change recorded ${ago(player.lastChangedAt ?? undefined)}, last update ${ago(player.updatedAt ?? undefined)}.`,
          g.startsAt ? `Period: ${g.startsAt.slice(0, 10)} → ${g.endsAt?.slice(0, 10)} (${period}).` : `No data points in the last ${period}.`,
        ];
        if (overall && overall.experience.gained > 0) lines.push(`Total: +${num(overall.experience.gained)} XP, +${overall.level.gained} total levels.`);
        if (skills.length) {
          skills.sort((a, b) => b.experience.gained - a.experience.gained);
          lines.push('', table(['Skill', 'XP gained', 'Levels', 'Now'], skills.map((s) => [s.metric, num(s.experience.gained), `+${s.level.gained}`, s.level.end])));
        }
        if (bosses.length) lines.push('', table(['Boss / activity', 'Kills gained', 'Now'], bosses.map((b) => [b.metric, num(b.kills.gained), num(b.kills.end)])));
        if (!skills.length && !bosses.length) lines.push('No gains recorded in this period.');
        return text(lines.join('\n'));
      }),
    );
  }

  server.registerTool(
    'item_prices',
    {
      title: 'GE prices and alch values',
      description:
        "Live Grand Exchange prices (OSRS Wiki real-time prices), high/low alch values and GE buy limits for items by name or id. Ironmen can't use the GE, but prices are still useful for alching and value comparisons.",
      inputSchema: z.object({
        items: z.array(z.string().min(1).max(80)).min(1).max(25).describe('Item names or ids.'),
      }),
      annotations: READ_ONLY_WEB,
    },
    safe('item_prices', async ({ items }) => {
      const [found, latest] = await Promise.all([findItems(items), latestPrices()]);
      const rows: (string | number)[][] = [];
      const missing: string[] = [];
      for (const f of found) {
        if (!f.matches.length) missing.push(f.query);
        for (const m of f.matches) {
          const p = latest[String(m.id)];
          rows.push([m.name, m.id, p?.high != null ? gp(p.high) : '—', p?.low != null ? gp(p.low) : '—', m.highalch != null ? gp(m.highalch) : '—', m.limit != null ? num(m.limit) : '—', m.members ? 'yes' : 'no']);
        }
      }
      const out = [];
      if (rows.length) out.push(table(['Item', 'Id', 'GE buy (high)', 'GE sell (low)', 'High alch', 'Buy limit', 'Members'], rows));
      if (missing.length) out.push(`Not found: ${missing.join(', ')} (untradeable items are not listed).`);
      out.push('Prices: OSRS Wiki real-time prices (prices.runescape.wiki), cached up to 5 minutes.');
      return text(out.join('\n\n'));
    }),
  );
}
