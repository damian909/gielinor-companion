// stdout carries the MCP protocol; all diagnostics go to stderr (Claude Desktop saves it to its log file).
export function log(...args: unknown[]): void {
  console.error('[gielinor-companion]', ...args);
}
