param(
  [string]$Container = 'samhan-postgres',
  [string]$Database = 'auth_db',
  [string]$User = 'samhan'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$snapshotPath = Join-Path $repoRoot 'clients/desktop/src/renderer/test-utils/accounting-slip-permission-snapshot.ts'
$outputPath = Join-Path $repoRoot 'clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'DB 파생 스냅샷 갱신 중단: docker 명령이 없습니다.'
}
docker inspect $Container *> $null
if ($LASTEXITCODE -ne 0) {
  throw "DB 파생 스냅샷 갱신 중단: 컨테이너 '$Container'가 없습니다. 체크인 산출물로 조용히 대체하지 않습니다."
}

$snapshot = Get-Content -Raw -Encoding UTF8 $snapshotPath
$pageMatch = [regex]::Match($snapshot, 'PERMISSION_PAGE_CODES = \[(.*?)\] as const', [Text.RegularExpressions.RegexOptions]::Singleline)
if (-not $pageMatch.Success) { throw 'PERMISSION_PAGE_CODES를 찾지 못했습니다.' }
$pages = [regex]::Matches($pageMatch.Groups[1].Value, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$roles = @('MASTER','MANAGER','SALES','ACCOUNTANT','WAREHOUSE','INVENTORY','DISPATCH','DRIVER','STAFF','DEVELOPER','PARTNER')
$pageSql = ($pages | ForEach-Object { "'" + $_.Replace("'", "''") + "'" }) -join ','
$roleSql = ($roles | ForEach-Object { "'$_'" }) -join ','
$sql = "SELECT role_code, page_code, concat(can_view::int,can_create::int,can_update::int,can_delete::int,can_restore::int,can_download::int,can_print::int) FROM role_page_permission_templates WHERE is_deleted=false AND role_code IN ($roleSql) AND page_code IN ($pageSql) ORDER BY role_code, page_code;"
$rows = @(docker exec $Container psql -U $User -d $Database -X -A -F '|' -t -c $sql)
if ($LASTEXITCODE -ne 0 -or ($rows | Where-Object { $_ -match '\|' }).Count -eq 0) {
  throw 'DB 파생 스냅샷 갱신 중단: auth_db SELECT가 실패했거나 결과가 비었습니다. 기존 체크인 산출물로 통과시키지 않습니다.'
}
$byRole = @{}
foreach ($row in $rows) {
  if ($row -notmatch '\|') { continue }
  $parts = $row.Split('|')
  if (-not $byRole.ContainsKey($parts[0])) { $byRole[$parts[0]] = @{} }
  $byRole[$parts[0]][$parts[1]] = $parts[2]
}
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('// auth_db role_page_permission_templates projection, read-only SELECT.')
$lines.Add('// Scope: PERMISSION_ROLES × PERMISSION_PAGE_CODES. Missing DB rows are 0000000.')
$lines.Add('export const PERMISSION_DB_BITS_BY_ROLE: Record<string, Record<string, string>> = {')
foreach ($role in $roles) {
  $lines.Add("  '$role': {")
  foreach ($page in $pages) {
    $bits = if ($byRole[$role].ContainsKey($page)) { $byRole[$role][$page] } else { '0000000' }
    if ($bits -ne '0000000') { $lines.Add("    '$page': '$bits',") }
  }
  $lines.Add('  },')
}
$lines.Add('}')
[IO.File]::WriteAllText($outputPath, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
Write-Output "Wrote DB-derived projection: $outputPath"
Write-Output 'Next: run the contract test; any changed divergence set must update permission-mock-divergences.ts in the same change.'
