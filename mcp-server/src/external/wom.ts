import { cached, HOUR } from '../cache.ts';
import { getJson, getText, HttpError } from '../http.ts';

const BASE = 'https://api.wiseoldman.net/v2';

export interface WomPlayer {
  username: string;
  displayName: string;
  type: string;
  exp: number;
  ehp: number;
  ehb: number;
  registeredAt: string;
  updatedAt: string | null;
  lastChangedAt: string | null;
}

interface Delta {
  gained: number;
  start: number;
  end: number;
}

export interface WomGains {
  startsAt: string | null;
  endsAt: string | null;
  data: {
    skills: Record<string, { metric: string; experience: Delta; level: Delta }>;
    bosses: Record<string, { metric: string; kills: Delta }>;
    activities: Record<string, { metric: string; score: Delta }>;
  };
}

export async function womPlayer(username: string): Promise<WomPlayer | null> {
  return cached(`wom:player:${username.toLowerCase()}`, HOUR, async () => {
    const { status, body } = await getText(`${BASE}/players/${encodeURIComponent(username)}`);
    if (status === 404) return null;
    if (status !== 200) throw new HttpError(`Wise Old Man returned HTTP ${status}`, status);
    return JSON.parse(body) as WomPlayer;
  });
}

export async function womGains(username: string, period: string): Promise<WomGains> {
  return cached(`wom:gained:${username.toLowerCase()}:${period}`, HOUR, () =>
    getJson<WomGains>(`${BASE}/players/${encodeURIComponent(username)}/gained?period=${encodeURIComponent(period)}`),
  );
}
