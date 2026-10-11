import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { accountTypeInfo } from '../account/accountType.ts';
import { listAccounts, listContainers, readCategory, readContainer, resolveAccount } from '../account/store.ts';
import type {
  AccountData,
  CombatAchievementsData,
  ContainerData,
  DiariesData,
  DiaryTier,
  Envelope,
  IndexEntry,
  ItemEntry,
  QuestsData,
  SkillsData,
  SlayerData,
  StatusData,
} from '../account/types.ts';
import { config } from '../config.ts';
import { fetchHiscores } from '../external/hiscores.ts';
import { ago, freshness, gp, itemName, num, page, table, virtualLevel, xpForLevel } from '../format.ts';
import { bucket } from '../wiki/client.ts';
import { fail, NO_EXPORT_HELP, READ_ONLY_LOCAL, READ_ONLY_WEB, safe, text } from './util.ts';

const rsnArg = z
  .string()
  .max(12)
  .optional()
  .describe('Account display name. Omit to use the most recently played account.');

async function account(rsn?: string): Promise<IndexEntry | undefined> {
  return resolveAccount(rsn);
}

async function notFound(rsn?: string): Promise<string> {
  if (!rsn) return NO_EXPORT_HELP;
  const known = (await listAccounts()).map((a) => a.rsn);
  return `No exported data for "${rsn}". Known accounts: ${known.length ? known.join(', ') : 'none yet'}.\n${NO_EXPORT_HELP}`;
}

function header(acct: IndexEntry, env: Envelope<unknown> | undefined): string {
  return `Source: RuneLite export for ${acct.rsn}${acct.profileType !== 'standard' ? ` [${acct.profileType}]` : ''}, ${freshness(env?.capturedAt)}.`;
}

