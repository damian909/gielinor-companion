# Architecture

```
 RuneLite client (play.cmd)                         MCP server (Node 24, stdio)              Claude
 ┌──────────────────────────────┐   JSON files     ┌─────────────────────────────────┐      Desktop / Code
 │ Gielinor Companion Exporter  │ ───────────────▶ │ account · diaries · collection  │ ◀──▶
 │  reads game state (read-only)│                  │ log · kills · farming · planner │
 │  forwards map routes ───────────▶ Shortest Path │ wiki · prices · hiscores · WOM  │
 └──────────────────────────────┘ ◀── route.json ─ │ route requests                  │
                                                   └──────────────┬──────────────────┘
                                                                  │ cached, rate-limited HTTPS
                                          OSRS Wiki · prices.runescape.wiki · hiscores · Wise Old Man
```

## Why files, not a socket
- RuneLite rejects plugins that expose player information over HTTP, and plugins may not start processes.
- Files survive restarts of both the game and Claude, which matters for data the game only sends while an interface is open (bank, seed vault, collection log).
- Multiple Claude clients can each run their own server instance; they all just read the same files.

## The exporter plugin (`runelite-plugin/`)
- Runs inside the normal RuneLite client via `play.cmd` (Gradle builds the plugin and writes a Java argfile; no developer mode). Logging in uses RuneLite's documented `--insecure-write-credentials` flow, because a launcher-started client can't load unpublished plugins.
- Builds snapshots on the client thread; writes them on its own thread with atomic temp-file + move (falls back to an overwrite when Windows has the file open).
- Flushes changed categories at most every ~3 s; status heartbeat every ~60 s; quests re-checked at most every ~2 min; farming every ~5 min.

### Export layout (`~/.runelite/plugin-data/gielinorcompanion/`)
```
index.json                                   known accounts (key = <accountHash>-<profileType>)
accounts/<key>/account.json                  type, combat/total level, QP, CA points, collection log totals
accounts/<key>/status.json                   logged in, world, location, heartbeat
accounts/<key>/skills.json                   level / boosted / xp per skill (incl. Sailing)
accounts/<key>/quests.json                   state per quest/miniquest
accounts/<key>/diaries.json                  tier completion, tasks done per tier, raw task vars
accounts/<key>/combat_achievements.json      completed task ids, points, tier status
accounts/<key>/slayer.json                   task, amount, master, points, streak
accounts/<key>/kills.json                    boss kill counts, activity scores, personal bests
accounts/<key>/farming.json                  per patch type state + ready time, bird houses
accounts/<key>/collection_log.json           obtained items (merged over time) + log layout
accounts/<key>/containers/<name>.json        bank, inventory, equipment, seed vault, looting bag, kits, boat cargo
requests/route.json, route-status.json       map route request from the server, and the plugin's acknowledgement
```
Every file is an envelope: `{schemaVersion, pluginVersion, category, accountHash, profileType, rsn, capturedAt, data}`. Different game modes (Leagues, Deadman, …) are separate accounts.

### Where the data comes from
| Data | Source |
|---|---|
| Skills, quests, slayer, CAs, diaries | client state, varps/varbits (`net.runelite.api.gameval`) |
| Diary tasks | per-task vars; task names generated from Quest Helper (`scripts/gen-diary-tasks.mjs`, BSD-2) |
| Kill counts | the game's hiscores DB tables (boss/activity → varp) |
| Personal bests | RuneLite Chat Commands' saved PBs (read-only) |
| Collection log | search view (`collection_delayed_transmit` script), page views (transmit inventory), new-item chat messages; layout from cache enums/structs |
| Farming | RuneLite Time Tracking's public trackers |
| Containers | `ItemContainerChanged`; storage keeps its last-known contents |

## The MCP server (`mcp-server/`)
- Reads the export (path-allowlisted, read-and-close with retries).
- Wiki: CirrusSearch, section-level parsing converted to compact markdown, Bucket queries for structured data (quests, items, monsters, drops, combat achievements, collection log sources), `{{Map}}` markers for routes.
- Caches everything in SQLite (`node:sqlite`, WAL) under `~/.gielinor-companion/`.
- One request at a time per host, with a descriptive User-Agent and backoff.

## Configuration (environment variables)
| Variable | Default | Meaning |
|---|---|---|
| `GC_HOME` | `~/.gielinor-companion` | cache folder |
| `GC_DATA_DIR` | `~/.runelite/plugin-data/gielinorcompanion` | plugin export folder |
| `GC_RSN` | – | name for hiscores / Wise Old Man before the plugin has exported |
| `GC_UA_CONTACT` | – | contact appended to the User-Agent |
| `GC_EXTERNAL` | `hiscores,wom` | public sources the server may query |
