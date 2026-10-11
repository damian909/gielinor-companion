export function num(n: number | null | undefined): string {
  return n == null ? '?' : n.toLocaleString('en-US');
}

/** Compact gp: 1.2m, 350k. */
export function gp(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}m`;
  if (abs >= 1e4) return `${Math.round(n / 1e3)}k`;
  return n.toLocaleString('en-US');
}

export function ago(iso: string | undefined): string {
  if (!iso) return 'unknown time';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return 'unknown time';
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** "captured 5 min ago (2026-10-10 21:03 UTC)" */
export function freshness(iso: string | undefined): string {
  if (!iso) return 'capture time unknown';
  return `captured ${ago(iso)} (${iso.slice(0, 16).replace('T', ' ')} UTC)`;
}

export function table(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n');
}

// XP needed for each level 1..126 (the standard OSRS formula).
const XP_TABLE: number[] = (() => {
  const t = [0, 0];
  let points = 0;
  for (let lvl = 1; lvl < 127; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    t.push(Math.floor(points / 4));
  }
  return t;
})();

export function xpForLevel(level: number): number {
  return XP_TABLE[Math.max(1, Math.min(126, level))];
}

export function virtualLevel(xp: number): number {
  let lvl = 1;
  while (lvl < 126 && XP_TABLE[lvl + 1] <= xp) lvl++;
  return lvl;
}

/** Opaque pagination cursor: just the next offset, base64 so callers treat it as a token. */
export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, 'base64url').toString());
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function page<T>(items: T[], limit: number, cursor?: string): { slice: T[]; next?: string; offset: number } {
  const offset = decodeCursor(cursor);
  const slice = items.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  return { slice, offset, next: nextOffset < items.length ? encodeCursor(nextOffset) : undefined };
}

/** Drops the " (Members)" suffix the game adds to members items on free-to-play worlds. */
export function itemName(name: string): string {
  return name.endsWith(' (Members)') ? name.slice(0, -' (Members)'.length) : name;
}
