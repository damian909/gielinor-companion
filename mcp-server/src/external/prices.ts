import { cached, DAY, MINUTE } from '../cache.ts';
import { PRICES_API } from '../config.ts';
import { getJson } from '../http.ts';

export interface ItemMapping {
  id: number;
  name: string;
  examine?: string;
  members: boolean;
  lowalch?: number;
  highalch?: number;
  limit?: number;
  value: number;
}

export interface LatestPrice {
  high: number | null;
  highTime: number | null;
  low: number | null;
  lowTime: number | null;
}

export async function itemMapping(): Promise<ItemMapping[]> {
  return cached('prices:mapping', DAY, () => getJson<ItemMapping[]>(`${PRICES_API}/mapping`));
}

/** All latest GE prices in one request (cached 5 minutes), instead of one request per item. */
export async function latestPrices(): Promise<Record<string, LatestPrice>> {
  return cached('prices:latest', 5 * MINUTE, async () => (await getJson<{ data: Record<string, LatestPrice> }>(`${PRICES_API}/latest`)).data);
}

/** Resolves item names or ids to mapping entries; exact name match first, then substring. */
export async function findItems(queries: string[]): Promise<{ query: string; matches: ItemMapping[] }[]> {
  const mapping = await itemMapping();
  const byId = new Map(mapping.map((m) => [m.id, m]));
  return queries.map((q) => {
    const trimmed = q.trim();
    if (/^\d+$/.test(trimmed)) {
      const m = byId.get(Number(trimmed));
      return { query: q, matches: m ? [m] : [] };
    }
    const lower = trimmed.toLowerCase();
    const exact = mapping.filter((m) => m.name.toLowerCase() === lower);
    if (exact.length) return { query: q, matches: exact };
    return { query: q, matches: mapping.filter((m) => m.name.toLowerCase().includes(lower)).slice(0, 5) };
  });
}
