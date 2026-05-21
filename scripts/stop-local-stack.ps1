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
        Get-ChildItem -Path $LogDir -Filter "*.pid" -ErrorAction SilentlyContinue | ForEach-Object {
            $pidValue = (Get-Content $_.FullName -ErrorAction SilentlyContinue | Select-Object -First 1)
            if ($pidValue) {
                try {
                    Stop-Process -Id [int]$pidValue -Force -ErrorAction Stop
                    Write-Host "[stop] client pid=$pidValue ($($_.BaseName)) terminated"
                } catch {
                    Write-Host "[stop] client pid=$pidValue ($($_.BaseName)) already gone"
                }
                Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
            }
        }
        # Vite / Expo / Electron 잔여 process 추가 정리
        Get-Process | Where-Object {
            $_.ProcessName -match '^(node|electron|vite|expo)$' -and
            $_.MainWindowTitle -match 'samhan|local-stack'
        } | ForEach-Object {
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

Push-Location $RepoRoot
try {
    if ($DownVolumes) {
        Write-Host "[stop] docker compose down -v (volume 포함 삭제)"
        docker compose @ComposeFiles down -v
    } else {
        Write-Host "[stop] docker compose down"
        docker compose @ComposeFiles down
    }
} finally {
    Pop-Location
}

Write-Host "[stop] local stack stopped"
