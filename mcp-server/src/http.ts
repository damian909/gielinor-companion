import { USER_AGENT } from './config.ts';
import { log } from './log.ts';

/** Minimum gap between requests per host: be a polite, single-user client. */
const MIN_INTERVAL_MS: Record<string, number> = {
  'oldschool.runescape.wiki': 1000,
  'prices.runescape.wiki': 1000,
  'secure.runescape.com': 2000,
  'api.wiseoldman.net': 3000,
};
const DEFAULT_INTERVAL_MS = 1000;
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const queues = new Map<string, Promise<unknown>>();
const lastRequestAt = new Map<string, number>();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs requests to the same host one at a time, spaced by the host's minimum interval. */
function enqueue<T>(host: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(host) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    const wait = (lastRequestAt.get(host) ?? 0) + (MIN_INTERVAL_MS[host] ?? DEFAULT_INTERVAL_MS) - Date.now();
    if (wait > 0) await delay(wait);
    try {
      return await task();
    } finally {
      lastRequestAt.set(host, Date.now());
    }
  });
  queues.set(host, run);
  return run;
}

function isCloudflareChallenge(res: Response, body: string): boolean {
  return (
    res.headers.get('cf-mitigated') === 'challenge' ||
    (res.status === 403 && /just a moment|cf-chl|error code: 1010/i.test(body))
  );
}

export async function getText(url: string): Promise<{ status: number; body: string }> {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    const result = await enqueue(host, async () => {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.text();
      return { res, body };
    });
    const { res, body } = result;
    if (isCloudflareChallenge(res, body)) {
      // Never try to get around a challenge; report it instead.
      throw new HttpError(`${host} is asking for a browser check (Cloudflare); try again later.`, res.status);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1);
      log(`HTTP ${res.status} from ${host}, retrying in ${wait} ms`);
      await delay(Math.min(wait, 10_000));
      continue;
    }
    return { status: res.status, body };
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const { status, body } = await getText(url);
  if (status < 200 || status >= 300) {
    throw new HttpError(`HTTP ${status} from ${new URL(url).host}`, status);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new HttpError(`Invalid JSON from ${new URL(url).host}`, status);
  }
}
