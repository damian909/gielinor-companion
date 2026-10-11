import os from 'node:os';
import path from 'node:path';

export const VERSION = '0.1.0';

const home = os.homedir();

function list(value: string | undefined, fallback: string): Set<string> {
  return new Set((value ?? fallback).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export const config = {
  /** Our own cache/state folder (outside AppData on purpose: Claude Desktop's MSIX sandbox redirects AppData). */
  home: process.env.GC_HOME ?? path.join(home, '.gielinor-companion'),
  /** Where the RuneLite plugin writes its export (Plugin.getPluginDirectory() for internalName "gielinorcompanion"). */
  dataDir: process.env.GC_DATA_DIR ?? path.join(home, '.runelite', 'plugin-data', 'gielinorcompanion'),
  /** Fallback RSN for public lookups when no plugin export exists yet. */
  defaultRsn: process.env.GC_RSN ?? '',
  uaContact: process.env.GC_UA_CONTACT ?? '',
  /** Public sources the server may query: hiscores, wom. */
  external: list(process.env.GC_EXTERNAL, 'hiscores,wom'),
};

export const USER_AGENT =
  `gielinor-companion-mcp/${VERSION} (personal single-user OSRS assistant; github.com/damian909/gielinor-companion` +
  (config.uaContact ? `; contact: ${config.uaContact}` : '') +
  ')';

export const WIKI_BASE = 'https://oldschool.runescape.wiki';
export const WIKI_API = `${WIKI_BASE}/api.php`;
export const PRICES_API = 'https://prices.runescape.wiki/api/v2/osrs';
