# Gielinor Companion

A personal OSRS assistant: a RuneLite plugin exports the player's own account data, and an MCP server gives Claude that data plus the OSRS Wiki. The design is in `docs/ARCHITECTURE.md`; user-facing docs are in `README.md`.

## Hard rules
- **Read-only towards the game, always.** Nothing in this project may automate, control or send input to the game: no menu actions, no input events, no packets. Never use screenshot or computer-use tools on the RuneLite or game client. Only the user plays and tests in game. The one outbound action is forwarding a map destination to the Shortest Path plugin when the user asks for directions.
- **Never read** `~/.runelite/credentials.properties`, `~/.runelite/profiles2/` or `~/.runelite/session`. They hold login and session data. The MCP server only reads `~/.runelite/plugin-data/gielinorcompanion/` (the plugin's export) and `~/.gielinor-companion/` (its cache). Its only write outside its cache is `plugin-data/gielinorcompanion/requests/route.json`.
- **OSRS Wiki and prices API:** descriptive User-Agent, one request at a time, caching. Never get around a Cloudflare challenge. Wiki content is CC BY-NC-SA 3.0: keep source URLs, never commit cached wiki data, non-commercial use only.
- **No personal data in the repo:** no player names, account stats, account hashes or machine paths in code, tests, docs or commit messages. Test fixtures use made-up data.
- **Plugin Hub:** this plugin is not published there. Never publish anything that mentions Claude or MCP to the RuneLite Plugin Hub.

## Layout
- `runelite-plugin/`: Java 11 RuneLite plugin (gameval API, no reflection, Filepath for file IO). `play.cmd` runs the normal client with it built in. Template rules in `runelite-plugin/AGENTS.md` apply.
- `mcp-server/`: TypeScript, Node 24 (runs `.ts` directly), stdio MCP server on `@modelcontextprotocol/server` v2. Logs go to stderr only; stdout is the protocol. `npm run check` type-checks, `npm run smoke` runs the end-to-end test.
- `scripts/`: `register-mcp.ps1` (Claude registration), `gen-diary-tasks.mjs` (regenerates the diary task table from Quest Helper).
- `docs/`: architecture and data formats.

## Conventions
- The exporter must work for every account type (normal, ironman, hardcore, ultimate, group).
- Bump the plugin version (`CompanionExporterPlugin.VERSION`, `build.gradle`, `runelite-plugin.properties`) when the export changes.
- Bump `MARKDOWN_VERSION` in `mcp-server/src/wiki/markdown.ts` when the wiki conversion changes.
