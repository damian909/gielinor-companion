import type { CallToolResult } from '@modelcontextprotocol/server';
import { config } from '../config.ts';
import { HttpError } from '../http.ts';
import { log } from '../log.ts';

export const READ_ONLY_LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const READ_ONLY_WEB = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export function text(body: string): CallToolResult {
  return { content: [{ type: 'text', text: body }] };
}

export function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export const NO_EXPORT_HELP =
  `No RuneLite export found yet (looked in ${config.dataDir}). ` +
  'Start RuneLite with the Gielinor Companion launcher (play.cmd) and log in; the exporter plugin writes ' +
  'the account data a few seconds after login. The bank is captured when it is opened.';

/** Wraps a tool handler so unexpected errors come back as readable tool errors instead of protocol failures. */
export function safe<A>(name: string, handler: (args: A) => Promise<CallToolResult>): (args: A) => Promise<CallToolResult> {
  return async (args: A) => {
    try {
      return await handler(args);
    } catch (e) {
      log(`${name} failed:`, e);
      if (e instanceof HttpError) return fail(`${name}: ${e.message}`);
      return fail(`${name} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
}
