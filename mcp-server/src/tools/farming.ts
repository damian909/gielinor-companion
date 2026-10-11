import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { readCategory, resolveAccount } from '../account/store.ts';
import { freshness } from '../format.ts';
import { fail, NO_EXPORT_HELP, READ_ONLY_LOCAL, safe, text } from './util.ts';

interface Timer {
  state: string;
  doneAt: number | null;
}

interface FarmingData {
  available: boolean;
  patchTypes?: Record<string, Timer>;
  birdHouses?: Timer;
}

const STATE_LABEL: Record<string, string> = {
  COMPLETED: 'ready',
  IN_PROGRESS: 'growing',
  OCCUPIED: 'planted',
  EMPTY: 'empty',
  UNKNOWN: 'not checked yet',
};

function when(doneAt: number | null): string {
  if (!doneAt) return '';
  const diffMin = Math.round((doneAt * 1000 - Date.now()) / 60_000);
  const at = new Date(doneAt * 1000).toISOString().slice(11, 16);
  if (diffMin <= 0) return `ready since ${at} UTC`;
  if (diffMin < 90) return `ready in ${diffMin} min (${at} UTC)`;
  return `ready in ${Math.floor(diffMin / 60)} h ${diffMin % 60} min (${at} UTC)`;
}

/** The export is a snapshot: a timer that has passed since then means the crop is ready now. */
function label(t: Timer): string {
  if (t.doneAt && t.doneAt * 1000 <= Date.now() && (t.state === 'IN_PROGRESS' || t.state === 'OCCUPIED')) return 'ready';
  return STATE_LABEL[t.state] ?? t.state.toLowerCase();
}

function describe(t: Timer): string {
  const status = label(t);
  if (!t.doneAt) return status;
  return status === 'ready' ? `ready (${when(t.doneAt).replace('ready since', 'since')})` : `${status} — ${when(t.doneAt)}`;
}

export function registerFarmingTools(server: McpServer): void {
  server.registerTool(
    'get_farming_status',
    {
      title: 'Farming and bird house timers',
      description:
        "When the player's farming patches (herbs, trees, allotments, …) and bird houses will be ready, as tracked by RuneLite's Time Tracking plugin. Per patch type: empty / growing / ready and when the last patch of that type finishes.",
      inputSchema: z.object({
        rsn: z.string().max(12).optional(),
        include_unchecked: z.boolean().default(false).describe('Also list patch types the player has not visited yet.'),
      }),
      annotations: READ_ONLY_LOCAL,
    },
    safe('get_farming_status', async ({ rsn, include_unchecked }) => {
      const acct = await resolveAccount(rsn);
      if (!acct) return fail(NO_EXPORT_HELP);
      const env = await readCategory<FarmingData>(acct, 'farming');
      if (!env) return fail('No farming data yet: needs exporter plugin 0.7.0+ (restart RuneLite with the shortcut and log in).');
      if (!env.data.available) return fail("RuneLite's Time Tracking plugin is turned off; enable it (it's a built-in plugin) to track farming timers.");

      const lines = [`Farming timers for ${acct.rsn}, ${freshness(env.capturedAt)}. Timers are only known for patches visited since Time Tracking was on.`, ''];
      for (const [type, t] of Object.entries(env.data.patchTypes ?? {})) {
        if (!include_unchecked && (t.state === 'UNKNOWN' || t.state === 'EMPTY')) continue;
        lines.push(`- **${type}**: ${describe(t)}`);
      }
      const bh = env.data.birdHouses;
      if (bh && (include_unchecked || bh.state !== 'UNKNOWN')) {
        lines.push(`- **Bird houses**: ${describe(bh)}`);
      }
      if (lines.length === 2) lines.push('No patches tracked yet. Visit your patches with RuneLite\'s Time Tracking plugin on.');
      return text(lines.join('\n'));
    }),
  );
}
