# SP-D4 DevOps Cycle 1 리뷰 — claude-devops

> 작성일: 2026-05-18
> 검토자: DevOps (Claude)
> PR: #244 `feat/sp-d4-remaining-pages-permission-migration`
> HEAD: `6d141002`
> 자가 산출물 기준 (docs/operational-validation/sp-d4-*.md + ci.yml) — 객관 검토

---

## 종합 판정

**CONDITIONAL APPROVE (cycle 2 fix 필요)**

| 검토 항목 | 판정 | 요약 |
|---|---|---|
| V10 dry-run 가이드 — flywayInfo/flywayValidate 명령 | FAIL | Gradle Flyway 플러그인 미등록 → 명령 실행 불가 |
| V10 dry-run 가이드 — created_by 검증 쿼리 | FAIL | SQL `created_by = 'sp-d4-v10'` vs 실제 `'system'` 불일치 |
| V10 롤백 SQL — 22 PageCode Soft Delete 정책 | PASS | hard DELETE 0건, UPDATE is_deleted=TRUE 정책 준수 |
| V10 롤백 SQL — 22 PageCode 목록 정합 | PASS | PageCode enum 22개와 1:1 일치 |
| 배포 순서 — auth-service 선행 + 7 서비스 롤링 | PASS (조건부) | 순서 적절, docker compose 명령 유효성 주석 필요 |
| Grafana 알람 — metric 표현식 | FAIL | permission_guard_denied_total 메트릭 코드 미구현 |
| Grafana 알람 — 48h 임계 완화 적절성 | PASS | rate 0.5→5/s + for 2m→5m 완화 비율 합리적 |
| CI workflow — 8 서비스 matrix 포함 검증 | PASS (조건부) | 7 서비스 ci.yml 포함 확인, arologis-service 는 arologis-ci.yml 별도 트리거 |
| docker-compose 영향 — classpath Flyway | PASS | 인프라 docker-compose 변경 없음, Spring Boot 내장 Flyway 올바름 |
| PowerShell 5.1 호환성 | PASS | `&&` 미사용, `if ($?)` 패턴, `$env:VAR` 올바름 |
| CRLF/LF 경고 | PASS | 4개 파일 모두 LF-only 확인, gitattributes eol=lf 준수 |

**결함 수: 3건 (FAIL)**

---

## 결함 상세

### [DO-1] CRITICAL — flywayInfo/flywayValidate Gradle task 실행 불가

**위치**: `docs/operational-validation/sp-d4-v10-dry-run.md` §2, §3

**현상**: dry-run 가이드에서 다음 명령을 제시한다.

```powershell
.\gradlew :services:auth-service:flywayInfo
.\gradlew :services:auth-service:flywayValidate
```

**실제 상태**:

`services/auth-service/build.gradle` 에는 `org.flywaydb:flyway-core` 와 `org.flywaydb:flyway-database-postgresql` 가 `implementation` / `runtimeOnly` 의존성으로만 등록되어 있다. 전체 프로젝트(루트 및 서브모듈)에 `id 'org.flywaydb.flyway'` Gradle 플러그인이 등록되지 않았다. Flyway Gradle 플러그인이 없으면 `flywayInfo` / `flywayValidate` / `flywayMigrate` / `flywayRepair` Gradle task 자체가 존재하지 않는다.

**증거**:
- `build.gradle` plugins 블록: `org.springframework.boot`, `io.spring.dependency-management` 만 선언
- 루트 `build.gradle` 에도 Flyway 플러그인 없음
- `grep -rn "id 'org.flywaydb"` 결과 0건

**실제 Flyway 실행 경로**: `spring.flyway.enabled=true` + `locations: classpath:db/migration` 설정으로 Spring Boot 기동 시 자동 실행. Gradle task 경로는 존재하지 않는다.

**dry-run 가이드 §5 트러블슈팅** 에도 `flywayInfo 명령 없음` 케이스에 "build.gradle 에 `id 'org.flywaydb.flyway' version '9.22.3'` 확인" 이라고 기재했으나, 이는 해결책이 아닌 현 코드베이스에 실제로 누락된 상태이다.

**수정 방향 (2가지 중 택1)**:

