[CmdletBinding()]
param(
    [string] $ContainerName = 'samhan-postgres',
    [string] $Database = 'slip_db',
    [string] $User = 'samhan'
)

$sql = @'
WITH groups AS (
    SELECT s.id AS slip_id,
           s.slip_no,
           BTRIM(l.parent_set_model) AS parent_set_model,
           COUNT(*) AS line_count,
           COUNT(*) FILTER (WHERE COALESCE(l.set_head, false)) AS head_count
      FROM slips s
      JOIN slip_lines l ON l.slip_id = s.id
     WHERE s.is_deleted = false
       AND l.is_deleted = false
       AND l.parent_set_model IS NOT NULL
       AND BTRIM(l.parent_set_model) <> ''
       AND NULLIF(BTRIM(l.bundle_set_options ->> 'instanceKey'), '') IS NULL
     GROUP BY s.id, s.slip_no, BTRIM(l.parent_set_model)
), active_multi AS (
    SELECT * FROM groups WHERE head_count > 1
)
SELECT 'active_keyless_multi_instance_groups=' || COUNT(*) FROM active_multi
UNION ALL
SELECT 'target|' || slip_no || '|parent=' || parent_set_model
       || '|lines=' || line_count || '|heads=' || head_count
  FROM active_multi
 ORDER BY 1;
'@

$output = & docker exec $ContainerName psql -U $User -d $Database `
    -v ON_ERROR_STOP=1 -X -A -t -c $sql 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "R9 preflight SQL failed: $output"
}

$lines = @($output | Where-Object { $_ -and $_.ToString().Trim() })
$lines | ForEach-Object { Write-Output $_ }

$summary = $lines | Where-Object { $_ -match '^active_keyless_multi_instance_groups=(\d+)$' }
if (-not $summary) {
    throw 'R9 preflight did not return active_keyless_multi_instance_groups'
}

$count = [int]$Matches[1]
if ($count -ne 0) {
    throw "R9 preflight failed: active_keyless_multi_instance_groups=$count"
}
