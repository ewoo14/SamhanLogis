param(
    [switch]$DryRun,
    [switch]$Execute
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[cleanup] $Message"
}

function Invoke-Psql {
    param(
        [string]$Database,
        [string]$Sql
    )
    $psqlArgs = @("exec", "samhan-postgres", "psql", "-U", "samhan", "-d", $Database, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", $Sql)
    $output = & docker @psqlArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "psql 실패 database=$Database sql=$Sql output=$output"
    }
    return ($output | Out-String).Trim()
}

if (-not $Execute.IsPresent) {
    $DryRun = $true
}

$mode = "DryRun"
if ($Execute.IsPresent) {
    $mode = "Execute"
}
Write-Step ("모드: " + $mode)

$partnerOrderCountSql = @"
WITH target_orders AS (
  SELECT DISTINCT po.id
  FROM partner_orders po
  LEFT JOIN partner_order_lines pol ON pol.partner_order_id = po.id
  WHERE po.is_deleted = FALSE
    AND pol.remark LIKE 'LOADTEST-%'
),
target_drafts AS (
  SELECT id FROM partner_order_drafts
  WHERE is_deleted = FALSE AND (label LIKE 'LOADTEST-%' OR payload_json LIKE '%LOADTEST-%')
)
SELECT
  (SELECT count(*) FROM target_drafts) || ',' ||
  (SELECT count(*) FROM target_orders) || ',' ||
  (SELECT count(*) FROM partner_order_lines WHERE partner_order_id IN (SELECT id FROM target_orders)) || ',' ||
  (SELECT count(*) FROM partner_order_revisions WHERE partner_order_id IN (SELECT id FROM target_orders)) || ',' ||
  (SELECT count(*) FROM partner_order_history WHERE partner_order_id IN (SELECT id FROM target_orders) OR draft_id IN (SELECT id FROM target_drafts));
"@

$slipCountSql = @"
WITH target_slips AS (
  SELECT DISTINCT s.id
  FROM slips s
  LEFT JOIN slip_lines sl ON sl.slip_id = s.id
  WHERE s.is_deleted = FALSE
    AND (s.memo LIKE 'LOADTEST-%' OR s.project_name LIKE 'LOADTEST-%' OR sl.note LIKE 'LOADTEST-%')
),
target_estimates AS (
  SELECT DISTINCT e.id
  FROM estimates e
  LEFT JOIN estimate_lines el ON el.estimate_id = e.id
  WHERE e.is_deleted = FALSE
    AND (e.memo LIKE 'LOADTEST-%' OR el.note LIKE 'LOADTEST-%')
)
SELECT
  (SELECT count(*) FROM target_slips) || ',' ||
  (SELECT count(*) FROM slip_lines WHERE slip_id IN (SELECT id FROM target_slips)) || ',' ||
  (SELECT count(*) FROM slip_revisions WHERE slip_id IN (SELECT id FROM target_slips)) || ',' ||
  (SELECT count(*) FROM target_estimates) || ',' ||
  (SELECT count(*) FROM estimate_lines WHERE estimate_id IN (SELECT id FROM target_estimates)) || ',' ||
  (SELECT count(*) FROM estimate_revisions WHERE estimate_id IN (SELECT id FROM target_estimates));
"@

Write-Step "partner_order_db count: drafts,orders,lines,revisions,history"
Write-Host (Invoke-Psql -Database "partner_order_db" -Sql $partnerOrderCountSql)

Write-Step "slip_db count: slips,slip_lines,slip_revisions,estimates,estimate_lines,estimate_revisions"
Write-Host (Invoke-Psql -Database "slip_db" -Sql $slipCountSql)

if (-not $Execute.IsPresent) {
    Write-Step "DryRun 종료. 실제 삭제는 -Execute 로 실행하십시오."
    exit 0
}

$partnerOrderDeleteSql = @"
BEGIN;
CREATE TEMP TABLE tmp_loadtest_drafts AS
  SELECT id FROM partner_order_drafts
  WHERE is_deleted = FALSE AND (label LIKE 'LOADTEST-%' OR payload_json LIKE '%LOADTEST-%');
