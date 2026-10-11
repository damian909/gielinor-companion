// End-to-end smoke test: starts the server over stdio (like Claude does), points it at a fake
// plugin export, and calls every tool. Run: npm run smoke   (makes real wiki/hiscores requests)
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'gc-smoke-'));
const now = new Date().toISOString();
const key = '123456789-standard';
const env = (category: string, data: unknown) => ({
  schemaVersion: 1, pluginVersion: '0.1.0', category, accountHash: '123456789', profileType: 'standard', rsn: 'ExampleIron', capturedAt: now, data,
});
const acc = path.join(dataDir, 'accounts', key);
mkdirSync(path.join(acc, 'containers'), { recursive: true });
const write = (file: string, obj: unknown) => writeFileSync(file, JSON.stringify(obj));
write(path.join(dataDir, 'index.json'), { schemaVersion: 1, accounts: [{ key, accountHash: '123456789', profileType: 'standard', rsn: 'ExampleIron', accountType: 'ironman', lastSeen: now }] });
write(path.join(acc, 'account.json'), env('account', { rsn: 'ExampleIron', accountType: 1, accountTypeName: 'ironman', hardcoreStatusLost: false, combatLevel: 84, totalLevel: 1402, totalXp: 18234567, questPoints: 150, combatAchievementPoints: 42, collectionLog: { obtained: 64, total: 1717 }, membersWorld: true }));
write(path.join(acc, 'status.json'), env('status', { loggedIn: true, heartbeatAt: now, world: 420, location: { x: 3222, y: 3218, plane: 0, regionId: 12850, instanced: false } }));
write(path.join(acc, 'skills.json'), env('skills', { totalLevel: 1402, totalXp: 18234567, skills: [
  { name: 'Attack', level: 70, boostedLevel: 70, xp: 600000 }, { name: 'Agility', level: 70, boostedLevel: 70, xp: 760000 },
  { name: 'Herblore', level: 49, boostedLevel: 49, xp: 90000 }, { name: 'Firemaking', level: 92, boostedLevel: 92, xp: 6600000 },
  { name: 'Thieving', level: 80, boostedLevel: 80, xp: 2000000 }, { name: 'Ranged', level: 70, boostedLevel: 70, xp: 800000 },
  { name: 'Cooking', level: 69, boostedLevel: 69, xp: 700000 }, { name: 'Magic', level: 70, boostedLevel: 70, xp: 900000 },
  { name: 'Sailing', level: 1, boostedLevel: 1, xp: 0 },
] }));
write(path.join(acc, 'quests.json'), env('quests', { questPoints: 150, finished: 2, total: 4, quests: [
  { id: 'COOKS_ASSISTANT', name: "Cook's Assistant", state: 'FINISHED' }, { id: 'DRAGON_SLAYER_I', name: 'Dragon Slayer I', state: 'FINISHED' },
  { id: 'LEGENDS_QUEST', name: "Legends' Quest", state: 'NOT_STARTED' }, { id: 'MONKEY_MADNESS_I', name: 'Monkey Madness I', state: 'IN_PROGRESS' },
] }));
write(path.join(acc, 'diaries.json'), env('diaries', { tiersComplete: 2, tiersTotal: 48, regions: [
  { region: 'Ardougne', tiers: { easy: { complete: true, raw: 1 }, medium: { complete: false, raw: 0 }, hard: { complete: false, raw: 0 }, elite: { complete: false, raw: 0 } } },
  { region: 'Karamja', tiers: { easy: { complete: true, raw: 2 }, medium: { complete: false, raw: 1 }, hard: { complete: false, raw: 0 }, elite: { complete: false, raw: 0 } } },
  { region: 'Varrock', tiers: { easy: { complete: true, raw: 1, tasksDone: 14, tasksTotal: 14 }, medium: { complete: false, raw: 0, tasksDone: 2, tasksTotal: 13 }, hard: { complete: false, raw: 0, tasksDone: 0, tasksTotal: 10 }, elite: { complete: false, raw: 0, tasksDone: 0, tasksTotal: 5 } } },
], taskVars: { varps: { '1176': (1 << 15) | (1 << 16) }, varbits: {} } }));
write(path.join(acc, 'combat_achievements.json'), env('combat_achievements', { points: 42, completedCount: 3, completedTaskIds: [0, 1, 2], tierStatusRaw: {}, taskVarps: [7] }));
write(path.join(acc, 'slayer.json'), env('slayer', { hasTask: true, taskId: 3, taskName: 'Ankou', bossName: null, amountRemaining: 41, initialAmount: 120, konarAreaId: 0, masterId: 6, masterName: 'Nieve', points: 310, streak: 25, wildernessStreak: 0 }));
write(path.join(acc, 'containers', 'bank.json'), env('container', { container: 'bank', itemCount: 3, geValue: 0, haValue: 0, items: [
  { slot: 0, id: 1127, name: 'Rune platebody', quantity: 2, noted: false, gePrice: 38000, haPrice: 39000 },
  { slot: 1, id: 385, name: 'Shark', quantity: 300, noted: false, gePrice: 900, haPrice: 120 },
  { slot: 2, id: 560, name: 'Death rune', quantity: 5000, noted: false, gePrice: 180, haPrice: 108 },
] }));