export function registerAccountTools(server: McpServer): void {
  server.registerTool(
    'get_account_summary',
    {
      title: 'Account summary',
      description:
        "Overview of the player's OSRS account: account type (ironman etc.), combat/total level, quest points, diaries, combat achievements, collection log, slayer task, bank value and how fresh each piece of data is. Start here for any question about the player's progress.",
      inputSchema: z.object({ rsn: rsnArg }),
      annotations: READ_ONLY_LOCAL,
    },
    safe('get_account_summary', async ({ rsn }) => {
      const acct = await account(rsn);
      if (!acct) return hiscoreFallbackSummary(rsn);

      const [accEnv, statusEnv, questsEnv, diariesEnv, caEnv, slayerEnv, bankEnv] = await Promise.all([
        readCategory<AccountData>(acct, 'account'),
        readCategory<StatusData>(acct, 'status'),
        readCategory<QuestsData>(acct, 'quests'),
        readCategory<DiariesData>(acct, 'diaries'),
        readCategory<CombatAchievementsData>(acct, 'combat_achievements'),
        readCategory<SlayerData>(acct, 'slayer'),
        readContainer(acct, 'bank'),
      ]);
      const a = accEnv?.data;
      const type = accountTypeInfo(a?.accountTypeName ?? acct.accountType, a?.hardcoreStatusLost);
      const lines: string[] = [];
      lines.push(`# ${acct.rsn} — ${type.label}`);
      lines.push(header(acct, accEnv));
      const st = statusEnv?.data;
      if (st) {
        lines.push(
          st.loggedIn && Date.now() - Date.parse(st.heartbeatAt) < 3 * 60_000
            ? `Currently logged in (world ${st.world ?? '?'}).`
            : `Not logged in right now; last seen ${ago(st.heartbeatAt)}.`,
        );
      }
      if (a) {
        lines.push('');
        lines.push(`- Combat level ${num(a.combatLevel)} · Total level ${num(a.totalLevel)} · Total XP ${num(a.totalXp)}`);
        const q = questsEnv?.data;
        lines.push(`- Quest points ${num(a.questPoints)}${q ? ` · quests/miniquests finished ${q.finished}/${q.total}` : ''}`);
        // The game only sends the collection log counts after the log has been opened this session.
        const clog = a.collectionLog?.total ? `${num(a.collectionLog.obtained)}/${num(a.collectionLog.total)}` : 'not loaded yet (open the collection log in-game once)';
        lines.push(`- Collection log ${clog} · Combat achievement points ${num(a.combatAchievementPoints)}`);
      }
      const d = diariesEnv?.data;
      if (d) {
        const done = d.regions
          .map((r) => {
            const tiers = (['easy', 'medium', 'hard', 'elite'] as DiaryTier[]).filter((t) => r.tiers[t]?.complete);
            return tiers.length ? `${r.region} (${tiers.join(', ')})` : null;
          })
          .filter(Boolean);
        lines.push(`- Achievement diaries: ${d.tiersComplete}/${d.tiersTotal} tiers complete${done.length ? ` — ${done.join('; ')}` : ''}`);
      }
      if (caEnv?.data) lines.push(`- Combat achievements: ${caEnv.data.completedCount} tasks completed, ${caEnv.data.points} points`);
      const s = slayerEnv?.data;
      if (s) {
        lines.push(
          s.hasTask
            ? `- Slayer task: ${s.amountRemaining} × ${s.bossName ?? s.taskName ?? `task #${s.taskId}`} from ${s.masterName ?? `master #${s.masterId}`} · ${num(s.points)} points, streak ${num(s.streak)}`
            : `- Slayer: no task · ${num(s.points)} points, streak ${num(s.streak)}`,
        );
      }
      if (bankEnv?.data) {
        lines.push(`- Bank: ${num(bankEnv.data.itemCount)} item stacks, ~${gp(bankEnv.data.geValue)} GE value / ${gp(bankEnv.data.haValue)} high-alch value (${freshness(bankEnv.capturedAt)})`);
      } else {
        lines.push('- Bank: not captured yet (open the bank in-game once).');
      }
      if (type.ironman) {
        lines.push('');
        lines.push(`Ironman rules apply: no Grand Exchange or trading${type.group ? ' outside the group' : ''}${type.ultimate ? ', no bank' : ''}${type.hardcore ? '; dangerous deaths end hardcore status' : ''}.`);
      }
      const others = (await listAccounts()).filter((x) => x.key !== acct.key);
      if (others.length) lines.push(`Other exported accounts: ${others.map((o) => `${o.rsn}${o.profileType !== 'standard' ? ` [${o.profileType}]` : ''}`).join(', ')}.`);
      return text(lines.join('\n'));
    }),
  );

  server.registerTool(
    'get_skills',
    {
      title: 'Skill levels',
      description:
        "The player's skill levels and XP (all skills incl. Sailing): level, boosted level, XP, XP to next level. Falls back to the official hiscores when no RuneLite export exists.",
      inputSchema: z.object({
        rsn: rsnArg,
        skills: z.array(z.string()).max(30).optional().describe('Only these skills, e.g. ["Agility","Herblore"]. Omit for all.'),
      }),
      annotations: READ_ONLY_LOCAL,
    },
    safe('get_skills', async ({ rsn, skills }) => {
      const wanted = skills?.map((s) => s.toLowerCase());
      const acct = await account(rsn);
      let rows: { name: string; level: number; boosted?: number; xp: number }[];
      let source: string;
      if (acct) {
        const env = await readCategory<SkillsData>(acct, 'skills');
        if (!env) return fail(await notFound(rsn));
        rows = env.data.skills.map((s) => ({ name: s.name, level: s.level, boosted: s.boostedLevel, xp: s.xp }));
        source = header(acct, env);
      } else {
        const hs = await hiscoresFor(rsn);
        if (!hs) return fail(await notFound(rsn));
        rows = hs.data.skills.filter((s) => s.name !== 'Overall').map((s) => ({ name: s.name, level: Math.max(1, s.level), xp: Math.max(0, s.xp) }));
        source = `Source: official hiscores (${hs.data.board}) for ${hs.rsn} — only updates when the player logs out; unranked skills show as 1.`;
      }
      if (wanted?.length) rows = rows.filter((r) => wanted.includes(r.name.toLowerCase()));
      const out = table(
        ['Skill', 'Level', 'XP', 'XP to next level'],
        rows.map((r) => {
          const lvl = r.level >= 99 ? `${r.level} (virtual ${virtualLevel(r.xp)})` : String(r.level);
          const boosted = r.boosted !== undefined && r.boosted !== r.level ? ` [now ${r.boosted}]` : '';
          const toNext = r.level >= 99 ? '—' : num(xpForLevel(r.level + 1) - r.xp);
          return [r.name, lvl + boosted, num(r.xp), toNext];
        }),
      );
      return text(`${source}\n\n${out}`);
    }),
  );

  const CONTAINER_NAMES = ['bank', 'inventory', 'equipment', 'seed_vault', 'looting_bag', 'seed_box', 'tackle_box', 'forestry_kit', 'huntsmans_kit', 'boat_1_cargo', 'boat_2_cargo', 'boat_3_cargo', 'boat_4_cargo', 'boat_5_cargo'] as const;

  server.registerTool(
    'find_items',
    {
      title: 'Find items',
      description:
        "Search the player's items across bank, inventory, worn equipment and other storage (seed vault, looting bag, kits, boat cargo). Without a query it lists the most valuable stacks. Storage is only as fresh as the last time it was opened in-game; each container's capture time is shown.",
      inputSchema: z.object({
        rsn: rsnArg,
        query: z.string().max(60).optional().describe('Case-insensitive part of the item name, e.g. "rune" or "shark".'),
        containers: z.array(z.enum(CONTAINER_NAMES)).optional().describe('Limit to these containers. Omit for all.'),
        sort: z.enum(['value', 'name', 'quantity']).default('value'),
        limit: z.number().int().min(1).max(100).default(25),
        cursor: z.string().optional().describe('Pagination cursor from a previous call.'),
      }),
      annotations: READ_ONLY_LOCAL,
    },
    safe('find_items', async ({ rsn, query, containers, sort, limit, cursor }) => {
      const acct = await account(rsn);
      if (!acct) return fail(await notFound(rsn));
      const names = containers?.length ? containers : await listContainers(acct);
      const envs = (await Promise.all(names.map(async (n) => [n, await readContainer(acct, n)] as const))).filter(
        (x): x is readonly [string, Envelope<ContainerData>] => !!x[1],
      );
      if (!envs.length) return fail(`No item containers captured yet for ${acct.rsn}. Log in with the exporter running and open the bank once.`);

      const q = query?.toLowerCase().trim();
      let rows: (ItemEntry & { where: string })[] = envs.flatMap(([n, env]) =>
        env.data.items.map((i) => ({ ...i, name: itemName(i.name) })).filter((i) => !q || i.name.toLowerCase().includes(q)).map((i) => ({ ...i, where: n })),
      );
      const value = (i: ItemEntry) => i.gePrice * i.quantity;
      rows.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'quantity' ? b.quantity - a.quantity : value(b) - value(a)));
      const { slice, next, offset } = page(rows, limit, cursor);

      const lines = [
        `Items for ${acct.rsn}${q ? ` matching "${query}"` : ''}: ${rows.length} stacks.`,
        `Containers: ${envs.map(([n, env]) => `${n} (${ago(env.capturedAt)})`).join(', ')}.`,
      ];
      const missing = (containers ?? []).filter((c) => !envs.some(([n]) => n === c));
      if (missing.length) lines.push(`Never captured: ${missing.join(', ')} — open them in-game to record them.`);
      if (!slice.length) return text(lines.join('\n'));
      lines.push(
        '',
        table(
          ['Item', 'Qty', 'Where', 'GE value', 'High alch (total)'],
          slice.map((i) => [i.name + (i.noted ? ' (noted)' : ''), num(i.quantity), i.equipmentSlot ? `${i.where}:${i.equipmentSlot}` : i.where, gp(value(i)), gp(i.haPrice * i.quantity)]),
        ),
      );
      lines.push(next ? `\nShowing ${offset + 1}-${offset + slice.length} of ${rows.length}. More: cursor="${next}"` : '');
      return text(lines.join('\n'));
    }),
  );

  server.registerTool(
    'get_quests',
    {
      title: 'Quest progress',
      description:
        "The player's quest (and miniquest) states: finished, in progress or not started, plus quest points. Use wiki_lookup with dataset 'quest' for a quest's requirements checked against the player.",
      inputSchema: z.object({
        rsn: rsnArg,
        status: z.enum(['all', 'finished', 'in_progress', 'not_started']).default('all'),
        search: z.string().max(60).optional().describe('Part of a quest name.'),
        limit: z.number().int().min(1).max(250).default(250),
        cursor: z.string().optional(),
      }),
      annotations: READ_ONLY_LOCAL,
    },
    safe('get_quests', async ({ rsn, status, search, limit, cursor }) => {
      const acct = await account(rsn);
      if (!acct) return fail(await notFound(rsn));
      const env = await readCategory<QuestsData>(acct, 'quests');
      if (!env) return fail(await notFound(rsn));
      const want = { all: null, finished: 'FINISHED', in_progress: 'IN_PROGRESS', not_started: 'NOT_STARTED' }[status];
      const s = search?.toLowerCase();
      const quests = env.data.quests.filter((q) => (!want || q.state === want) && (!s || q.name.toLowerCase().includes(s)));
      const { slice, next } = page(quests, limit, cursor);
      const label = { FINISHED: 'finished', IN_PROGRESS: 'in progress', NOT_STARTED: 'not started', UNKNOWN: 'unknown' };
      const lines = [
        header(acct, env),
        `Quest points: ${env.data.questPoints}. Finished ${env.data.finished} of ${env.data.total} (list includes miniquests).`,
        '',
      ];
      if (status === 'all' && !s) {
        for (const st of ['IN_PROGRESS', 'NOT_STARTED', 'FINISHED'] as const) {
          const names = slice.filter((q) => q.state === st).map((q) => q.name);
          if (names.length) lines.push(`**${label[st]} (${names.length})**: ${names.join(', ')}`, '');
        }
      } else {
        lines.push(slice.map((q) => `- ${q.name} — ${label[q.state]}`).join('\n') || 'No matching quests.');
      }
      if (next) lines.push(`More: cursor="${next}"`);
      return text(lines.join('\n'));
    }),
  );

  server.registerTool(
    'get_combat_achievements',
    {
      title: 'Combat achievements',
      description:
        "The player's Combat Achievement progress per tier, and task lists filtered by completion, tier or monster (task names and descriptions come from the OSRS Wiki).",
      inputSchema: z.object({
        rsn: rsnArg,
        status: z.enum(['incomplete', 'completed', 'all']).default('incomplete'),
        tier: z.enum(['Easy', 'Medium', 'Hard', 'Elite', 'Master', 'Grandmaster']).optional(),
        monster: z.string().max(60).optional().describe('Part of a monster/boss name.'),
        limit: z.number().int().min(1).max(100).default(30),
        cursor: z.string().optional(),
      }),
      annotations: READ_ONLY_WEB,
    },
    safe('get_combat_achievements', async ({ rsn, status, tier, monster, limit, cursor }) => {
      const acct = await account(rsn);
      if (!acct) return fail(await notFound(rsn));
      const env = await readCategory<CombatAchievementsData>(acct, 'combat_achievements');
      if (!env) return fail(await notFound(rsn));
      const tasks = await bucket<{ id: number; name: string; monster?: string; tier: string; type: string; task: string }>(
        "bucket('combat_achievement').select('id','name','monster','tier','type','task').limit(5000).run()",
      );
      const done = new Set(env.data.completedTaskIds);
      const tiers = ['Easy', 'Medium', 'Hard', 'Elite', 'Master', 'Grandmaster'];
      const summary = tiers.map((t) => {
        const inTier = tasks.filter((x) => x.tier === t);
        return `${t} ${inTier.filter((x) => done.has(x.id)).length}/${inTier.length}`;
      });
      const m = monster?.toLowerCase();
      const filtered = tasks
        .filter((x) => (status === 'all' ? true : status === 'completed' ? done.has(x.id) : !done.has(x.id)))
        .filter((x) => !tier || x.tier === tier)
        .filter((x) => !m || (x.monster ?? '').toLowerCase().includes(m))
        .sort((a, b) => tiers.indexOf(a.tier) - tiers.indexOf(b.tier) || a.id - b.id);
      const { slice, next } = page(filtered, limit, cursor);
      const lines = [
        header(acct, env),
        `${env.data.completedCount} tasks completed, ${env.data.points} points. By tier: ${summary.join(' · ')}.`,
        '',
        table(['Tier', 'Task', 'Monster', 'Type', 'Description', 'Done'], slice.map((x) => [x.tier, x.name, x.monster ?? '', x.type, x.task, done.has(x.id) ? '✓' : ''])),
      ];
      if (next) lines.push(`\n${filtered.length} matching tasks. More: cursor="${next}"`);
      lines.push('\nTask data: OSRS Wiki (CC BY-NC-SA 3.0).');
      return text(lines.join('\n'));
    }),
  );

  server.registerTool(
    'get_slayer_status',
    {
      title: 'Slayer status',
      description: "The player's current Slayer task, amount left, slayer master, points and task streak.",
      inputSchema: z.object({ rsn: rsnArg }),
      annotations: READ_ONLY_LOCAL,
    },
    safe('get_slayer_status', async ({ rsn }) => {
      const acct = await account(rsn);
      if (!acct) return fail(await notFound(rsn));
      const env = await readCategory<SlayerData>(acct, 'slayer');
      if (!env) return fail(await notFound(rsn));
      const s = env.data;
      const task = s.hasTask
        ? `Current task: ${s.amountRemaining}/${s.initialAmount || '?'} ${s.bossName ?? s.taskName ?? `task #${s.taskId}`} from ${s.masterName ?? `master #${s.masterId}`}${s.konarAreaId ? ` (Konar location id ${s.konarAreaId})` : ''}.`
        : 'No current slayer task.';
      return text(`${header(acct, env)}\n${task}\nSlayer points: ${num(s.points)} · Task streak: ${num(s.streak)} · Wilderness streak: ${num(s.wildernessStreak)}`);
    }),
  );
}

async function hiscoresFor(rsn?: string) {
  const name = rsn || config.defaultRsn;
  if (!name || !config.external.has('hiscores')) return undefined;
  for (const board of ['hiscore_oldschool_ironman', 'hiscore_oldschool']) {
    const data = await fetchHiscores(name, board);
    if (data) return { rsn: name, data };
  }
  return undefined;
}

async function hiscoreFallbackSummary(rsn?: string) {
  const hs = await hiscoresFor(rsn);
  if (!hs) return fail(await notFound(rsn));
  const overall = hs.data.skills.find((s) => s.name === 'Overall');
  const acts = hs.data.activities.filter((a) => a.score > 0).map((a) => `${a.name} ${num(a.score)}`);
  return text(
    [
      `# ${hs.rsn} (from the official hiscores — no RuneLite export yet)`,
      `Board: ${hs.data.board}. Hiscores only update on logout and miss quests, diaries, bank and storage.`,
      `Total level ${num(overall?.level)}, total XP ${num(overall?.xp)}.`,
      acts.length ? `Tracked activities/bosses: ${acts.join(', ')}.` : '',
      '',
      NO_EXPORT_HELP,
    ].join('\n'),
  );
}
