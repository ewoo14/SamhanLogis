param(
    [string]$PostgresImage = 'postgres:16-alpine'
)

$ErrorActionPreference = 'Stop'
$runId = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$containerName = "samhan-896-s2-fresh-pg-$runId"
$dbUser = 'probe_user'
$dbPassword = 'probe_password'
$probeDatabase = 'quantity_sync_probe'
$migrationDirectory = (Resolve-Path 'services/product-service/src/main/resources/db/migration').Path
$migrationFiles = Get-ChildItem $migrationDirectory -Filter 'V*.sql' | Sort-Object {
    [int]([regex]::Match($_.BaseName, '^V([0-9]+)').Groups[1].Value)
}
$started = $false

try {
    Write-Output "container=$containerName image=$PostgresImage"
    & docker run --detach --name $containerName `
        --env "POSTGRES_USER=$dbUser" `
        --env "POSTGRES_PASSWORD=$dbPassword" `
        --env 'POSTGRES_DB=postgres' `
        $PostgresImage
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL throwaway container start failed.' }
    $started = $true

    $ready = $false
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        & docker exec $containerName pg_isready -U $dbUser -d postgres | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'PostgreSQL throwaway container did not become ready within 60 seconds.' }

    & docker exec $containerName mkdir -p /migration-files
    if ($LASTEXITCODE -ne 0) { throw 'Migration directory creation failed.' }
    & docker cp "$migrationDirectory\." "${containerName}:/migration-files"
    if ($LASTEXITCODE -ne 0) { throw 'Migration docker cp failed.' }

    $envArgs = @('-e', "PGPASSWORD=$dbPassword", $containerName, 'psql', '-U', $dbUser,
        '-d', 'postgres', '-v', 'ON_ERROR_STOP=1')
    & docker exec @envArgs -c "DROP DATABASE IF EXISTS $probeDatabase"
    if ($LASTEXITCODE -ne 0) { throw 'Probe database DROP failed.' }
    & docker exec @envArgs -c "CREATE DATABASE $probeDatabase"
    if ($LASTEXITCODE -ne 0) { throw 'Probe database CREATE failed.' }

    Write-Output "migration_count=$($migrationFiles.Count)"
    foreach ($migration in $migrationFiles) {
        Write-Output "psql -v ON_ERROR_STOP=1 -f /migration-files/$($migration.Name)"
        & docker exec @envArgs -d $probeDatabase -f "/migration-files/$($migration.Name)"
        if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($migration.Name)" }
    }

    & docker exec @envArgs -d $probeDatabase -c @'
SELECT current_database() AS database,
       (SELECT count(*) FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('quantity_sync_rule', 'quantity_sync_source', 'quantity_sync_target'))
         AS quantity_sync_tables,
       to_regclass('public.quantity_sync_rule') AS v24_rule_table;
'@
    if ($LASTEXITCODE -ne 0) { throw 'Fresh PostgreSQL verification query failed.' }

    # 2026-07-28 범위 축소 확인 — S-1: products/product_estimate_exposure/bundle_component
    # 3개 기존 테이블 및 quantity_sync_rule/source/target 자신에도 constraint trigger가
    # 하나도 남지 않아야 한다. 함수 4개(quantity_sync_product_in_category/
    # quantity_sync_validate_condition/quantity_sync_validate_rule_graph/
    # quantity_sync_deferred_validate)도 함께 제거됐어야 한다.
    & docker exec @envArgs -d $probeDatabase -c @'
SELECT
    (SELECT count(*) FROM pg_trigger
      WHERE tgrelid IN ('products'::regclass, 'bundle_component'::regclass,
                         'product_estimate_exposure'::regclass,
                         'quantity_sync_rule'::regclass, 'quantity_sync_source'::regclass,
                         'quantity_sync_target'::regclass)
        AND NOT tgisinternal) AS quantity_sync_constraint_triggers_remaining,
    (SELECT count(*) FROM pg_proc WHERE proname IN
        ('quantity_sync_product_in_category', 'quantity_sync_validate_condition',
         'quantity_sync_validate_rule_graph', 'quantity_sync_deferred_validate'))
        AS quantity_sync_functions_remaining,
    (SELECT count(*) FROM pg_indexes WHERE tablename = 'quantity_sync_rule'
        AND indexname = 'ux_qsr_rule_key_active') AS quantity_sync_rule_index_present,
    (SELECT count(*) FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_qsr_rule_key_path_safe') AS rule_key_check_present;
'@
    if ($LASTEXITCODE -ne 0) { throw 'Scope-reduction verification query failed.' }
    Write-Output 'fresh-postgres-migration=PASS'
}
finally {
    if ($started) {
        & docker rm --force $containerName | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Output "removed=$containerName"
        }
    }
}