write(path.join(acc, 'collection_log.json'), env('collection_log', {
  obtainedCount: 3, totalSlots: 1717, knownObtained: 2, lastCompleteCaptureAt: null, updatedAt: now,
  obtained: { '4716': 1, '20791': 312 },
  tabs: [
    { name: 'Bosses', pages: [{ name: 'Barrows Chests', items: [{ id: 4708, name: "Ahrim's hood" }, { id: 4716, name: "Dharok's helm" }, { id: 4718, name: "Dharok's greataxe" }] }] },
    { name: 'Minigames', pages: [{ name: 'Wintertodt', items: [{ id: 20791, name: 'Supply crate' }, { id: 20693, name: 'Phoenix' }] }] },
  ],
}));

write(path.join(acc, 'kills.json'), env('kills', { bosses: [{ name: 'Wintertodt', count: 312 }, { name: 'Brutus', count: 12 }, { name: 'Obor', count: 3 }, { name: 'Vorkath', count: 0 }], activities: [{ name: 'Clue Scrolls (all)', count: 23 }], personalBestsSeconds: { brutus: 83.4, 'varrock rooftop course': 61.2 } }));

const nowS = Math.floor(Date.now() / 1000);
write(path.join(acc, 'farming.json'), env('farming', { available: true, patchTypes: { Herbs: { state: 'IN_PROGRESS', doneAt: nowS + 2400 }, Trees: { state: 'COMPLETED', doneAt: nowS - 600 }, Allotments: { state: 'UNKNOWN', doneAt: null } }, birdHouses: { state: 'IN_PROGRESS', doneAt: nowS - 60 } }));

const server = spawn(process.execPath, [path.join(here, '..', 'src', 'index.ts')], {
  env: { ...process.env, GC_DATA_DIR: dataDir, GC_HOME: path.join(dataDir, 'home'), GC_RSN: 'Lynx Titan' },
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buffer = '';
const pending = new Map<number, (msg: any) => void>();
server.stdout.on('data', (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    pending.get(msg.id)?.(msg);
  }
});
let nextId = 1;
function request(method: string, params: unknown): Promise<any> {
  const id = nextId++;
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve) => pending.set(id, resolve));
}

const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
console.log('server:', init.result?.serverInfo, 'protocol', init.result?.protocolVersion, 'instructions', init.result?.instructions?.length, 'chars');
server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const tools = await request('tools/list', {});
console.log('tools:', tools.result.tools.map((t: any) => t.name).join(', '));

const calls: [string, Record<string, unknown>][] = [
  ['get_account_summary', {}],
  ['get_skills', { skills: ['Agility', 'Firemaking'] }],
  ['find_items', { query: 'rune' }],
  ['get_quests', {}],
  ['get_achievement_diaries', {}],
  ['get_achievement_diaries', { region: 'Varrock', tier: 'medium' }],
  ['get_slayer_status', {}],
  ['get_combat_achievements', { tier: 'Easy', limit: 3 }],
  ['get_collection_log', {}],
  ['get_collection_log', { page: 'barrows' }],
  ['get_boss_kills', {}],
  ['get_farming_status', {}],
  ['plan_goal', { goal: 'Monkey Madness I' }],
  ['wiki_search', { query: 'agility training ironman', limit: 3 }],
  ['wiki_read', { title: 'Barrows gloves' }],
  ['wiki_read', { title: 'Ironman Guide/Agility', section: '1', max_chars: 1500 }],
  ['wiki_lookup', { dataset: 'quest', name: 'Monkey Madness I' }],
  ['wiki_lookup', { dataset: 'item', name: 'Rune platebody' }],
  ['wiki_lookup', { dataset: 'monster', name: 'Vorkath' }],
  ['wiki_lookup', { dataset: 'drop_sources', name: 'Dragon bones' }],
  ['item_prices', { items: ['Shark', '4151'] }],
  ['hiscores_lookup', { rsn: 'Lynx Titan', only: 'skills' }],
  ['progress_history', { rsn: 'Lynx Titan', period: 'year' }],
];
let failures = 0;
for (const [name, args] of calls) {
  const started = Date.now();
  const res = await request('tools/call', { name, arguments: args });
  const body = res.result?.content?.[0]?.text ?? JSON.stringify(res.error);
  const bad = !!res.error || res.result?.isError;
  if (bad) failures++;
  console.log(`\n===== ${name} ${JSON.stringify(args)} — ${bad ? 'ERROR' : 'ok'} in ${Date.now() - started} ms, ${body.length} chars`);
  console.log(body.length > 1400 ? body.slice(0, 1400) + '\n…' : body);
}
server.kill();
console.log(`\n${failures} failing calls`);
process.exit(failures ? 1 : 0);
