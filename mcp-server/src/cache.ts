import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';
import { log } from './log.ts';

// Small key/value cache with expiry, shared by every server instance (Claude Desktop and
// Claude Code may each run one). Opened lazily so server startup stays instant.
let db: DatabaseSync | null = null;
let disabled = false;

function open(): DatabaseSync | null {
  if (db || disabled) return db;
  try {
    mkdirSync(config.home, { recursive: true });
    db = new DatabaseSync(path.join(config.home, 'cache.sqlite'));
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, expires INTEGER NOT NULL);
    `);
    db.prepare('DELETE FROM kv WHERE expires < ?').run(Date.now());
  } catch (e) {
    log('cache disabled:', e);
    disabled = true;
    db = null;
  }
  return db;
}

export function cacheGet<T>(key: string): T | undefined {
  const d = open();
  if (!d) return undefined;
  try {
    const row = d.prepare('SELECT v, expires FROM kv WHERE k = ?').get(key) as { v: string; expires: number } | undefined;
    if (!row || row.expires < Date.now()) return undefined;
    return JSON.parse(row.v) as T;
  } catch (e) {
    log('cache read failed:', e);
    return undefined;
  }
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  const d = open();
  if (!d) return;
  try {
    d.prepare('INSERT OR REPLACE INTO kv (k, v, expires) VALUES (?, ?, ?)').run(key, JSON.stringify(value), Date.now() + ttlMs);
  } catch (e) {
    log('cache write failed:', e);
  }
}

/** Returns the cached value for `key`, or computes, stores and returns it. */
export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await compute();
  cacheSet(key, value, ttlMs);
  return value;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
