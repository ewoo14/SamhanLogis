param(
    [string] $VerifySql = 'scripts/qa-residue/2026-08-12-verify-and-repair.sql',
    [string] $ExecuteSql = 'scripts/qa-residue/2026-08-12-soft-delete-qa-residue.sql',
    [string] $RollbackSql = 'scripts/qa-residue/2026-08-12-rollback-soft-delete-qa-residue.sql'
)

$ErrorActionPreference = 'Stop'

function Assert-Contains([string] $Text, [string] $Needle, [string] $Message) {
    if ($Text.IndexOf($Needle, [System.StringComparison]::Ordinal) -lt 0) {
        throw "회귀: $Message (필요 문자열: $Needle)"
    }
}

$verify = Get-Content -LiteralPath $VerifySql -Raw -Encoding UTF8
Assert-Contains $verify 'partner_db' '검증 SQL이 partner_db를 점검해야 합니다.'
Assert-Contains $verify 'slip_db' '검증 SQL이 slip_db를 점검해야 합니다.'
Assert-Contains $verify 'qa-residue-softdelete-2026-08-12' '복구 표지를 점검해야 합니다.'
Assert-Contains $verify 'repair' '복구는 명시 플래그로만 허용해야 합니다.'
Assert-Contains $verify 'confirm' '복구 확인 토큰이 필요해야 합니다.'

foreach ($path in @($ExecuteSql, $RollbackSql)) {
    $sql = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    Assert-Contains $sql 'pg_advisory_xact_lock' "$path 는 트랜잭션 수준 advisory lock을 사용해야 합니다."
    if ($sql.IndexOf('pg_advisory_lock', [System.StringComparison]::Ordinal) -ge 0) {
        throw "회귀: $path 에 세션 수준 pg_advisory_lock이 남아 있습니다."
    }
}

Write-Output 'FIX4_STATIC_RED_GREEN_PASS'
