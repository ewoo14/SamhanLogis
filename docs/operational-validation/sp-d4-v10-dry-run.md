# SP-D4 V10 Flyway Dry-Run 검증 절차

> 작성일: 2026-05-18
> 대상 migration: `V10__sp_d4_remaining_domains_page_permissions.sql`
> 적용 행: 22 PageCode × 7 ROLE = 154 row
> 실제 staging DB 변경 금지 — 이 문서는 dry-run 절차 가이드만 제공.

---

## §1 사전 조건

| 항목 | 확인 방법 |
|---|---|
| Docker Desktop 실행 중 | `docker ps` 출력에 `samhan-postgres` 포함 |
| infrastructure 스택 부팅 완료 | `.\infrastructure\scripts\start-local-full.ps1` 완료 |
| auth-service 빌드 환경 (JDK 17) | `java -version` → openjdk 17.x.x |
| V10 SQL 파일 존재 | `services\auth-service\src\main\resources\db\migration\V10__sp_d4_remaining_domains_page_permissions.sql` |

PowerShell 5.1 사전 조건 일괄 점검:

```powershell
# 1) Docker 실행 확인
docker ps --filter "name=samhan-postgres" --format "{{.Names}} {{.Status}}"

# 2) JDK 17 확인
java -version

# 3) V10 SQL 파일 존재 확인
if (Test-Path "services\auth-service\src\main\resources\db\migration\V10__sp_d4_remaining_domains_page_permissions.sql") {
    Write-Host "V10 파일 존재 확인"
} else {
    Write-Host "V10 파일 없음 — BE agent 작업 완료 후 진행"
}
```

---

## §2 Flyway 상태 확인 (Spring Boot Flyway 로그)

auth-service Flyway 마이그레이션 이력 + pending 목록 출력:

```powershell
# auth-service 는 Gradle Flyway plugin 이 아니라 Spring Boot 기동 시 Flyway 를 실행한다.
docker logs <auth-service-container> | Select-String -Pattern "flyway" -CaseSensitive:$false
```

```sql
SELECT version, description, success
FROM flyway_schema_history
ORDER BY installed_rank DESC
LIMIT 10;
```

기대 출력 (V10 pending 상태):

```
+-----------+---------+-----------------------------------------------------+------+---------------------+---------+
| Category  | Version | Description                                         | Type | Installed On        | State   |
+-----------+---------+-----------------------------------------------------+------+---------------------+---------+
| Versioned | 1       | init account                                        | SQL  | 2026-xx-xx          | Success |
| Versioned | 2       | add password policy                                 | SQL  | 2026-xx-xx          | Success |
| Versioned | 3       | add password reset tokens                           | SQL  | 2026-xx-xx          | Success |
| Versioned | 4       | add password change required                        | SQL  | 2026-xx-xx          | Success |
| Versioned | 5       | seed p0 5 test accounts                             | SQL  | 2026-xx-xx          | Success |
| Versioned | 6       | add department name                                 | SQL  | 2026-xx-xx          | Success |
| Versioned | 7       | add role page permissions                           | SQL  | 2026-xx-xx          | Success |
| Versioned | 8       | sp d2 accounting page permissions                   | SQL  | 2026-xx-xx          | Success |
| Versioned | 9       | sp d3 fix slip dispatch seed                        | SQL  | 2026-xx-xx          | Success |
| Versioned | 10      | sp d4 remaining domains page permissions            | SQL  | (없음)              | Pending |
+-----------+---------+-----------------------------------------------------+------+---------------------+---------+
```

V10 이 `Pending` 상태이면 정상. `Failed` 또는 순서 오류(Out of Order) 시 §5 참조.

---

## §3 Flyway Validate (실행 전 SQL 구문 검증)

실제 migrate 전에 SQL 파일의 체크섬 + 구문 정합을 확인:

```text
Gradle `Spring Boot Flyway 검증` task 는 현재 프로젝트에 없으므로 실행하지 않는다.
V10 SQL 파일 review + Spring Boot 기동 로그 + flyway_schema_history 조회로 검증한다.
```

validate 통과 기준:
- V1~V9 체크섬 변경 없음 (기존 파일 수정 금지)
- V10 파일 파싱 오류 없음
- `baseline-on-migrate: true` 설정으로 신규 DB 에서도 안전 동작

---

## §4 실행 후 Row Count 검증 SQL

