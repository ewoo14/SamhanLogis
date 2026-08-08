[CmdletBinding()]
param(
    [string] $RepoPath,
    [string] $BaseRef = 'origin/main',
    [string] $BeforeRef
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

$comparisonRef = if (-not [string]::IsNullOrWhiteSpace($BeforeRef)) { $BeforeRef } else { $BaseRef }
$isPushComparison = -not [string]::IsNullOrWhiteSpace($BeforeRef)
$emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

if ($comparisonRef -match '^0+$') {
    $comparisonRef = $emptyTree
}

$refExists = $true
try {
    Invoke-Git @('cat-file', '-e', "$comparisonRef^{commit}") | Out-Null
} catch {
    $refExists = $false
}

if (-not $refExists) {
    Write-Output "WARN: 비교 기준 커밋을 로컬에서 찾지 못했습니다($comparisonRef). force-push의 이전 SHA가 소실된 경우이므로 검사를 건너뜁니다."
    Write-Output 'PASS: 비교 기준 부재로 적용된 마이그레이션 변경을 판정하지 않음.'
    exit 0
}

$diffSpec = if ($isPushComparison) { "$comparisonRef..HEAD" } else { "$comparisonRef...HEAD" }
$diffLines = @(Invoke-Git @('diff', '--name-status', '--find-renames', $diffSpec))
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
