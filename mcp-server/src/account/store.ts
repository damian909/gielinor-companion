import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.ts';
import type { ContainerData, Envelope, IndexEntry } from './types.ts';

// Read-only access to the plugin's export folder. Paths are always built from config.dataDir plus
// fixed or validated names, so no tool input can point the server at another file.

const KEY_RE = /^-?\d+-[a-z_]+$/;
const NAME_RE = /^[a-z0-9_]+$/;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads and parses a JSON file. Retries briefly because the plugin may be replacing it right now. */
async function readJson<T>(file: string): Promise<T | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as T;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' && attempt === 2) return undefined;
      if (code !== 'ENOENT' && code !== 'EBUSY' && code !== 'EPERM' && !(e instanceof SyntaxError)) throw e;
      await delay(150);
    }
  }
  return undefined;
}

export async function listAccounts(): Promise<IndexEntry[]> {
  const index = await readJson<{ accounts?: IndexEntry[] }>(path.join(config.dataDir, 'index.json'));
  return (index?.accounts ?? []).filter((a) => KEY_RE.test(a.key));
}

/**
 * Picks the account to answer about: the given RSN (case-insensitive), else the most recently seen
 * account, preferring the standard game mode over Leagues/Deadman/etc.
 */
export async function resolveAccount(rsn?: string): Promise<IndexEntry | undefined> {
  const accounts = await listAccounts();
  if (accounts.length === 0) return undefined;
  const byRecent = [...accounts].sort(
    (a, b) =>
      Number(b.profileType === 'standard') - Number(a.profileType === 'standard') ||
      Date.parse(b.lastSeen) - Date.parse(a.lastSeen),
  );
  if (rsn) {
    const wanted = rsn.trim().toLowerCase();
    return byRecent.find((a) => a.rsn.toLowerCase() === wanted);
  }
  return byRecent[0];
}

function accountDir(account: IndexEntry): string {
  if (!KEY_RE.test(account.key)) throw new Error(`invalid account key ${account.key}`);
  return path.join(config.dataDir, 'accounts', account.key);
}

export async function readCategory<T>(account: IndexEntry, category: string): Promise<Envelope<T> | undefined> {
  if (!NAME_RE.test(category)) throw new Error(`invalid category ${category}`);
  return readJson<Envelope<T>>(path.join(accountDir(account), `${category}.json`));
}

export async function listContainers(account: IndexEntry): Promise<string[]> {
  try {
    const files = await readdir(path.join(accountDir(account), 'containers'));
    return files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => NAME_RE.test(n));
  } catch {
    return [];
  }
}

export async function readContainer(account: IndexEntry, name: string): Promise<Envelope<ContainerData> | undefined> {
  if (!NAME_RE.test(name)) throw new Error(`invalid container ${name}`);
  return readJson<Envelope<ContainerData>>(path.join(accountDir(account), 'containers', `${name}.json`));
}
