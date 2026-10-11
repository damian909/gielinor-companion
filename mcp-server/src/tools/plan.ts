import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { listContainers, readCategory, readContainer, resolveAccount } from '../account/store.ts';
import type { QuestsData, SkillsData } from '../account/types.ts';
import { itemMapping } from '../external/prices.ts';
import { itemName, num, xpForLevel } from '../format.ts';
import { allQuests, linkedTitlesInIntro, parseRequirements, questKey, type QuestNode, type QuestRow } from '../planning/quests.ts';
import { pageUrl, search } from '../wiki/client.ts';
import { cleanWikitext } from '../wiki/wikitext.ts';
import { fail, NO_EXPORT_HELP, READ_ONLY_WEB, safe, text } from './util.ts';

const LICENSE = 'Requirements: Old School RuneScape Wiki (CC BY-NC-SA 3.0).';

/** Finds the quest behind a goal: a quest name, or an item/unlock whose wiki page mentions one. */
async function resolveGoal(goal: string, quests: Map<string, QuestRow>): Promise<{ quest: QuestRow; via?: string } | null> {
  const byKey = new Map([...quests.values()].map((q) => [questKey(q.page_name), q]));
  const direct = byKey.get(questKey(goal)) ?? byKey.get(questKey(`Recipe for Disaster/${goal}`));
  if (direct) return { quest: direct };
  const g = goal.toLowerCase();
  const partial = [...quests.values()].filter((q) => q.page_name.toLowerCase().includes(g));
  if (partial.length === 1) return { quest: partial[0] };

  // Not a quest: look for a quest linked from the goal page's intro ("…after completing Recipe for Disaster").
  const { hits } = await search(goal, 1, false);
  const page = hits[0]?.title ?? goal;
  for (const link of await linkedTitlesInIntro(page)) {
    const q = byKey.get(questKey(link));
    if (q) {
      // A main quest with subquests (Recipe for Disaster) is planned via its final part.
      const final = [...quests.values()].find((x) => x.page_name.startsWith(`${q.page_name}/Defeating`));
      return { quest: final ?? q, via: page };
    }
  }
  return null;
}

/** Children before parents, each quest once. */
function postOrder(nodes: QuestNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    postOrder(n.children, out);
    if (!out.includes(n.title)) out.push(n.title);
  }
  return out;
}

