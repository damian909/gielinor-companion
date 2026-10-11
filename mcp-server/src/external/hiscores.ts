import { cached, HOUR } from '../cache.ts';
import { getText, HttpError } from '../http.ts';

export interface Hiscores {
  board: string;
  skills: { name: string; rank: number; level: number; xp: number }[];
  activities: { name: string; rank: number; score: number }[];
}

/** Official Jagex hiscores for one player on one board; null when the player isn't on that board. */
export async function fetchHiscores(rsn: string, board: string): Promise<Hiscores | null> {
  return cached(`hiscores:${board}:${rsn.toLowerCase()}`, HOUR, async () => {
    const url = `https://secure.runescape.com/m=${board}/index_lite.json?player=${encodeURIComponent(rsn)}`;
    const { status, body } = await getText(url);
    if (status === 404) return null;
    if (status !== 200) throw new HttpError(`hiscores returned HTTP ${status}`, status);
    const json = JSON.parse(body) as Omit<Hiscores, 'board'>;
    return { board, skills: json.skills, activities: json.activities };
  });
}