auth-service 배포(또는 로컬 migrate 실행) 후 DB 에 직접 접속하여 154 row 삽입 여부 확인:

```sql
-- V10 seed row 삽입 확인 (154 기대)
SELECT COUNT(*)
FROM role_page_permissions
WHERE page_code IN (
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.history', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit', 'admin.employees', 'admin.users',
    'partners.list', 'partners.detail', 'partners.block', 'partners.edit-request',
    'products.list', 'products.admin', 'arologis.admin', 'arologis.region'
)
  AND is_deleted = FALSE;
-- 기대값: 154
```

PowerShell 5.1 에서 psql 직접 실행:

```powershell
$env:PGPASSWORD = "samhan_dev_pw"
psql -h localhost -p 5432 -U samhan -d auth_db -c `
    "SELECT COUNT(*) FROM role_page_permissions WHERE page_code IN (
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.history', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit', 'admin.employees', 'admin.users',
    'partners.list', 'partners.detail', 'partners.block', 'partners.edit-request',
    'products.list', 'products.admin', 'arologis.admin', 'arologis.region'
)
  AND is_deleted = FALSE;"
```

역할별 분포 검증 (22 row per ROLE × 7 ROLE):

```sql
-- 역할별 row 수 검증 (각 역할 22 기대)
SELECT role_code, COUNT(*) AS cnt
FROM role_page_permissions
WHERE page_code IN (
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.history', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit', 'admin.employees', 'admin.users',
    'partners.list', 'partners.detail', 'partners.block', 'partners.edit-request',
    'products.list', 'products.admin', 'arologis.admin', 'arologis.region'
)
  AND is_deleted = FALSE
GROUP BY role_code
ORDER BY role_code;
```

기대 결과:

```
 role_code  | cnt
------------+-----
 ACCOUNTANT |  22
 DISPATCH   |  22
 INVENTORY  |  22
 MANAGER    |  22
 MASTER     |  22
 SALES      |  22
 WAREHOUSE  |  22
(7 rows)
```

PageCode 분포 검증:

```sql
-- 22 PageCode 각각 7 row 검증
SELECT page_code, COUNT(*) AS cnt
FROM role_page_permissions
WHERE page_code IN (
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.history', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit', 'admin.employees', 'admin.users',
    'partners.list', 'partners.detail', 'partners.block', 'partners.edit-request',
    'products.list', 'products.admin', 'arologis.admin', 'arologis.region'
)
  AND is_deleted = FALSE
GROUP BY page_code
ORDER BY page_code;
-- 각 행 cnt = 7 기대
```

전체 role_page_permissions 누적 row 수 확인 (V7+V8+V9+V10):

```sql
SELECT COUNT(*) AS total_active
FROM role_page_permissions
WHERE is_deleted = FALSE;
-- V7: 84 row (12 page × 7), V8: 49 row (7 page × 7), V9: UPDATE 3 row
-- V10: +154 row → 누적 총 활성 284+ 기대 (V9 는 UPDATE 이므로 row 수 변경 없음)
-- 정확한 합산: 84 + 49 + 154 = 287 (기존 중복 없는 경우)
```

---

## §5 dry-run 실패 시 체크리스트

| 증상 | 원인 추정 | 조치 |
|---|---|---|
| `Pending` 아닌 `Failed` 상태 | V10 SQL 구문 오류 | `flywayRepair` 후 SQL 수정 재시도 |
| `Out of Order` 경고 | V10 보다 높은 버전 이미 적용 | 해당 없음 (현재 V9 가 최신) |
| row count 154 미달 | `ON CONFLICT DO NOTHING` 충돌 | `SELECT COUNT(*) WHERE page_code IN (...)` 로 충돌 row 확인 |
| psql 접속 실패 | Docker 미실행 | `docker start samhan-postgres` 후 재시도 |
| Gradle Flyway task 없음 | Spring Boot Flyway 방식 | Spring Boot Flyway 기동 로그와 `flyway_schema_history` 조회 결과 확인 |

---

## §6 참조

- `services/auth-service/src/main/resources/db/migration/V10__sp_d4_remaining_domains_page_permissions.sql`
- `services/auth-service/src/main/resources/application.yml` — `spring.flyway.locations: classpath:db/migration`
- `docs/operational-validation/sp-d4-v10-rollback.sql` — 실행 후 롤백 필요 시
- `docs/planning/2026-05-18_sp-d4-remaining-pages-permission-migration.md` §5
