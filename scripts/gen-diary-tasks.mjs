// Generates the Achievement Diary task table from Quest Helper's diary helpers (BSD-2-Clause,
// https://github.com/Zoinkwiz/quest-helper) and RuneLite's gameval constants.
//
// Outputs:
//   mcp-server/data/diary-tasks.json                         task -> completion check (used by the MCP server)
//   runelite-plugin/.../exporter/DiaryTaskVars.java          var ids the plugin must export
//
// Usage (re-run after game updates that add/change diary tasks):
//   node scripts/gen-diary-tasks.mjs [quest-helper-commit]
// Needs a JDK (JAVA_HOME, or %USERPROFILE%\.gielinor-companion\jdk) and a built runelite-plugin (for the RuneLite API jar).
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const commit = process.argv[2] ?? 'master';
const QH = `https://raw.githubusercontent.com/Zoinkwiz/quest-helper/${commit}/src/main/java/com/questhelper/helpers/achievementdiaries`;

const REGIONS = [
  ['Ardougne', 'ardougne', 'Ardougne'],
  ['Desert', 'desert', 'Desert'],
  ['Falador', 'falador', 'Falador'],
  ['Fremennik', 'fremennik', 'Fremennik'],
  ['Kandarin', 'kandarin', 'Kandarin'],
  ['Karamja', 'karamja', 'Karamja'],
  ['Kourend & Kebos', 'kourend', 'Kourend'],
  ['Lumbridge & Draynor', 'lumbridgeanddraynor', 'Lumbridge'],
  ['Morytania', 'morytania', 'Morytania'],
  ['Varrock', 'varrock', 'Varrock'],
  ['Western Provinces', 'westernprovinces', 'Western'],
  ['Wilderness', 'wilderness', 'Wilderness'],
];
const TIERS = ['Easy', 'Medium', 'Hard', 'Elite'];

// --- gameval constants from the RuneLite API jar (via javap) ---
function findJar(dir, name) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) {
      const hit = findJar(p, name);
      if (hit) return hit;
    } else if (entry.startsWith(name) && entry.endsWith('.jar') && !entry.includes('sources')) {
      return p;
    }
  }
  return null;
}
const apiJar = findJar(path.join(os.homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1', 'net.runelite', 'runelite-api'), 'runelite-api-');
if (!apiJar) throw new Error('RuneLite API jar not found; build runelite-plugin first');
const jdk = process.env.JAVA_HOME ?? path.join(os.homedir(), '.gielinor-companion', 'jdk');
const javap = path.join(jdk, 'bin', 'javap');
function constants(cls) {
  const out = execFileSync(javap, ['-constants', '-cp', apiJar, cls], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return new Map([...out.matchAll(/static final int (\w+) = (-?\d+);/g)].map((m) => [m[1], Number(m[2])]));
}
const VARP = constants('net.runelite.api.gameval.VarPlayerID');
const VARBIT = constants('net.runelite.api.gameval.VarbitID');

// --- parse Quest Helper ---
function parseRequirements(src) {
  const reqs = new Map();
  for (const m of src.matchAll(/(not\w+)\s*=\s*new VarplayerRequirement\(\s*VarPlayerID\.(\w+)\s*,\s*false\s*,\s*(\d+)\s*\)/g)) {
    const id = VARP.get(m[2]);
    if (id !== undefined) reqs.set(m[1], { varp: id, bit: Number(m[3]) });
  }
  for (const m of src.matchAll(/(not\w+)\s*=\s*new VarbitRequirement\(\s*VarbitID\.(\w+)\s*,\s*(-?\d+)\s*(?:,\s*Operation\.(\w+))?\s*\)/g)) {
    const id = VARBIT.get(m[2]);
    // Quest Helper's condition means "not done yet" while it holds.
    if (id !== undefined) reqs.set(m[1], { varbit: id, notDoneOp: m[4] ?? 'EQUAL', value: Number(m[3]) });
  }
  return reqs;
}

function parseTasks(src) {
  const tasks = [];
  const firstNot = (cond) => cond.match(/\b(not\w+)/)?.[1];
  // Pattern A: PanelDetails x = new PanelDetails("Title", ...); x.setDisplayCondition(cond);
  // (the right-hand side may be a ternary: x = cond ? new PanelDetails("Title", ..) : ..)
  const titles = new Map([...src.matchAll(/PanelDetails\s+(\w+)\s*=[^;]*?new PanelDetails\(\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
  for (const m of src.matchAll(/(\w+)\.setDisplayCondition\(([^;]+)\);/g)) {
    const title = titles.get(m[1]);
    const not = firstNot(m[2]);
    if (title && not) tasks.push({ title, not });
  }
  // Pattern B: PanelDetails.lockedPanel("Title", cond, ...)
  for (const m of src.matchAll(/PanelDetails\.lockedPanel\(\s*"([^"]+)"\s*,\s*([^,]+),/g)) {
    const not = firstNot(m[2]);
    if (not) tasks.push({ title: m[1], not });
  }
  return tasks;
}

const tasks = [];
const warnings = [];
for (const [region, dir, prefix] of REGIONS) {
  for (const tier of TIERS) {
    const url = `${QH}/${dir}/${prefix}${tier}.java`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const src = await res.text();
    const reqs = parseRequirements(src);
    for (const t of parseTasks(src)) {
      const check = reqs.get(t.not);
      if (!check) {
        warnings.push(`${region} ${tier}: no var for "${t.title}" (${t.not})`);
        continue;
      }
      if (tasks.some((x) => x.region === region && x.tier === tier.toLowerCase() && x.task === t.title)) continue;
      tasks.push({ region, tier: tier.toLowerCase(), task: t.title, ...check });
    }
  }
}

const varps = [...new Set(tasks.filter((t) => 'varp' in t).map((t) => t.varp))].sort((a, b) => a - b);
const varbits = [...new Set(tasks.filter((t) => 'varbit' in t).map((t) => t.varbit))].sort((a, b) => a - b);

writeFileSync(
  path.join(repo, 'mcp-server', 'data', 'diary-tasks.json'),
  JSON.stringify(
    {
      source: `Quest Helper (BSD-2-Clause) diary helpers @ ${commit}; generated by scripts/gen-diary-tasks.mjs`,
      generatedAt: new Date().toISOString(),
      tasks,
    },
    null,
    1,
  ) + '\n',
);

writeFileSync(
  path.join(repo, 'runelite-plugin', 'src', 'main', 'java', 'com', 'gielinorcompanion', 'exporter', 'DiaryTaskVars.java'),
  `package com.gielinorcompanion.exporter;

// GENERATED by scripts/gen-diary-tasks.mjs from Quest Helper's diary helpers (BSD-2-Clause). Do not edit.

/** Vars that hold individual Achievement Diary task completion; exported raw and decoded by the MCP server. */
final class DiaryTaskVars
{
	static final int[] VARPS = {${varps.join(', ')}};
	static final int[] VARBITS = {${varbits.join(', ')}};

	private DiaryTaskVars()
	{
	}
}
`,
);

console.log(`${tasks.length} tasks, ${varps.length} varps, ${varbits.length} varbits`);
for (const w of warnings) console.log('warning:', w);