export function registerPlanTools(server: McpServer): void {
  server.registerTool(
    'plan_goal',
    {
      title: 'Plan a goal',
      description:
        "Builds a checklist for a goal — a quest (\"Dragon Slayer II\", \"Lunar Diplomacy\") or an unlock/item that a quest gives (\"Barrows gloves\"): missing prerequisite quests in the order to do them, skill levels needed across the whole chain with XP still to go, quest points, and the goal quest's items checked against the player's bank. Checked against the player's exported data.",
      inputSchema: z.object({
        goal: z.string().min(2).max(120),
        rsn: z.string().max(12).optional(),
      }),
      annotations: READ_ONLY_WEB,
    },
    safe('plan_goal', async ({ goal, rsn }) => {
      const acct = await resolveAccount(rsn);
      if (!acct) return fail(NO_EXPORT_HELP);
      const [skillsEnv, questsEnv, quests] = await Promise.all([
        readCategory<SkillsData>(acct, 'skills'),
        readCategory<QuestsData>(acct, 'quests'),
        allQuests(),
      ]);
      if (!skillsEnv || !questsEnv) return fail(NO_EXPORT_HELP);

      const resolved = await resolveGoal(goal, quests);
      if (!resolved) return fail(`Couldn't link "${goal}" to a quest. Try the quest name, or wiki_lookup / wiki_read for other goals.`);
      const target = resolved.quest;

      const state = new Map(questsEnv.data.quests.map((q) => [questKey(q.name), q.state]));
      // RuneLite names some quests with a subtitle ("Desert Treasure II - The Fallen Empire").
      for (const q of questsEnv.data.quests) {
        const base = q.name.split(' - ')[0];
        if (base !== q.name && !q.name.startsWith('Recipe for Disaster') && !state.has(questKey(base))) state.set(questKey(base), q.state);
      }
      const isDone = (title: string) => state.get(questKey(title)) === 'FINISHED';
      const stateOf = (title: string) => state.get(questKey(title));

      const goalReq = parseRequirements(target.requirements);
      // Keep real quests only: requirement links can also point at things like "Kudos".
      const isQuest = (t: string) => quests.has(questKey(t)) || [...quests.values()].some((q) => questKey(q.page_name) === questKey(t)) || state.has(questKey(t));
      const order = postOrder(goalReq.quests).filter((t) => isQuest(t) && !isDone(t));
      const skills = new Map(skillsEnv.data.skills.map((s) => [s.name.toLowerCase(), s]));

      // Highest level needed per skill across the goal and every unfinished prerequisite.
      const needed = new Map<string, { level: number; boostable: boolean; for: string }>();
      let qpNeeded = goalReq.questPoints ?? 0;
      const addSkills = (title: string, reqs: ReturnType<typeof parseRequirements>) => {
        for (const s of reqs.skills) {
          const cur = needed.get(s.skill);
          if (!cur || s.level > cur.level) needed.set(s.skill, { level: s.level, boostable: s.boostable, for: title });
        }
        qpNeeded = Math.max(qpNeeded, reqs.questPoints ?? 0);
      };
      addSkills(target.page_name, goalReq);
      const steps: string[] = [];
      for (const title of order) {
        const row = quests.get(questKey(title)) ?? [...quests.values()].find((q) => questKey(q.page_name) === questKey(title));
        const reqs = parseRequirements(row?.requirements);
        addSkills(title, reqs);
        const blockers = reqs.skills
          .filter((s) => (skills.get(s.skill.toLowerCase())?.level ?? 1) < s.level)
          .map((s) => `${s.level} ${s.skill}`);
        const st = stateOf(title);
        steps.push(
          `${steps.length + 1}. **${title}**${st === 'IN_PROGRESS' ? ' (in progress)' : ''}${row?.official_difficulty ? ` — ${row.official_difficulty}` : ''}${blockers.length ? ` — needs ${blockers.join(', ')}` : ' — requirements met'}`,
        );
      }

      const lines: string[] = [];
      lines.push(`# Plan: ${target.page_name}${resolved.via ? ` (for ${resolved.via})` : ''}`);
      lines.push(`<${pageUrl(target.page_name)}>`);
      if (isDone(target.page_name)) lines.push('', '✓ Already completed.');

      lines.push('', '## Quests to do first');
      lines.push(steps.length ? steps.join('\n') : 'None — all prerequisite quests are done.');
      lines.push(`${steps.length + 1}. **${target.page_name}** (the goal)`);

      lines.push('', '## Skills (highest requirement in the whole chain)');
      const skillRows = [...needed.entries()].map(([skill, n]) => {
        const s = skills.get(skill.toLowerCase());
        const have = s?.level ?? 1;
        const ok = have >= n.level;
        const xp = !ok && s ? ` — ${num(xpForLevel(n.level) - s.xp)} XP to go` : '';
        return `- ${ok ? '✓' : '✗'} ${n.level} ${skill} (you: ${have})${xp}${n.boostable && !ok ? ' — boostable' : ''}${n.for !== target.page_name ? ` · for ${n.for}` : ''}`;
      });
      lines.push(skillRows.length ? skillRows.sort((a, b) => (a.startsWith('- ✗') ? -1 : 1) - (b.startsWith('- ✗') ? -1 : 1)).join('\n') : 'No skill requirements.');
      if (qpNeeded) lines.push(`- ${questsEnv.data.questPoints >= qpNeeded ? '✓' : '✗'} ${qpNeeded} quest points (you: ${questsEnv.data.questPoints})`);
      if (goalReq.other.length) lines.push('', '## Other requirements', ...goalReq.other.map((o) => `- ${o}`));

      // Items for the goal quest, matched against everything the player has stored.
      const itemNames = [...(target.items_required ?? '').matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)]
        .map((m) => m[1].trim())
        .filter((n) => !/^(File|Category):/i.test(n));
      if (itemNames.length) {
        const owned = new Map<string, { qty: number; where: Set<string> }>();
        for (const c of await listContainers(acct)) {
          const env = await readContainer(acct, c);
          for (const i of env?.data.items ?? []) {
            const key = itemName(i.name).toLowerCase();
            const o = owned.get(key) ?? { qty: 0, where: new Set<string>() };
            o.qty += i.quantity;
            o.where.add(c);
            owned.set(key, o);
          }
        }
        const ownedNames = [...owned.keys()];
        // Generic names ("pickaxe", "nails") match any owned variant ("rune pickaxe", "steel nails").
        const find = (n: string): { name: string; qty: number; where: Set<string> } | undefined => {
          const k = n.toLowerCase();
          const singular = k.replace(/s$/, '');
          for (const cand of [k, singular, `${k}s`]) {
            const o = owned.get(cand);
            if (o) return { name: n, ...o };
          }
          // Variants: "rune pickaxe" for "pickaxe", "restore potion(4)" for "restore potion"; never raw/burnt food.
          const variant = ownedNames.find(
            (o) =>
              !/^(raw|burnt) /.test(o) &&
              (o.endsWith(` ${k}`) || o.endsWith(` ${singular}`) || o.endsWith(` ${singular}s`) || o.startsWith(`${singular}(`) || o.startsWith(`${k}(`)),
          );
          return variant ? { name: variant, ...owned.get(variant)! } : undefined;
        };
        const known = new Set((await itemMapping()).map((m) => m.name.toLowerCase()));
        const unchecked: string[] = [];
        lines.push('', `## Items for ${target.page_name} (rough match against your storage)`);
        lines.push(
          [...new Set(itemNames)]
            .map((n) => {
              const o = find(n);
              if (o) return `- ✓ ${n}${o.name.toLowerCase() !== n.toLowerCase() ? ` (${o.name})` : ''} — ${num(o.qty)} in ${[...o.where].join(', ')}`;
              // Links that aren't GE items (places, spells, diaries) aren't checked; the full list follows.
              const lower = n.toLowerCase().replace(/s$/, '');
              if (known.has(n.toLowerCase()) || known.has(`${lower}s`) || known.has(lower) || known.has(`${lower}(4)`)) return `- ✗ ${n}`;
              unchecked.push(n);
              return null;
            })
            .filter(Boolean)
            .join('\n'),
        );
        if (unchecked.length) lines.push(`Not checked (untradeable or not an item): ${unchecked.join(', ')}.`);
        lines.push('Full item list with notes:', cleanWikitext(target.items_required));
      }
      lines.push('', `Data: RuneLite export for ${acct.rsn}. Bank as of the last time it was opened.`, LICENSE);
      return text(lines.join('\n'));
    }),
  );
}
