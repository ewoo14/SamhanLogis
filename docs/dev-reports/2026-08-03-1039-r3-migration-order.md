# #1039 R3 — Flyway migration order fix

## 결론

V62가 V100이 이미 적용된 배포 DB에서 `outOfOrder=false` 기본 정책에 걸려 기동을 막는 결함을 수정했다.

- 기존 `V62__preserve_source_warehouse_code.sql` 제거
- 동일 DDL을 `V101__preserve_source_warehouse_code.sql`로 신규 추가
- `V60`, `V61`, `V100`은 파일과 내용 모두 수정하지 않음
- `outOfOrder=true`를 활성화하지 않음
- 동일 DDL이 같은 DB에 두 번 적용되지 않음: V62는 실제 적용 이력이 없고, V101만 신규 migration으로 존재

## 원인 조사

공유 `slip_db`에는 read-only 조회만 실행했다.

```text
docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT version, description, installed_on FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 8;"
```

출력 원문:

```text
100|normalize quote snapshot json owner totals|2026-08-02 00:29:55.593349
61|correct partner order vat overcharge|2026-08-01 11:45:52.505082
60|preserve sales category axis|2026-07-31 23:35:23.063578
59|add slip line unit price domain|2026-07-27 07:42:29.305085
58|create partner product price memory|2026-07-15 20:09:56.134411
57|estimate deleted by name|2026-07-11 15:11:57.865976
56|slip deleted by name|2026-07-07 12:01:58.158076
55|dispatch deleted by name|2026-07-02 21:36:09.659286
```

설정 원문은 `services/slip-service/src/main/resources/application.yml:41-44`이며 `out-of-order` 설정이 없다. 따라서 기본 `false` 상태에서 V62 pending이 V100 이후 DB를 막는다.

## RED-first

### 1. 실제 V100 선적용 DB 재현

공유 DB가 아닌 throwaway DB `slip_migration_r3_probe_20260803`을 생성했다.

```text
docker exec samhan-postgres psql -U samhan -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS slip_migration_r3_probe_20260803;" -c "CREATE DATABASE slip_migration_r3_probe_20260803 OWNER samhan;"
```

출력 원문:

```text
DROP DATABASE
CREATE DATABASE
NOTICE:  database "slip_migration_r3_probe_20260803" does not exist, skipping
```

V1~V61 적용 원문 마지막:

```text
Successfully applied 61 migrations to schema "public", now at version v61 (execution time 00:00.591s)
```

그 후 V100 SQL을 throwaway DB에 적용하고, 공유 DB에서 read-only로 확인한 V100 checksum `1566834913`을 사용해 해당 DB의 Flyway history에 V100 선적용 상태를 재현했다. 이후 기본 설정으로 전체 migration을 실행했다.

```text
docker run --rm --network container:samhan-postgres -v "C:/dev/Samhan-Public/.claude/worktrees/t1039/services/slip-service/src/main/resources/db/migration:/flyway/sql:ro" flyway/flyway:10 -url=jdbc:postgresql://localhost:5432/slip_migration_r3_probe_20260803 -user=samhan -password=samhan_dev_pw -locations=filesystem:/flyway/sql migrate
```

실패 원문:

```text
ERROR: Validate failed: Migrations have failed validation
Detected resolved migration not applied to database: 62.
To ignore this migration, set -ignoreMigrationPatterns='*:ignored'. To allow executing this migration, set -outOfOrder=true.
```

### 2. RED 테스트

추가한 `FlywayMigrationOrderTest.sourceWarehouseCodeMigration_isAfterV100`를 V62 상태에서 실행했다.

```text
:services:slip-service:test --tests "com.samhanair.logis.slip.config.FlywayMigrationOrderTest" --no-daemon
```

출력 원문:

```text
FlywayMigrationOrderTest > sourceWarehouseCodeMigration_isAfterV100() FAILED
    java.lang.AssertionError at FlywayMigrationOrderTest.java:29
1 test completed, 1 failed
BUILD FAILED
```

