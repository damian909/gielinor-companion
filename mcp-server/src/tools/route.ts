import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { readCategory, resolveAccount } from '../account/store.ts';
import type { StatusData } from '../account/types.ts';
import { config } from '../config.ts';
import { ago, num } from '../format.ts';
import { linkedTitlesInIntro } from '../planning/quests.ts';
import { mapPoints, pageUrl, search } from '../wiki/client.ts';
import { fail, READ_ONLY_LOCAL, safe, text } from './util.ts';

// The only thing this server ever writes outside its own folder: a route request the RuneLite
// plugin forwards to the Shortest Path plugin. It can only set or clear a map route.
const REQUEST_DIR = path.join(config.dataDir, 'requests');
const REQUEST_FILE = path.join(REQUEST_DIR, 'route.json');
const STATUS_FILE = path.join(REQUEST_DIR, 'route-status.json');

const ROUTE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendRequest(request: Record<string, unknown>): Promise<{ status: string; detail?: string } | null> {
  const id = Date.now();
  await mkdir(REQUEST_DIR, { recursive: true });
  const tmp = `${REQUEST_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ id, createdAt: new Date(id).toISOString(), ...request }));
  await rename(tmp, REQUEST_FILE);
  // The plugin checks once a second and writes back an acknowledgement.
  for (let i = 0; i < 12; i++) {
    await delay(500);
    try {
      const status = JSON.parse(await readFile(STATUS_FILE, 'utf8')) as { id: number; status: string; detail?: string };
      if (status.id === id) return status;
    } catch {
      // not written yet
    }
  }
  return null;
}

const NOT_RUNNING =
  'The request was written, but the RuneLite plugin did not pick it up. Is RuneLite running via the desktop shortcut (exporter plugin 0.4.0 or newer)?';

async function currentLocation(): Promise<{ status?: StatusData; capturedAt?: string }> {
  const acct = await resolveAccount();
  if (!acct) return {};
  const env = await readCategory<StatusData>(acct, 'status');
  return { status: env?.data, capturedAt: env?.data?.heartbeatAt };
}

export function registerRouteTools(server: McpServer): void {
  server.registerTool(
    'get_location',
    {
      title: 'Player location',
      description: "The player's current world and tile coordinates (x, y, plane), updated about once a minute while logged in.",
      inputSchema: z.object({}),
      annotations: READ_ONLY_LOCAL,
    },
    safe('get_location', async () => {
      const { status } = await currentLocation();
      if (!status?.location) return fail('No location exported yet: log in with the RuneLite shortcut.');
      const l = status.location;
      return text(
        `${status.loggedIn ? `Logged in on world ${status.world}` : 'Logged out'}; last position x=${l.x}, y=${l.y}, plane=${l.plane} (region ${l.regionId}${l.instanced ? ', inside an instance' : ''}), recorded ${ago(status.heartbeatAt)}.`,
      );
    }),
  );

  server.registerTool(
    'show_route',
    {
      title: 'Show a route on the map',
      description:
        "Shows a walking route to a destination on the player's in-game world map and minimap, using the Shortest Path RuneLite plugin. Give `place` (a wiki page: an NPC, location, shop, activity…) or explicit `x`/`y`/`plane`. If the page has several map markers, the alternatives are listed; pick one with `option`. The player still walks there themselves.",
      inputSchema: z.object({
        place: z.string().max(120).optional().describe('Wiki page name, e.g. "Lokar Searunner", "Varrock Rooftop Course", "Awowogei".'),
        option: z.number().int().min(1).max(20).default(1).describe('Which map marker to use when the page has several.'),
        x: z.number().int().min(1).max(16383).optional(),
        y: z.number().int().min(1).max(16383).optional(),
        plane: z.number().int().min(0).max(3).default(0),
      }),
      annotations: ROUTE_ANNOTATIONS,
    },
    safe('show_route', async ({ place, option, x, y, plane }) => {
      let target: { x: number; y: number; plane: number };
      let label: string;
      const notes: string[] = [];
      if (x !== undefined && y !== undefined) {
        target = { x, y, plane };
        label = 'the given coordinates';
      } else if (place) {
        let found = await mapPoints(place);
        if (!found) {
          const { hits } = await search(place, 1, false);
          if (hits[0]) found = await mapPoints(hits[0].title);
        }
        if (!found) return fail(`No wiki page found for "${place}".`);
        if (!found.points.length) {
          // No marker on this page (e.g. "Lumbridge Castle"): try pages it links to near the top,
          // then other search results, and say which one was used.
          const original = found.title;
          const candidates = [...new Set([...(await linkedTitlesInIntro(original)).slice(0, 4), ...(await search(place, 4, false)).hits.map((h) => h.title)])].filter((t) => t !== original);
          let fallback: Awaited<ReturnType<typeof mapPoints>> = null;
          for (const c of candidates.slice(0, 6)) {
            const p = await mapPoints(c);
            if (p?.points.length) {
              fallback = p;
              break;
            }
          }
          if (!fallback) return fail(`The wiki page "${original}" has no map marker, and neither do the pages it links to. Give coordinates instead, or name an NPC or location there.`);
          notes.push(`"${original}" has no map marker on the wiki, so this uses the nearest related page with one: ${fallback.title}.`);
          found = fallback;
        }
        const chosen = found.points[option - 1];
        if (!chosen) return fail(`"${found.title}" has only ${found.points.length} map markers.`);
        target = { x: chosen.x, y: chosen.y, plane: chosen.plane };
        label = `${found.title}${chosen.name && chosen.name !== found.title ? ` (${chosen.name})` : ''}`;
        notes.push(`Source: ${pageUrl(found.title)}`);
        if (found.points.length > 1) {
          notes.push(
            `This page has ${found.points.length} map markers: ${found.points.map((p, i) => `${i + 1}) ${p.name} at ${p.x},${p.y},${p.plane}`).join('; ')}. Used #${option}.`,
          );
        }
      } else {
        return fail('Give a place (wiki page name) or x and y coordinates.');
      }

      const ack = await sendRequest({ action: 'path', target, label });
      if (!ack) return fail(NOT_RUNNING);
      if (ack.status !== 'sent') return fail(`The plugin rejected the route: ${ack.detail ?? ack.status}.`);

      const { status } = await currentLocation();
      const here = status?.location;
      if (here && here.plane === target.plane && !here.instanced) {
        const tiles = Math.round(Math.hypot(here.x - target.x, here.y - target.y));
        notes.unshift(`Straight-line distance from your last known position: about ${num(tiles)} tiles.`);
      }
      return text(
        [
          `Route to ${label} (x=${target.x}, y=${target.y}, plane=${target.plane}) is now shown by Shortest Path on your world map and minimap.`,
          ...notes,
          'If no path appears, check that the Shortest Path plugin is enabled. It may route via teleports you have configured there.',
        ].join('\n'),
      );
    }),
  );

  server.registerTool(
    'clear_route',
    {
      title: 'Clear the map route',
      description: 'Removes the route currently shown by the Shortest Path plugin.',
      inputSchema: z.object({}),
      annotations: ROUTE_ANNOTATIONS,
    },
    safe('clear_route', async () => {
      const ack = await sendRequest({ action: 'clear' });
      return ack ? text('Route cleared.') : fail(NOT_RUNNING);
    }),
  );
}
