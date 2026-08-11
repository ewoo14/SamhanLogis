param(
  [string]$Database = 'auth_db',
  [string]$User = 'samhan',
  [string]$PostgresImage = 'postgres:16-alpine',
  [string]$FlywayImage = 'flyway/flyway:10.10.0'
)

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'
try {
$randomPasswordBytes = New-Object byte[] 32
$randomNumberGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $randomNumberGenerator.GetBytes($randomPasswordBytes) } finally { $randomNumberGenerator.Dispose() }
[string]$Password = [Convert]::ToBase64String($randomPasswordBytes)
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$snapshotPath = Join-Path $repoRoot 'clients/desktop/src/renderer/test-utils/accounting-slip-permission-snapshot.ts'
$outputPath = Join-Path $repoRoot 'clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'DB 파생 스냅샷 갱신 중단: docker 명령이 없습니다.'
}
$snapshot = Get-Content -Raw -Encoding UTF8 $snapshotPath
$pageMatch = [regex]::Match($snapshot, 'PERMISSION_PAGE_CODES = \[(.*?)\] as const', [Text.RegularExpressions.RegexOptions]::Singleline)
if (-not $pageMatch.Success) { throw 'PERMISSION_PAGE_CODES를 찾지 못했습니다.' }
$pages = [regex]::Matches($pageMatch.Groups[1].Value, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$roles = @('MASTER','MANAGER','SALES','ACCOUNTANT','WAREHOUSE','INVENTORY','DISPATCH','DRIVER','STAFF','DEVELOPER','PARTNER')
$pageSql = ($pages | ForEach-Object { "'" + $_.Replace("'", "''") + "'" }) -join ','
$roleSql = ($roles | ForEach-Object { "'$_'" }) -join ','
$sql = "SELECT role_code, page_code, concat(can_view::int,can_create::int,can_update::int,can_delete::int,can_restore::int,can_download::int,can_print::int) FROM role_page_permission_templates WHERE is_deleted=false AND role_code IN ($roleSql) AND page_code IN ($pageSql) ORDER BY role_code, page_code;"
# 공유 auth_db의 적용 여부에 의존하지 않는다. 매번 일회성 PostgreSQL에 저장소의
# migration 전체를 Flyway로 적용한 뒤 그 결과만 SELECT한다. 이 컨테이너/네트워크는
# finally에서 제거되므로 운영 DB에는 쓰기가 발생하지 않는다.
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$network = "accounting-permission-refresh-$suffix"
$databaseContainer = "accounting-permission-refresh-db-$suffix"
$databaseReady = $false
try {
  & docker network create $network *> $null
  if ($LASTEXITCODE -ne 0) { throw '임시 Docker 네트워크 생성에 실패했습니다.' }

  & docker run --detach --name $databaseContainer --network $network `
    --env "POSTGRES_DB=$Database" --env "POSTGRES_USER=$User" --env "POSTGRES_PASSWORD=$Password" `
    $PostgresImage *> $null
  if ($LASTEXITCODE -ne 0) { throw '임시 PostgreSQL 컨테이너 생성에 실패했습니다.' }

  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    & docker exec $databaseContainer pg_isready -U $User -d $Database *> $null
    if ($LASTEXITCODE -eq 0) { $databaseReady = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $databaseReady) { throw '임시 PostgreSQL이 준비되지 않았습니다.' }

  $migrationLocation = '/flyway/sql/services/auth-service/src/main/resources/db/migration'
  & docker run --rm --network $network `
    --volume "${repoRoot}:/flyway/sql:ro" `
    $FlywayImage `
    "-url=jdbc:postgresql://$databaseContainer`:5432/$Database" `
    "-user=$User" "-password=$Password" `
    "-locations=filesystem:$migrationLocation" migrate
  if ($LASTEXITCODE -ne 0) { throw '전체 migration 적용에 실패했습니다. projection을 갱신하지 않습니다.' }

  $rows = @(docker run --rm --network $network --env "PGPASSWORD=$Password" $PostgresImage `
    psql -h $databaseContainer -U $User -d $Database -X -A -F '|' -t -c $sql)
  if ($LASTEXITCODE -ne 0 -or ($rows | Where-Object { $_ -match '\|' }).Count -eq 0) {
    throw 'DB 파생 스냅샷 갱신 중단: 전체 migration DB SELECT가 실패했거나 결과가 비었습니다. 기존 체크인 산출물로 조용히 대체하지 않습니다.'
  }
} finally {
  & docker rm --force $databaseContainer *> $null
  & docker network rm $network *> $null
}
$byRole = @{}
$seenCells = [System.Collections.Generic.HashSet[string]]::new()
foreach ($row in $rows) {
  if ($row -notmatch '\|') { continue }
  $parts = $row.Split('|')
  if ($parts.Count -ne 3 -or $parts[2] -notmatch '^[01]{7}$') {
    throw "DB 파생 스냅샷 갱신 중단: 잘못된 projection row '$row'"
  }
  $cell = "$($parts[0])|$($parts[1])"
  if (-not $seenCells.Add($cell)) {
    throw "DB 파생 스냅샷 갱신 중단: duplicate projection cell $cell first/second bits cannot be represented"
  }
  if (-not $byRole.ContainsKey($parts[0])) { $byRole[$parts[0]] = @{} }
  $byRole[$parts[0]][$parts[1]] = $parts[2]
}
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("import { PERMISSION_PAGE_CODES } from './accounting-slip-permission-snapshot'")
$lines.Add('')
$lines.Add('// auth_db role_page_permission_templates projection, derived from all Flyway migrations in this repository.')
$lines.Add('// Scope: PERMISSION_ROLES × PERMISSION_PAGE_CODES. Missing DB rows are 0000000.')
$lines.Add('const TEMPLATE_PERMISSION_DB_BITS_BY_ROLE: Record<string, Record<string, string>> = {')
foreach ($role in $roles) {
  $lines.Add("  '$role': {")
  foreach ($page in $pages) {
    $bits = if ($byRole[$role].ContainsKey($page)) { $byRole[$role][$page] } else { '0000000' }
    if ($bits -ne '0000000') { $lines.Add("    '$page': '$bits',") }
  }
  $lines.Add('  },')
}
$lines.Add('}')
$lines.Add('')
$lines.Add('// DynamicPermissionService bypasses role templates for MASTER: every known')
$lines.Add('// page code is exposed with all seven actions regardless of stored rows.')
$lines.Add('export const PERMISSION_DB_BITS_BY_ROLE: Record<string, Record<string, string>> = {')
$lines.Add('  ...TEMPLATE_PERMISSION_DB_BITS_BY_ROLE,')
$lines.Add("  MASTER: Object.fromEntries(PERMISSION_PAGE_CODES.map((pageCode) => [pageCode, '1111111'])),")
$lines.Add('}')
[IO.File]::WriteAllText($outputPath, ($lines -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
Write-Output "Wrote DB-derived projection: $outputPath"
Write-Output 'Next: run the contract test; any changed divergence set must update permission-mock-divergences.ts in the same change.'
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
