# setup-codex-mcp-timeout.ps1
#
# Sets a per-server idle timeout for the codex MCP server. Run ONCE per PC.
#
# NOTE: This file is intentionally ASCII-only. PowerShell 5.1 reads .ps1 as ANSI
# unless the file has a UTF-8 BOM, and BOMs get stripped by many editors, which
# corrupts non-ASCII string literals and breaks parsing. Korean documentation for
# this script lives in docs/dev-environment-setup-multi-pc.md.
#
# WHY:
#   Claude Code aborts an MCP tool call after ~1800s of silence. codex legitimately
#   stays silent that long (gradle builds, full Playwright runs, docker rebuilds).
#   The abort does NOT stop codex itself, but the completion notification never
#   arrives, which breaks orchestration.
#
#   This setting lives in ~/.claude.json, which is NOT git-tracked, so it does NOT
#   travel between PCs. Run this script once on each PC.
#
# SAFETY:
#   - Takes a timestamped backup before writing.
#   - Uses python for the UTF-8 JSON round-trip. PowerShell's ConvertTo-Json can
#     mangle deeply nested structures, and ~/.claude.json holds config for every
#     project, so corruption would be costly.
#   - Idempotent: re-running is safe and reports "already set".
#   - Re-reads and verifies the value after writing.
#
# USAGE:
#   .\scripts\setup-codex-mcp-timeout.ps1
#   .\scripts\setup-codex-mcp-timeout.ps1 -TimeoutMs 10800000
#
# APPLIES FROM THE NEXT SESSION: MCP config is read at connect time, so a session
# already running is unaffected.

param(
    [int]$TimeoutMs = 7200000  # 2 hours
)

$ErrorActionPreference = 'Stop'

$configPath = Join-Path $env:USERPROFILE '.claude.json'
if (-not (Test-Path $configPath)) {
    Write-Error "Config not found: $configPath"
    exit 1
}

$py = (Get-Command python -ErrorAction SilentlyContinue)
if ($null -eq $py) {
    Write-Host "python not found. Apply manually:" -ForegroundColor Yellow
    Write-Host "  In $configPath, under projects.<project-path>.mcpServers.codex"
    Write-Host "  add:  `"timeout`": $TimeoutMs"
    exit 1
}

$pyScript = @'
import json, io, os, sys, shutil, datetime

timeout_ms = int(sys.argv[1])
path = os.path.expanduser("~/.claude.json")

with io.open(path, encoding="utf-8") as f:
    data = json.load(f)

targets = []
for proj, cfg in (data.get("projects") or {}).items():
    srv = (cfg.get("mcpServers") or {}).get("codex")
    if srv is not None:
        targets.append((proj, srv))

if not targets:
    print("NO_CODEX_SERVER")
    sys.exit(2)

changed = [p for p, s in targets if s.get("timeout") != timeout_ms]
if not changed:
    print("ALREADY_SET")
    for p, s in targets:
        print("  {0} -> timeout={1}".format(p, s.get("timeout")))
    sys.exit(0)

backup = path + ".bak-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
shutil.copy2(path, backup)

for _, srv in targets:
    srv["timeout"] = timeout_ms

with io.open(path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

with io.open(path, encoding="utf-8") as f:
    verify = json.load(f)
for proj, _ in targets:
    got = verify["projects"][proj]["mcpServers"]["codex"].get("timeout")
    if got != timeout_ms:
        print("VERIFY_FAILED {0} -> {1}".format(proj, got))
        sys.exit(3)

print("UPDATED")
print("  backup: " + backup)
for proj, _ in targets:
    print("  {0} -> timeout={1}".format(proj, timeout_ms))
'@

$tmp = Join-Path $env:TEMP ("setup-codex-mcp-timeout-{0}.py" -f ([guid]::NewGuid().ToString('N')))
[System.IO.File]::WriteAllText($tmp, $pyScript, (New-Object System.Text.UTF8Encoding($false)))

try {
    $output = & python $tmp $TimeoutMs
    $code = $LASTEXITCODE
    $output | ForEach-Object { Write-Host $_ }

    if ($code -eq 0) {
        Write-Host ""
        Write-Host "Done. Takes effect from the NEXT Claude Code session (MCP config is read at connect time)." -ForegroundColor Green
    }
    elseif ($code -eq 2) {
        Write-Host ""
        Write-Host "codex MCP server is not registered. Register it first, then re-run." -ForegroundColor Yellow
        Write-Host "  Verify with: claude mcp list   (expect 'codex: codex mcp-server - Connected')"
    }
    else {
        Write-Error "Failed (exit=$code). Restore from the backup shown above."
    }
}
finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
}
