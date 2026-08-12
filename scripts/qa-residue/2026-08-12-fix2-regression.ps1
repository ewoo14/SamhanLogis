param(
    [Parameter(Mandatory = $true)]
    [string] $Container,
    [Parameter(Mandatory = $true)]
    [string] $Password,
    [string] $ExecuteSql = 'scripts/qa-residue/2026-08-12-soft-delete-qa-residue.sql',
    [string] $RollbackSql = 'scripts/qa-residue/2026-08-12-rollback-soft-delete-qa-residue.sql'
)

$ErrorActionPreference = 'Stop'

function Invoke-Psql([string] $Database, [string] $SqlFile) {
    docker cp $SqlFile "${Container}:/tmp/qa-regression.sql"
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = docker exec -e "PGPASSWORD=$Password" $Container psql -X -U samhan -d $Database -f /tmp/qa-regression.sql 2>&1
    $ErrorActionPreference = $previousErrorAction
    [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
}

$execute = Get-Content -LiteralPath $ExecuteSql -Raw -Encoding UTF8
$slipPreflight = $execute.IndexOf('qa_slip_line_candidates')
$partnerUpdate = $execute.IndexOf('UPDATE partners')
if ($slipPreflight -lt 0 -or $partnerUpdate -lt 0 -or $slipPreflight -gt $partnerUpdate) {
    throw '회귀: slip 사전 가드가 partner UPDATE보다 먼저 실행되어야 합니다.'
}

$rollback = Get-Content -LiteralPath $RollbackSql -Raw -Encoding UTF8
if ($rollback -notmatch 'qa_slip_rollback_targets') {
    throw '회귀: slip 복구 표지 사전 검사가 없습니다.'
}

$first = Invoke-Psql 'postgres' $ExecuteSql
if ($first.ExitCode -ne 0) {
    throw "회귀 하네스 초기 실행이 실패했습니다. exit=$($first.ExitCode)`n$($first.Output)"
}
$result = Invoke-Psql 'postgres' $ExecuteSql
if ($result.ExitCode -eq 0) {
    throw "회귀: soft-delete 가드 실패가 성공 종료로 보고되었습니다.`n$($result.Output)"
}

Write-Output "FIX2_REGRESSION_PASS exit=$($result.ExitCode)"
