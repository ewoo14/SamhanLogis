param(
    [switch]$KeepClients,
    [switch]$DownVolumes
)

$ErrorActionPreference = "Stop"

# PowerShell 5.1 (cp949) 환경에서 한글 console 출력 보존 — [feedback_powershell_utf8_writes]
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ComposeFiles = @(
    "-f", "infrastructure/docker-compose.yml",
    "-f", "infrastructure/docker-compose.local-all.yml"
)
$LogDir = Join-Path $RepoRoot "logs/local-stack/clients"

if (-not $KeepClients) {
    if (Test-Path $LogDir) {
        # MIG-23 사이클 1e fix (Codex Security MINOR) — pid 의 ProcessName 가
        # cmd/node/electron/expo/npm 패턴인지 검증 후 종료. tampered/stale pid 시 무관 process 종료 차단.
        $allowedNames = @('cmd', 'conhost', 'node', 'npm', 'electron', 'expo', 'vite')
        Get-ChildItem -Path $LogDir -Filter "*.pid" -ErrorAction SilentlyContinue | ForEach-Object {
            $pidValue = (Get-Content $_.FullName -ErrorAction SilentlyContinue | Select-Object -First 1)
            if ($pidValue) {
                try {
                    $proc = Get-Process -Id [int]$pidValue -ErrorAction Stop
                    if ($allowedNames -contains $proc.ProcessName.ToLower()) {
                        Stop-Process -Id $proc.Id -Force -ErrorAction Stop
                        Write-Host "[stop] client pid=$pidValue ($($_.BaseName) name=$($proc.ProcessName)) terminated"
                    } else {
                        Write-Warning "[stop] client pid=$pidValue ($($_.BaseName)) skipped — unexpected ProcessName='$($proc.ProcessName)'"
                    }
                } catch {
                    Write-Host "[stop] client pid=$pidValue ($($_.BaseName)) already gone"
                }
                Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

Push-Location $RepoRoot
$downExitCode = 0
try {
    if ($DownVolumes) {
        Write-Host "[stop] docker compose down -v (volume 포함 삭제)"
        docker compose @ComposeFiles down -v
        $downExitCode = $LASTEXITCODE
    } else {
        Write-Host "[stop] docker compose down"
        docker compose @ComposeFiles down
        $downExitCode = $LASTEXITCODE
    }
} finally {
    Pop-Location
}

if ($downExitCode -ne 0) {
    throw "[stop] docker compose down 실패 (exit $downExitCode)"
}

Write-Host "[stop] local stack stopped"