옵션 A — 가이드를 실제 동작 경로로 교체 (권장: Gradle 플러그인 추가 없이 가이드만 수정):
```powershell
# flywayInfo 대신 — auth-service 기동 후 애플리케이션 로그로 확인
# Spring Boot 시작 시 Flyway가 자동으로 마이그레이션 이력을 로그에 출력:
# "Flyway Community Edition ... has successfully applied ... migrations to schema..."
docker compose -f infrastructure/docker-compose.yml logs auth-service | Select-String "Flyway"

# flywayValidate 대신 — 로컬 Docker DB 에 직접 접속하여 스키마 체크섬 확인
$env:PGPASSWORD = "<credential-from-env>"
psql -h localhost -p 5432 -U samhan -d auth_db `
    -c "SELECT version, description, type, installed_on, success FROM flyway_schema_history ORDER BY version;"
```

옵션 B — Flyway Gradle 플러그인 추가 (auth-service build.gradle 수정 필요):
```groovy
plugins {
    id 'org.springframework.boot'
    id 'io.spring.dependency-management'
    id 'org.flywaydb.flyway' version '9.22.3'
}
// flyway { ... } 설정 블록 추가 필요
```

DevOps 관점에서는 **옵션 A 권장** — build.gradle 변경은 BE 영역이고, Spring Boot 자동 실행이 이미 동작하므로 가이드 문서 수정만으로 해결 가능.

---

### [DO-2] HIGH — dry-run 검증 쿼리 created_by 불일치

**위치**: `docs/operational-validation/sp-d4-v10-dry-run.md` §4

**현상**: V10 seed row 삽입 확인 쿼리:

```sql
SELECT COUNT(*) FROM role_page_permissions
WHERE created_by = 'sp-d4-v10'
  AND is_deleted = FALSE;
-- 기대값: 154
```

**실제 V10 SQL** (`V10__sp_d4_remaining_domains_page_permissions.sql`):
```sql
('MASTER', 'estimates.list', TRUE, TRUE, NOW(), 'system', NOW(), 'system', FALSE),
```

모든 154 row의 `created_by` 값이 `'system'` 이다. `'sp-d4-v10'` 으로 필터링하면 결과 0이 반환되어 삽입 실패로 오판된다.

**V7/V8 패턴 비교**: V7 seed → `created_by = 'system'`, V8 seed → `created_by = 'system'`. 동일한 패턴. V10 가이드만 `'sp-d4-v10'` 으로 잘못 기재.

**영향**: 운영자가 dry-run 가이드를 그대로 실행하면 "154 row 미삽입" 으로 오판하여 불필요한 장애 대응 절차를 밟는다.

**수정**: 검증 쿼리를 `page_code IN (...)` 또는 V10 신규 코드 범위 필터로 교체:

```sql
-- V10 seed row 삽입 확인 (154 기대) — page_code 범위 기반
SELECT COUNT(*) FROM role_page_permissions
WHERE page_code IN (
    'estimates.list',
    'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.history',
    'sales.partner-order.print', 'sales.vendor-order',
    'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit',
    'admin.employees', 'admin.users',
    'partners.list', 'partners.detail', 'partners.block', 'partners.edit-request',
    'products.list', 'products.admin',
    'arologis.admin', 'arologis.region'
) AND is_deleted = FALSE;
-- 기대: 154
```

롤백 SQL의 검증 쿼리(`modified_by = 'sp-d4-v10-rollback'`)는 롤백 실행 후 UPDATE 로 설정되므로 정확하다. 영향 없음.

---

### [DO-3] HIGH — Grafana 알람 메트릭 permission_guard_denied_total 미구현

**위치**: `docs/operational-validation/sp-d4-grafana-alarm-relax.md` §2, §3

**현상**: 가이드에서 다음 메트릭을 기반으로 알람 임계를 정의한다:

```
permission_guard_denied_total{code=~"estimates.*|sales\\.partner-order.*|..."}
```

**실제 상태**: 전체 `services/` 디렉토리에서 `permission_guard_denied_total` 문자열이 0건. 어떤 PermissionGuard 구현체(EstimatePermissionGuard, PartnerOrderPermissionGuard, InventoryPermissionGuard 등 7개)에도 `MeterRegistry` 주입 또는 `Counter.builder(...)` 호출 코드가 없다.

**SP-D3 선행 Guard 확인**: `SlipSalesAccessGuard`, `SlipPurchaseAccessGuard` 에도 Prometheus Counter 등록 코드 없음. 즉, SP-D1~D3 전체 사이클에서 해당 메트릭이 구현된 적 없다.

**영향**: 알람 설정 가이드 전체가 동작하지 않는 메트릭 기반. Grafana UI 에서 alert rule 생성 시 `No data` 상태가 되어 알람 자체가 비활성화된다. 48h 모니터링 기간 중 실제 deny 급증을 감지할 방법이 없다.

**수정 방향 (2가지 중 택1)**:

옵션 A — 가이드를 현실 반영 수준으로 하향 (권장: SP-D4 scope 내 구현 없음 인정):
- 가이드를 "Prometheus Counter 미구현 — 로그 기반 모니터링" 으로 교체
- 대안: `docker compose logs -f` + grep `FORBIDDEN` / `403` 로그 모니터링 절차로 교체

옵션 B — PermissionGuard 7개에 Micrometer Counter 등록 추가 (BE 영역 협업 필요):
```java
// 각 Guard 에 MeterRegistry 주입 + deny 시 increment
Counter.builder("permission_guard_denied_total")
    .tag("code", PAGE_CODE)
    .tag("role", actorRole)
    .description("PermissionGuard deny count")
    .register(meterRegistry)
    .increment();
