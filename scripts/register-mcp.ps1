# Registers the Gielinor Companion MCP server with Claude Code (user scope) and Claude Desktop.
# Safe to re-run. Restart Claude Desktop afterwards so it picks up the change.
#
#   powershell -ExecutionPolicy Bypass -File scripts\register-mcp.ps1 [-Rsn "Your Name"]
#
# -Rsn is optional: it lets hiscores / Wise Old Man lookups work before the plugin has exported anything.
param([string]$Rsn = '')
$ErrorActionPreference = 'Stop'

$name   = 'gielinor-companion'
$repo   = Split-Path -Parent $PSScriptRoot
$server = Join-Path $repo 'mcp-server\src\index.ts'
$node   = (Get-Command node -ErrorAction Stop).Source
$envVars = @{}
if ($Rsn) { $envVars['GC_RSN'] = $Rsn }

# --- Claude Code (writes ~/.claude.json) ---
$claude = Get-Command claude -ErrorAction SilentlyContinue
if ($claude) {
    # Remove any previous registration; "not found" on first run is expected.
    try { & $claude.Source mcp remove --scope user $name 2>$null | Out-Null } catch { }
    $envArgs = $envVars.GetEnumerator() | ForEach-Object { '-e'; "$($_.Key)=$($_.Value)" }
    & $claude.Source mcp add --scope user @envArgs --transport stdio $name -- $node $server
    Write-Host "Claude Code: registered ""$name"" (user scope)."
} else {
    Write-Host 'Claude Code CLI not found; skipped.'
}

# --- Claude Desktop (the Microsoft Store build keeps its config in the package's LocalCache) ---
$candidates = @(
    (Join-Path $env:APPDATA 'Claude\claude_desktop_config.json')
)
$packages = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Packages') -Filter 'Claude_*' -ErrorAction SilentlyContinue
foreach ($p in $packages) { $candidates = @(Join-Path $p.FullName 'LocalCache\Roaming\Claude\claude_desktop_config.json') + $candidates }
$log = Join-Path $env:LOCALAPPDATA 'Claude\Logs\main.log'
if (Test-Path $log) {
    $line = Select-String -Path $log -Pattern 'Reading claude_desktop_config.json from (.+)$' | Select-Object -Last 1
    if ($line) { $candidates = @($line.Matches[0].Groups[1].Value.Trim()) + $candidates }
}
$configPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $configPath) {
    Write-Host 'Claude Desktop config not found; skipped.'
    exit 0
}

Copy-Item $configPath "$configPath.bak-gielinor-companion" -Force
$config = Get-Content $configPath -Raw | ConvertFrom-Json
if (-not $config.PSObject.Properties['mcpServers']) {
    $config | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{})
}
$entry = [pscustomobject]@{ command = $node; args = @($server); env = [pscustomobject]$envVars }
$config.mcpServers | Add-Member -NotePropertyName $name -NotePropertyValue $entry -Force
$json = $config | ConvertTo-Json -Depth 32
[IO.File]::WriteAllText($configPath, $json, (New-Object Text.UTF8Encoding($false)))
Write-Host "Claude Desktop: registered ""$name"" in $configPath (backup: .bak-gielinor-companion)."
Write-Host 'Restart Claude Desktop (tray icon > Quit, then start it again) to load it.'