이 테스트는 source warehouse migration 버전이 V100보다 높고 V62 파일이 없어야 한다는 배포 순서 계약을 검증한다.

## 수정 후 GREEN 및 throwaway 검증

### 1. migration-order 회귀 테스트

```text
:services:slip-service:test --tests "com.samhanair.logis.slip.config.FlywayMigrationOrderTest" --no-daemon

BUILD SUCCESSFUL in 12s
18 actionable tasks: 2 executed, 16 up-to-date
```

### 2. V100 적용 DB에서 기동 경로

동일한 `slip_migration_r3_probe_20260803`에서 소스 directory가 V101로 바뀐 뒤, 아래 기본 Flyway migrate를 다시 실행했다.

```text
docker run --rm --network container:samhan-postgres -v "C:/dev/Samhan-Public/.claude/worktrees/t1039/services/slip-service/src/main/resources/db/migration:/flyway/sql:ro" flyway/flyway:10 -url=jdbc:postgresql://localhost:5432/slip_migration_r3_probe_20260803 -user=samhan -password=samhan_dev_pw -locations=filesystem:/flyway/sql migrate
```

출력 원문:

```text
Successfully validated 63 migrations (execution time 00:00.167s)
Current version of schema "public": 100
Migrating schema "public" to version "101 - preserve source warehouse code"
Successfully applied 1 migration to schema "public", now at version v101 (execution time 00:00.006s)
```

### 3. 빈 DB(CI/신규 환경) 경로

throwaway DB `slip_migration_r3_empty_20260803`를 별도 생성하고 아래 전체 migration을 실행했다.

```text
docker run --rm --network container:samhan-postgres -v "C:/dev/Samhan-Public/.claude/worktrees/t1039/services/slip-service/src/main/resources/db/migration:/flyway/sql:ro" flyway/flyway:10 -url=jdbc:postgresql://localhost:5432/slip_migration_r3_empty_20260803 -user=samhan -password=samhan_dev_pw -locations=filesystem:/flyway/sql migrate
```

출력 원문:

```text
Successfully validated 63 migrations (execution time 00:00.179s)
...
Migrating schema "public" to version "61 - correct partner order vat overcharge"
Migrating schema "public" to version "100 - normalize quote snapshot json owner totals"
Migrating schema "public" to version "101 - preserve source warehouse code"
Successfully applied 63 migrations to schema "public", now at version v101 (execution time 00:00.610s)
```

두 probe DB에서 history를 확인한 원문:

```text
100|normalize quote snapshot json owner totals|t
101|preserve source warehouse code|t
100|normalize quote snapshot json owner totals|t
101|preserve source warehouse code|t
```

검증 완료 후 두 throwaway DB를 삭제했다.

```text
docker exec samhan-postgres psql -U samhan -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS slip_migration_r3_probe_20260803;" -c "DROP DATABASE IF EXISTS slip_migration_r3_empty_20260803;"
```

출력 원문:

```text
DROP DATABASE
DROP DATABASE
```

삭제 후 동일 이름 조회 결과는 빈 출력이었다. 공유 `slip_db`와 `inventory_db`에는 write/DDL을 실행하지 않았다.

## 검증 범위

```text
git diff --check
PASS

:services:slip-service:test --tests "com.samhanair.logis.slip.config.FlywayMigrationOrderTest" --no-daemon
BUILD SUCCESSFUL
```

전체 slip-service suite, Docker image rebuild, git commit/push/checkout/branch/stash/reset은 실행하지 않았다.

## 신규 파일

- `services/slip-service/src/main/resources/db/migration/V101__preserve_source_warehouse_code.sql`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/config/FlywayMigrationOrderTest.java`
- `docs/dev-reports/2026-08-03-1039-r3-migration-order.md`

삭제 파일:

- `services/slip-service/src/main/resources/db/migration/V62__preserve_source_warehouse_code.sql` (미적용 pending migration의 순서 충돌 제거)