CREATE TEMP TABLE tmp_loadtest_orders AS
  SELECT DISTINCT po.id
  FROM partner_orders po
  LEFT JOIN partner_order_lines pol ON pol.partner_order_id = po.id
  WHERE po.is_deleted = FALSE
    AND pol.remark LIKE 'LOADTEST-%';
DELETE FROM slip_publish_outbox WHERE partner_order_id IN (SELECT id FROM tmp_loadtest_orders);
DELETE FROM partner_order_revisions WHERE partner_order_id IN (SELECT id FROM tmp_loadtest_orders);
DELETE FROM partner_order_history WHERE partner_order_id IN (SELECT id FROM tmp_loadtest_orders) OR draft_id IN (SELECT id FROM tmp_loadtest_drafts);
DELETE FROM partner_order_lines WHERE partner_order_id IN (SELECT id FROM tmp_loadtest_orders);
DELETE FROM partner_orders WHERE id IN (SELECT id FROM tmp_loadtest_orders);
DELETE FROM partner_order_drafts WHERE id IN (SELECT id FROM tmp_loadtest_drafts);
COMMIT;
"@

$slipDeleteSql = @"
BEGIN;
CREATE TEMP TABLE tmp_loadtest_slips AS
  SELECT DISTINCT s.id
  FROM slips s
  LEFT JOIN slip_lines sl ON sl.slip_id = s.id
  WHERE s.is_deleted = FALSE
    AND (s.memo LIKE 'LOADTEST-%' OR s.project_name LIKE 'LOADTEST-%' OR sl.note LIKE 'LOADTEST-%');
CREATE TEMP TABLE tmp_loadtest_estimates AS
  SELECT DISTINCT e.id
  FROM estimates e
  LEFT JOIN estimate_lines el ON el.estimate_id = e.id
  WHERE e.is_deleted = FALSE
    AND (e.memo LIKE 'LOADTEST-%' OR el.note LIKE 'LOADTEST-%');
DELETE FROM slip_source_orders WHERE slip_id IN (SELECT id FROM tmp_loadtest_slips);
DELETE FROM slip_revisions WHERE slip_id IN (SELECT id FROM tmp_loadtest_slips);
DELETE FROM slip_audit_logs WHERE slip_id IN (SELECT id FROM tmp_loadtest_slips);
DELETE FROM slip_lines WHERE slip_id IN (SELECT id FROM tmp_loadtest_slips);
DELETE FROM slips WHERE id IN (SELECT id FROM tmp_loadtest_slips);
DELETE FROM estimate_revisions WHERE estimate_id IN (SELECT id FROM tmp_loadtest_estimates);
DELETE FROM estimate_lines WHERE estimate_id IN (SELECT id FROM tmp_loadtest_estimates);
DELETE FROM estimates WHERE id IN (SELECT id FROM tmp_loadtest_estimates);
COMMIT;
"@

$authResetSql = @"
UPDATE accounts
SET failed_login_attempts = 0,
    locked_at = NULL,
    modified_at = NOW(),
    modified_by = 'loadtest-cleanup'
WHERE login_id IN ('dev_sales', 'dev_warehouse', 'dev_accountant', 'dev_manager');
"@

# 한계: LOADTEST 마커가 없는 채번 counter/sequence 테이블
# (slip_number_sequences, estimate_number_sequences, journal_number_sequences,
# tax_invoice_number_sequences 등)은 삭제하지 않는다. 장기 재사용 Testcontainers 에서는
# 채번 IT 가 자체 격리 날짜/조건을 사용해야 하며, cleanup 은 부하 데이터 본문만 정리한다.

Write-Step "partner_order_db 삭제"
Invoke-Psql -Database "partner_order_db" -Sql $partnerOrderDeleteSql | Write-Host
Write-Step "slip_db 삭제"
Invoke-Psql -Database "slip_db" -Sql $slipDeleteSql | Write-Host
Write-Step "auth_db dev 계정 failed_login_attempts 원복"
Invoke-Psql -Database "auth_db" -Sql $authResetSql | Write-Host

Write-Step "삭제 후 잔존 count 확인"
Write-Host (Invoke-Psql -Database "partner_order_db" -Sql $partnerOrderCountSql)
Write-Host (Invoke-Psql -Database "slip_db" -Sql $slipCountSql)
