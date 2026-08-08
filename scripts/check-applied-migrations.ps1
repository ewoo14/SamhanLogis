[CmdletBinding()]
param(
    [string] $RepoPath,
    [string] $BaseRef = 'origin/main'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RepoPath)) {
    $RepoPath = Split-Path -Parent $PSScriptRoot
}

function Invoke-Git([string[]] $Arguments) {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & git -C $RepoPath @Arguments 2>&1
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE`n$($output -join [Environment]::NewLine)"
    }
    return @($output)
}

function Is-AppliedMigration([string] $Path) {
    return $Path -match '(?i)(^|/)db/migration/V[^/]*\.sql$'
}

if (-not (Test-Path -LiteralPath $RepoPath -PathType Container)) {
    throw "Repository path not found: $RepoPath"
}

Invoke-Git @('rev-parse', '--verify', $BaseRef) | Out-Null
$diffLines = @(Invoke-Git @('diff', '--name-status', '--find-renames', "$BaseRef...HEAD"))
$violations = @()

foreach ($line in $diffLines) {
    $text = [string] $line
    if ([string]::IsNullOrWhiteSpace($text)) { continue }
    $parts = $text -split "`t"
    $status = $parts[0]
    switch -Regex ($status) {
        '^M$|^D$' {
            $path = if ($parts.Count -ge 2) { $parts[1] } else { '' }
            if (Is-AppliedMigration $path) {
                $violations += [pscustomobject]@{ Status = $status; Path = $path; Detail = $path }
            }
            break
        }
        '^R\d+$' {
            $oldPath = if ($parts.Count -ge 2) { $parts[1] } else { '' }
            $newPath = if ($parts.Count -ge 3) { $parts[2] } else { '' }
            if (Is-AppliedMigration $oldPath) {
                $violations += [pscustomobject]@{ Status = $status; Path = $oldPath; Detail = "$oldPath -> $newPath" }
            }
            break
        }
    }
}

if ($violations.Count -gt 0) {
    Write-Output 'FAIL: 적용된 Flyway 마이그레이션은 수정·삭제·이름변경할 수 없습니다.'
    Write-Output ''
    Write-Output '변경된 파일:'
    $violations | ForEach-Object { Write-Output ("  $($_.Status) $($_.Detail)") }
    Write-Output ''
    Write-Output '이 파일들은 origin/main에 이미 존재하는 적용 대상입니다. 파일 내용은 체크섬으로 검증되므로 주석만 바꿔도 기존 DB가 체크섬 불일치로 기동 불가가 됩니다.'
    Write-Output '올바른 대안: 변경 내용을 새 Flyway 마이그레이션(V*.sql)으로 추가하십시오.'
    Write-Output '부득이하게 이미 적용된 파일을 바꿨다면 scripts/repair-flyway-checksums.ps1을 모든 환경에서 실행해야 합니다.'
    exit 1
}

Write-Output "PASS: origin/main 대비 적용된 마이그레이션 변경 없음 (신규 migration 추가는 허용)."
exit 0
