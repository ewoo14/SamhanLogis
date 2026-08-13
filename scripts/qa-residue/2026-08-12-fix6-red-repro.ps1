param(
    [Parameter(Mandatory = $true)]
    [string] $Container,
    [string] $ExecuteSql = 'scripts/qa-residue/2026-08-12-soft-delete-qa-residue.sql',
    [string] $RollbackSql = 'scripts/qa-residue/2026-08-12-rollback-soft-delete-qa-residue.sql',
    [string] $VerifySql = 'scripts/qa-residue/2026-08-12-verify-and-repair.sql'
)

$ErrorActionPreference = 'Stop'

function Copy-Sql([string] $Path, [string] $Name) {
    docker cp $Path "${Container}:/tmp/$Name"
}

function Invoke-File([string] $Name, [string[]] $Arguments = @()) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = docker exec -e 'PGPASSWORD=fix6-only' $Container psql -X -U samhan -d postgres @Arguments -f "/tmp/$Name" 2>&1
    $ErrorActionPreference = $previous
    [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
}

function Invoke-Sql([string] $Database, [string] $Sql) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = docker exec -e 'PGPASSWORD=fix6-only' $Container psql -X -v ON_ERROR_STOP=1 -U samhan -d $Database -c $Sql 2>&1
    $ErrorActionPreference = $previous
    [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
}

Copy-Sql $ExecuteSql 'fix6-execute.sql'
Copy-Sql $RollbackSql 'fix6-rollback.sql'
Copy-Sql $VerifySql 'fix6-verify.sql'

function Reset-DeletedState {
    $rollback = Invoke-File 'fix6-rollback.sql'
    if ($rollback.ExitCode -ne 0) { throw "RED harness rollback failed: $($rollback.Output)" }
    $execute = Invoke-File 'fix6-execute.sql'
    if ($execute.ExitCode -ne 0) { throw "RED harness execute failed: $($execute.Output)" }
}

Reset-DeletedState
$mutation = Invoke-Sql 'slip_db' @"
WITH target AS (
  SELECT id FROM slips WHERE is_deleted AND deleted_by = 'qa-residue-softdelete-2026-08-12' ORDER BY slip_no LIMIT 1
)
UPDATE slips s SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, deleted_by_name = NULL
FROM target t WHERE s.id = t.id;
WITH outside AS (
  SELECT s.id FROM slips s WHERE NOT s.is_deleted AND NOT EXISTS (SELECT 1 FROM slip_lines l WHERE l.slip_id = s.id AND l.is_deleted) ORDER BY s.slip_no LIMIT 1
)
UPDATE slips s SET is_deleted = TRUE, deleted_at = clock_timestamp(), deleted_by = 'qa-residue-softdelete-2026-08-12', deleted_by_name = 'QA residue soft-delete'
FROM outside o WHERE s.id = o.id;
"@
$verify = Invoke-File 'fix6-verify.sql'
Write-Output "RED-I1 non-target marker compensated by target loss: exit=$($verify.ExitCode)"
Write-Output $verify.Output

Reset-DeletedState
$mutation = Invoke-Sql 'slip_db' "WITH target AS (SELECT id FROM slips WHERE is_deleted AND deleted_by = 'qa-residue-softdelete-2026-08-12' ORDER BY slip_no LIMIT 1) UPDATE slips s SET deleted_at = NULL FROM target t WHERE s.id = t.id"
$verify = Invoke-File 'fix6-verify.sql'
Write-Output "RED-I2 deleted_at NULL: exit=$($verify.ExitCode)"
Write-Output $verify.Output

Reset-DeletedState
$mutation = Invoke-Sql 'slip_db' @"
CREATE TABLE IF NOT EXISTS qa_residue_target_snapshot (snapshot_key TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id UUID NOT NULL, PRIMARY KEY (snapshot_key, entity_type, entity_id));
INSERT INTO qa_residue_target_snapshot VALUES ('qa-residue-softdelete-2026-08-12', 'slip', gen_random_uuid());
"@
$verify = Invoke-File 'fix6-verify.sql'
Write-Output "RED-I4 stale snapshot compensated by marker count: exit=$($verify.ExitCode)"
Write-Output $verify.Output

Reset-DeletedState
$verify = Invoke-File 'fix6-verify.sql'
Write-Output "RED-I5 normal path control: exit=$($verify.ExitCode)"
Write-Output $verify.Output

Reset-DeletedState
$mutation = Invoke-Sql 'slip_db' "DELETE FROM slip_lines WHERE is_deleted AND deleted_by = 'qa-residue-softdelete-2026-08-12' AND id = (SELECT id FROM slip_lines WHERE is_deleted AND deleted_by = 'qa-residue-softdelete-2026-08-12' ORDER BY id LIMIT 1)"
$repair = Invoke-File 'fix6-verify.sql' @('--set=repair=restore', '--set=confirm=RESTORE_QA_RESIDUE_2026-08-12')
$afterRepair = Invoke-File 'fix6-verify.sql'
Write-Output "RED-I3 hard-deleted target line repair exit=$($repair.ExitCode), immediate recheck exit=$($afterRepair.ExitCode)"
Write-Output $repair.Output
Write-Output $afterRepair.Output
