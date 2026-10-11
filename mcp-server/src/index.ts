import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { VERSION } from './config.ts';
import { log } from './log.ts';
import { registerAccountTools } from './tools/account.ts';
import { registerCollectionLogTools } from './tools/collectionLog.ts';
import { registerDiaryTools } from './tools/diaries.ts';
import { registerFarmingTools } from './tools/farming.ts';
import { registerKillTools } from './tools/kills.ts';
import { registerPlanTools } from './tools/plan.ts';
import { registerRouteTools } from './tools/route.ts';
import { registerExternalTools } from './tools/external.ts';
import { registerWikiTools } from './tools/wiki.ts';

const INSTRUCTIONS = `OSRS assistant for the player's own Old School RuneScape account.
- Account tools read data exported by the player's RuneLite plugin. Always mention how fresh the data is: the bank and other storage are only as current as the last time they were opened in-game.
- Start with get_account_summary to learn the account type. Ironman modes (ironman, hardcore, ultimate, group) cannot use the Grand Exchange or trade: never recommend buying items; suggest self-sufficient methods (the wiki's "Ironman Guide/<Skill>" pages). Normal accounts may use the GE. Warn hardcore players about risky content; ultimates have no bank.
- For OSRS knowledge use wiki_search / wiki_read / wiki_lookup instead of memory or general web search; the game changes often (e.g. Sailing, Varlamore). Cite the wiki URLs.
- Check requirements against the player's data before recommending content. For "what do I need for X" / "plan X" use plan_goal.
- show_route can draw a walking route on the player's map (Shortest Path plugin) when they ask for directions; the player walks it themselves.
- Never suggest bots, macros, automation or anything that breaks Jagex rules. Apart from setting a map route, this server is read-only.`;

function createServer(): McpServer {
  const server = new McpServer({ name: 'gielinor-companion', version: VERSION }, { instructions: INSTRUCTIONS, capabilities: { tools: {} } });
  registerAccountTools(server);
  registerCollectionLogTools(server);
  registerDiaryTools(server);
  registerFarmingTools(server);
  registerKillTools(server);
  registerPlanTools(server);
  registerWikiTools(server);
  registerRouteTools(server);
  registerExternalTools(server);
  return server;
}

serveStdio(() => createServer(), { onerror: (e) => log('transport error:', e) });
log(`gielinor-companion MCP server ${VERSION} started`);
