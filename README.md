<div align="center">

# 🧭 Gielinor Companion

### Your personal Old School RuneScape guide — built on *your* account.

Ask Claude what to do next and get answers based on your real levels, quests, bank, diaries and collection log,
checked against the OSRS Wiki, with routes drawn straight onto your in-game map.

![RuneLite](https://img.shields.io/badge/RuneLite-plugin-orange)
![MCP](https://img.shields.io/badge/Model_Context_Protocol-server-purple)
![Node 24](https://img.shields.io/badge/Node.js-24-green)
![Java 11](https://img.shields.io/badge/Java-11-blue)
![Read-only](https://img.shields.io/badge/game_access-read--only-brightgreen)
![License](https://img.shields.io/badge/license-BSD--2--Clause-lightgrey)

</div>

---

## Why?

Coming back to OSRS after a break — or just planning your next goal — usually means juggling the wiki, a quest
guide, a diary checklist, the hiscores and your own bank. Generic guides don't know what *you* have done.

**Gielinor Companion lets Claude see your actual account**, so the advice is personal:

> **You:** I'm back after a year. What should I work on?
>
> **Claude:** You're one Cooking level away from Barrows gloves: Recipe for Disaster only has *Freeing King Awowogei*
> (needs 70 Cooking — you're 68) and the Culinaromancer left. You already have Ice gloves and 5 restore potions in
> your bank. After that, Lunar Diplomacy only needs 61 Crafting (you're 58)…

> **You:** Which Varrock medium tasks can I do right now?
>
> **Claude:** 5 of your 7 remaining tasks: you have 120 mahogany logs for the planks, a Ring of Charos(a) for the
> cat colour, and you've finished Garden of Tranquillity and A Soul's Bane…

> **You:** Show me the way to Lokar Searunner.
>
> **Claude:** Done — the route is on your world map and minimap.

It works for **every account type** and understands **ironman rules** (no Grand Exchange, no trading,
hardcore safety, ultimate-ironman banking), so it won't tell an iron to "just buy it".

## ✨ Features

| | Feature | Ask things like… |
|---|---|---|
| 📊 | **Account overview** — type, levels, quest points, diaries, combat achievements, collection log, slayer task, bank value, and how fresh each part is | *"Give me an overview of my account"* |
| 🎯 | **Goal planner** — missing prerequisite quests in the order to do them, skill levels across the whole chain with XP to go, quest points, and the required items checked against your bank | *"Plan Barrows gloves"* · *"What do I need for Dragon Slayer II?"* |
| 📜 | **Quests** — every quest's state, with wiki requirements checked against your stats | *"Which quests am I missing?"* · *"Can I do Monkey Madness I?"* |
| 🗺️ | **Achievement diaries** — tasks done per tier and the exact tasks left | *"Which Varrock medium tasks haven't I done?"* |
| 🏆 | **Collection log** — progress per tab and page, missing items with drop sources and rates; new items saved the moment you get them | *"What am I missing from Wintertodt?"* |
| 💀 | **Boss kill counts & PBs** — exact counts straight from the game (including the low ones the hiscores skip) and personal-best times | *"What are my boss kill counts?"* |
| ⚔️ | **Combat achievements** — progress per tier and remaining tasks by boss or tier | *"Which easy combat achievements are left?"* |
| 🎒 | **Item search** — bank, inventory, gear, seed vault, looting bag, kits and Sailing cargo holds, with GE and high-alch values | *"Do I have a dramen staff?"* · *"What's worth alching in my bank?"* |
| 🌱 | **Farming timers** — when your herbs, trees, allotments and bird houses are ready | *"Are my herbs ready?"* |
| 🧪 | **Slayer** — current task, master, points and streak | *"What's my slayer task?"* |
| 🧭 | **Map routes** — draws a walking route to any NPC, place or coordinate on your in-game map via the [Shortest Path](https://github.com/Skretzo/shortest-path) plugin; you walk it yourself | *"Show me the way to the Fishing Guild"* |
| 📚 | **OSRS Wiki** — fast search, readable page sections (tables included) and structured data on quests, items, monsters and drop tables | *"How do I train Agility as an ironman?"* |
| 📈 | **Progress & prices** — official hiscores, Wise Old Man gains over time, live GE prices and alch values | *"What did I gain this year?"* |

## 🧩 How it works

```
 RuneLite + exporter plugin  ──JSON files──▶  MCP server  ──▶  Claude Desktop / Claude Code
   (reads your account)                         │
   Shortest Path ◀── route requests ────────────┤
                                                └──▶ OSRS Wiki · GE prices · hiscores · Wise Old Man
```

1. **The exporter plugin** (Java) runs inside RuneLite and writes your own account state to local files: skills, quests, diaries, bank and storage, collection log, kill counts, farming timers and more. It only *reads* the game.
2. **The MCP server** (TypeScript) gives Claude tools to read those files and to look things up on the OSRS Wiki.
3. **Claude** combines both to answer your questions, and can show routes on your map.

Your data is saved to disk, so Claude can still answer while the game is closed. Storage the game only sends while
it's open (bank, seed vault, …) keeps its last-known contents and Claude tells you how old it is.
More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 🚀 Setup (Windows)

**You need:** [RuneLite](https://runelite.net), [Node.js 24+](https://nodejs.org), a Java 17 JDK (e.g. [Temurin](https://adoptium.net/temurin/releases/?version=17)), and [Claude Desktop](https://claude.ai/download) and/or Claude Code. Optional: the **Shortest Path** plugin from the RuneLite Plugin Hub for map routes.

1. **Get the code and install the server's dependencies**
   ```bash
   git clone https://github.com/damian909/gielinor-companion.git
   cd gielinor-companion/mcp-server && npm install
   ```
2. **Java:** set `JAVA_HOME` to your JDK 17, or unpack it to `%USERPROFILE%\.gielinor-companion\jdk`.
3. **One-time login setup.** The exporter isn't on the Plugin Hub, so RuneLite runs it from this project instead of the Jagex Launcher:
   - Start menu → **RuneLite (configure)** → add `--insecure-write-credentials` under *Client arguments* → Save.
   - Start RuneLite once from the **Jagex Launcher**, then close it.
   - Back in **RuneLite (configure)**: remove that argument again → Save.

   This saves a login token in `~/.runelite/credentials.properties`. ⚠️ It works like a password: never share it. To revoke it, delete the file and use *End sessions* in your Jagex account settings. ([RuneLite docs](https://github.com/runelite/runelite/wiki/Using-Jagex-Accounts))
4. **Connect Claude:** `powershell -ExecutionPolicy Bypass -File scripts\register-mcp.ps1` (optionally `-Rsn "Your Name"`), then restart Claude Desktop.
5. **Play** with `play.cmd` (make a desktop shortcut to it). It's the normal RuneLite client — your settings and Plugin Hub plugins load as usual — with the exporter built in.
6. **Recommended in game:** open your bank once per session; press *Search* in the collection log once; set *Collection log – New addition notification* to a chat message; keep RuneLite's *Time Tracking* and *Chat Commands* plugins on.

Then just ask Claude about your account.

## 🔒 Safety & privacy

- **Read-only by design.** The plugin only reads client state. No input injection, no menu actions, no automation —
  in line with [Jagex's third-party client guidelines](https://secure.runescape.com/m=news/third-party-client-guidelines?oldschool=1).
  The single exception is passing a map destination to the Shortest Path plugin when you ask for directions.
- **Local first.** Your data stays on your PC; only what you ask about ends up in a Claude conversation.
  Hiscores and Wise Old Man lookups use your public name and can be turned off (`GC_EXTERNAL`).
- **Login files are never read.** The server only reads the plugin's own export folder.
- **Polite to the wiki.** Descriptive User-Agent, one request at a time, aggressive caching. Wiki content is
  [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) and answers cite their source pages.

## 🧪 Development

```bash
cd mcp-server
npm run check     # type-check
npm run smoke     # end-to-end test: made-up export + live wiki/hiscores

cd runelite-plugin
./gradlew run     # developer client with RuneLite dev tools (JAVA_HOME = JDK 17)
```

| Folder | Contents |
|---|---|
| `runelite-plugin/` | Exporter plugin (Java 11 target, RuneLite gameval API) |
| `mcp-server/` | MCP server (`@modelcontextprotocol/server` v2, runs `.ts` directly on Node 24) |
| `scripts/` | Claude registration; diary task table generator |
| `docs/` | Architecture and data formats |

Diary task names are generated from [Quest Helper](https://github.com/Zoinkwiz/quest-helper) (BSD-2) — see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Game data comes from the [OSRS Wiki](https://oldschool.runescape.wiki).

## Limitations

- Windows scripts only for now (the plugin and server themselves are cross-platform).
- Not on the RuneLite Plugin Hub: you play through `play.cmd` with a saved login token.
- Farming timers are per patch type (via RuneLite's Time Tracking), not per individual patch.
- Personal bests only include times RuneLite has seen in chat.

## ☕ Support

Gielinor Companion is free and open source. If it helps your account, you can support its development on Ko-fi — thank you!

[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20development-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/damian909)

## License

[BSD 2-Clause](LICENSE). Not affiliated with Jagex, RuneLite, Anthropic or the OSRS Wiki.
Old School RuneScape is a trademark of Jagex Ltd.