```

DevOps 관점에서는 **옵션 B 강력 권장** — 알람 가이드 작성 의도가 실제 운영 모니터링이므로 구현이 맞다. 단, BE agent 협업이 필요하므로 cycle 2 이전 BE에 결함 공유 필요. SP-D5 scope 으로 이연도 가능하나, 배포 직후 모니터링 공백이 발생한다.

---

## PASS 항목 상세

### V10 롤백 SQL

- Soft Delete only 정책 100% 준수: `UPDATE ... SET is_deleted=TRUE, deleted_at=NOW(), deleted_by='sp-d4-v10-rollback'`. `DELETE FROM` 구문 0건.
- 22 PageCode IN 절과 `PageCode.java` enum 22개 1:1 대응 확인 완료.
- `BEGIN / COMMIT` 트랜잭션 감싸기 정상.
- 롤백 후 검증 쿼리 3종 주석으로 제공: 활성 row 0건 / soft-deleted row 154건 / V7/V8 기존 권한 133건 이상.

### 배포 순서 문서

- auth-service 선행 원칙 명시 (V10 Flyway 자동 실행 후 도메인 서비스 배포) 적절.
- slip-service → partner-order → inventory → user → partner → product → arologis 순서: 데이터 의존성 관점에서 합리적.
- 각 서비스 배포 후 `Start-Sleep -Seconds 60` + actuator/health 확인 패턴 준수.
- PowerShell 5.1 문법: `foreach ($svc in $services)` / `$svc.port` / `try { } catch { }` — 호환 정상.

### CI workflow 영향 분석

ci.yml 검증 결과:

| 서비스 | CI matrix group | 포함 여부 |
|---|---|---|
| auth-service (V10 Flyway) | shared+auth+gateway | PASS |
| slip-service (EstimateController) | slip-units + slip-it-* | PASS |
| partner-order-service | accounting+partner | PASS |
| inventory-service | user+product+inventory+logging | PASS |
| user-service | user+product+inventory+logging | PASS |
| partner-service | accounting+partner | PASS |
| product-service | user+product+inventory+logging | PASS |
| arologis-service | arologis-ci.yml 별도 (paths 필터) | PASS |

**추가 관찰**: SP-D4 PR 변경 파일에 `services/arologis-service/**` 가 포함되어 있으므로 `arologis-ci.yml` 도 함께 트리거된다. ci.yml은 `paths-ignore` 방식이므로 비-arologis 파일이 함께 변경되면 정상 트리거된다. 양쪽 workflow 모두 트리거되어 arologis-service BE 테스트가 중복 실행되지 않는다 (ci.yml 은 arologis-service test를 제외, arologis-ci.yml 만 실행).

**CI workflow 변경 불필요 판정 정확**: PR 문서의 "8 서비스 기존 matrix 포함 확인 (수정 불필요)" 결론은 올바르다.

### docker-compose 영향

현재 `infrastructure/docker-compose.yml` 에는 Spring Boot 서비스(auth-service 등) 컨테이너 정의가 없다. 인프라 서비스(PostgreSQL/Redis/RabbitMQ/ES/MinIO/Prometheus/Grafana/Nginx) 만 정의되어 있다. V10 Flyway는 Spring Boot 내장 방식(`spring.flyway.enabled=true`, `locations: classpath:db/migration`)으로 실행되므로 docker-compose.yml 변경이 필요 없다. 이 판단은 정확하다.

**Phase 11 AWS 배포 맥락**: `sp-d4-deploy-rolling-order.md` 에서 `docker compose -f infrastructure/docker-compose.yml up -d auth-service` 명령을 사용하는데, 현재 infrastructure/docker-compose.yml에 auth-service 서비스 정의가 없다. Phase 11 AWS 환경에서는 14 service docker-compose 파일이 별도로 존재할 것이므로 이 명령은 Phase 11 전용 compose 파일을 가정한 것으로 보인다. 문서에 해당 주석이 없는 점은 개선 여지가 있으나 결함 수준은 아니다.

### PowerShell 5.1 호환성

4개 파일 전수 확인 결과:
- `&&` 연산자 0건 (파이프라인 연산자 미사용)
- `if ($?) { }` 패턴 올바르게 사용
- `$env:PGPASSWORD` 환경변수 설정 올바름
- 백틱(`` ` ``) 줄 연속 사용 (psql 멀티라인 명령 분리)
- `foreach ($svc in $services)` / `try { } catch { }` 구문 5.1 호환
- `??` / `?.` / `?:` 연산자 0건

### CRLF/LF 경고

커밋 `6d141002` 산출물 4개 파일 바이너리 검사 결과:

| 파일 | CRLF | LF-only |
|---|---|---|
| sp-d4-v10-dry-run.md | 0 | 186 |
| sp-d4-v10-rollback.sql | 0 | 124 |
| sp-d4-deploy-rolling-order.md | 0 | 216 |
| sp-d4-grafana-alarm-relax.md | 0 | 154 |

`.gitattributes` `* text=auto eol=lf` 정책 준수. V10 SQL 파일도 LF-only(282줄) 확인. CRLF 경고 없음.

---

## V10 SQL 부분 유니크 인덱스 정합성 확인

V10 `ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING` 구문은 V7 에서 생성된 `uq_role_page_permissions_active` 부분 유니크 인덱스를 참조한다.

```sql
-- V7 인덱스 정의 (확인됨)
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_page_permissions_active
    ON role_page_permissions (role_code, page_code)
    WHERE is_deleted = FALSE;
```

PostgreSQL에서 부분 인덱스 기반 `ON CONFLICT` 는 `WHERE` 절이 인덱스 predicate과 정확히 일치해야 한다. V10 SQL의 충돌 조건 `WHERE is_deleted = FALSE` 가 V7 인덱스 predicate와 동일하므로 구문 정합성 이상 없다. id 컬럼 생략 INSERT는 `DEFAULT gen_random_uuid()` 로 자동 처리되어 V7 DDL과 호환된다.

---

## 누적 row 수 합산 검증

| 마이그레이션 | 신규 row | 비고 |
|---|---|---|
| V7 | 84 | 12 PageCode × 7 ROLE |
| V8 | 49 | 7 PageCode × 7 ROLE |
| V9 | 0 (UPDATE only) | 기존 row 수정 |
| V10 | 154 | 22 PageCode × 7 ROLE |
| **합계** | **287** | |

dry-run 가이드 §4 합산 287 기재 정확.

---

## cycle 2 fix 요청 사항

| 우선순위 | 결함 ID | 내용 | 담당 |
|---|---|---|---|
| 1 | DO-1 | sp-d4-v10-dry-run.md — flywayInfo/flywayValidate 명령을 실제 동작 경로(로그 확인 + flyway_schema_history 쿼리)로 교체 | DevOps |
| 2 | DO-2 | sp-d4-v10-dry-run.md §4 — created_by = 'sp-d4-v10' → page_code IN (...) 기반 쿼리로 교체 | DevOps |
| 3 | DO-3 | permission_guard_denied_total 메트릭 구현 또는 가이드를 로그 기반 모니터링으로 교체 | DevOps + BE 협업 |
