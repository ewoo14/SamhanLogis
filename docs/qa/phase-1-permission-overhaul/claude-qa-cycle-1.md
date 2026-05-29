# QA 리뷰 — PR #316 Phase 1 권한 재편 (계정×page×7action) — Claude QA Cycle 1

> 리뷰어: Claude QA agent
> 일자: 2026-05-29
> 브랜치: `feat/phase-1-permission-overhaul-framework`
> 대상: 데이터 모델 전환(V39) + `@RequirePermission` 7-action + `PermissionAspect`(MASTER bypass/PARTNER deny) + `DynamicPermissionClient` 7-action + 14 service 재주석화 + MASTER 매트릭스 UI

## 0. QA 종합 판정: **FAIL (BLOCK 머지)**

- **Docker 실검증 시도 = 시도했으나 환경 한계로 로컬 IT 실행 불가** → CI fetch 로 대체 ([[qa-docker-real-test]] P2 fallback 발동).
- **PR #316 CI = RED**. backend `빌드 + 테스트` 7개 job 전부 FAILURE. 핵심 `shared+auth+gateway` job 에서 **12 test 실패** (160 completed, 12 failed).
- 그 중 **V39 핵심 IT 3종 + `V39GuardGatedPageIT` 가 모두 Spring context 로드 실패로 실행조차 못 됨** → 본 PR 의 행동보존/PARTNER 제외/guard 확대 0 의 **검증 근거가 0** 이다. dev-report 의 "Linux CI 에서 확정" 약속이 미달성.
- 별도로 `AuthPermissionMigrationIT` 8건이 **MASTER bypass 설계와 모순되는 stale assertion** 으로 실 회귀 실패.

코드 read 만으로는 프레임워크 구조(7-action enum / aspect / client / service / 도메인 IT 시나리오)는 견고하나, **실 테스트가 green 이 아니므로 PASS 선언 불가**.

---

## 1. Docker 가용성 + 실행한 IT 결과 요약

### 1-1. Docker 환경
- `docker ps` = Docker Desktop 29.5.2 정상. `samhan-postgres`(5432, healthy) 포함 18개 컨테이너 37시간 가동 중.
- **그러나 호스트 메모리 고갈**: 16 GB 중 free **1.13 GB** (18 컨테이너 + 5 java 프로세스 점유). gradle daemon stop 후에도 2.04 GB.

### 1-2. 로컬 Testcontainers IT 실행 시도 (3회, 모두 실패)
```
$env:GRADLE_USER_HOME='...\.gradle\codex-home'
.\gradlew.bat :services:auth-service:test --tests "*V39*IT" --no-daemon [--max-workers=1]
```
- 결과: `org.gradle.process.internal.ExecException: Unable to connect to the child process 'Gradle Test Executor N'. ... This exception might occur when the build machine is extremely loaded. The connection attempt hit a timeout after 120.0 seconds`.
- Gradle Test Executor fork 가 메모리 부족으로 반복 crash → 테스트 1건도 실행 못 함.
- 이는 [[testcontainers-windows-docker]] / dev-report §6 의 알려진 Windows 로컬 hang 패턴. **환경 한계 (P2)**.
- 로그: `docs/qa/phase-1-permission-overhaul/v39-it-run3.log`, `ci-shared-auth-failed.log`.

### 1-3. CI fetch 결과 (`gh pr checks 316`, `gh run view --job ... --log-failed`)
PR #316 statusCheckRollup (run 26567636004, 2026-05-28 09:5x):

| Job | 결과 |
|---|---|
| 빌드 + 테스트 (shared+auth+gateway) | **FAILURE** (V39 IT + AuthPermissionMigrationIT) |
| 빌드 + 테스트 (user+product+inventory+logging) | **FAILURE** |
| 빌드 + 테스트 (accounting+partner) | **FAILURE** |
| 빌드 + 테스트 (slip-it-core) | **FAILURE** |
| 빌드 + 테스트 (slip-it-public) | **FAILURE** |
| 빌드 + 테스트 (phase9-10 groupware+notification+dashboard) | **FAILURE** |
| 백엔드 빌드 + 테스트 (arologis-service) | **FAILURE** |
| JUnit 테스트 결과 (*전 backend 분할*) | **FAILURE** (위 job 들의 결과 리포트) |
| 빌드+테스트 (slip-units) | pass |
| Frontend Desktop/DS/Mobile, Playwright, Detox, GitGuardian, Notion/Credential Guard | pass |

→ **backend 전 영역 RED**. FE/E2E/guard 만 green.

---

## 2. P0 / P1 결함

### 🔴 P0-1 — V39 핵심 IT 3종 + GuardGated IT 가 `local` 프로파일 활성화로 context 로드 실패 (검증 근거 0)

**위치**: `services/auth-service/src/test/.../it/V39MigrationParityIT.java:15`, `V39PartnerExclusionIT.java:15`, `V39GuardGatedPageIT.java:15`
```java
@SpringBootTest(classes = AuthServiceApplication.class)
@TestPropertySource(properties = "spring.profiles.active=local")   // ← 원인
class V39MigrationParityIT extends AbstractPostgresIT { ... }
```

**근본 원인**: `application.yml` 의 `local` 프로파일(lines 70-93)이 datasource 를 **H2 in-memory + Flyway DISABLED** 로 재정의한다:
```yaml
---
spring:
  config: { activate: { on-profile: local } }
  datasource:
    url: jdbc:h2:mem:auth_db;MODE=PostgreSQL;DB_CLOSE_DELAY=-1
    driver-class-name: org.h2.Driver
  flyway: { enabled: false }       # ← V39 가 절대 실행 안 됨
```
- `AbstractPostgresIT` 의 `@DynamicPropertySource` 가 Testcontainers postgres URL + `spring.flyway.enabled=true` 를 등록하지만, `local` 프로파일의 정적 datasource 블록과 충돌 → CI 에서 `java.lang.RuntimeException at DriverDataSource.java:109` (BeanCreationException) 으로 context 로드 실패.
- **설령 로드되어도 `flyway.enabled=false` 라 `role_page_permission_templates` / `account_page_permissions` 테이블이 생성되지 않으므로 V39 분해/보존/PARTNER 제외를 검증할 수 없다.**

**실증 증거** (CI `shared+auth+gateway` job 78266286381 log):
```
V39MigrationParityIT > VIEW/EDIT 는 VIEW 및 CREATE/UPDATE/DELETE 로 분해된다 FAILED
    java.lang.IllegalStateException at DefaultCacheAwareContextLoaderDelegate.java:145
V39MigrationParityIT > RESTORE/DOWNLOAD/PRINT 보존 매핑이 템플릿에 반영된다 FAILED
V39PartnerExclusionIT > PARTNER role 계정에는 account_page_permissions 행을 만들지 않는다 FAILED
V39GuardGatedPageIT > estimates.list 는 기존 V10 VIEW/EDIT 효과 이상으로 확대되지 않는다 FAILED
V39GuardGatedPageIT > products/sales.partner-order 전용 view page 는 mutation 으로 확대되지 않는다 FAILED
    java.lang.IllegalStateException at DefaultCacheAwareContextLoaderDelegate.java:180
      Caused by: org.springframework.beans.factory.BeanCreationException
        Caused by: java.lang.RuntimeException at DriverDataSource.java:109
160 tests completed, 12 failed
```
- 대조군: **같은 job 의 `AuthFlywayV29SeedIT` / `AuthFlywayV38SeedIT` 는 PASS**. 이 둘은 `local` 프로파일을 **활성화하지 않는다**(동일 `AbstractPostgresIT` 사용) → Testcontainers postgres + Flyway 정상. 즉 차이는 오직 `@TestPropertySource(... profiles.active=local)` 추가 여부.

**영향**: 본 PR 의 **가장 중요한 검증**(D-PO-03 행동보존, §6-3 PARTNER 0건/guard 확대 0)이 단 한 번도 실제 DB 에 대해 통과한 적이 없다. dev-report §6 의 "V39 IT … Linux CI 에서 확정" 은 **거짓 green** 상태.

**권고 fix**: V39 IT 3종 + GuardGated IT 의 `@TestPropertySource(properties = "spring.profiles.active=local")` 제거. (V29/V38 IT 처럼 `AbstractPostgresIT` 의 Testcontainers + Flyway 만 쓰도록.) 제거 후 Testcontainers postgres 에서 V39 가 실행되어 `role_page_permission_templates` 조회 assertion 이 의미를 가진다.

---

### 🔴 P0-2 — `AuthPermissionMigrationIT` 8건이 신규 MASTER bypass 설계와 모순 (실 회귀 실패)

**위치**: `services/auth-service/src/test/.../it/AuthPermissionMigrationIT.java:96-131, 154-175`

**원인**: 이 IT 는 레거시 2-action stub(`dynamicPermissionClient.canView/canEdit(roleCode,page)`, line 83-84, 119-123)을 쓰고 **"MASTER 라도 매트릭스 권한이 없으면 403"** 을 기대한다(line 128). 그러나 신규 `PermissionAspect.checkPermission` (shared/security, line 107-110)은
```java
if ("MASTER".equalsIgnoreCase(roleCode)) { return joinPoint.proceed(); }  // D-PO-05 short-circuit
```
로 **client 호출 전에 MASTER 를 무조건 통과**시킨다. 따라서 `canView/canEdit=false` stub 은 더 이상 소비되지 않아 MASTER 요청이 200/204 로 통과한다.

**실증 증거** (동 job log):
```
AuthPermissionMigrationIT > ... 매트릭스 권한이 없으면 403 + Counter 증가 > POST /auth/register FAILED
    java.lang.AssertionError at AuthPermissionMigrationIT.java:128
AuthPermissionMigrationIT.java:128 | java.lang.AssertionError: Status expected:<403> but was:<200>
AuthPermissionMigrationIT.java:128 | java.lang.AssertionError: Status expected:<403> but was:<204>
AuthPermissionMigrationIT > POST /auth/register 는 VIEW 만 있고 EDIT 이 없으면 403 FAILED
    java.lang.AssertionError at AuthPermissionMigrationIT.java:172
```
(POST register / PATCH unlock / GET·PUT·DELETE permissions / POST batch + register VIEW-only = 8건)

**영향**: 테스트 코드가 신규 D-PO-05 설계를 따라가지 못한 **stale test**. 단순 회귀가 아니라 "MASTER 도 매트릭스 grant 필요" 라는 **폐기된 정책**을 강제하고 있어 CI 를 막는다. 또한 이 IT 는 `system.*` endpoint 가 `@PreAuthorize("hasRole('MASTER')")` 정적 가드 + `@RequirePermission` 동적 가드 이중 적용임을 가정하는데, 동적 가드가 MASTER 를 bypass 하므로 "MASTER 매트릭스 deny → 403" 시나리오 자체가 신규 설계에서 성립 불가.

**권고 fix**: `AuthPermissionMigrationIT` 의 MASTER-without-grant→403 케이스(`systemEndpoint_masterWithoutMatrixGrant_returns403AndIncrementsCounter`, `register_withViewOnlyMatrixGrant_returns403...`)를 신규 설계에 맞게 재작성 — MASTER 는 bypass(200/204) 검증으로 전환하고, deny 검증은 비-MASTER(예: MANAGER) account 의 `check(accountId, page, action)=false` 로 옮긴다. 레거시 `canView/canEdit` stub → 7-action `check(UUID, page, PermissionAction)` stub 으로 교체.

---

### 🟠 P1-1 — backend 6개 추가 job FAILURE 의 원인 미확인 (전수 fetch 필요)

**위치**: `user+product+inventory+logging`, `accounting+partner`, `slip-it-core`, `slip-it-public`, `phase9-10`, `arologis-service` 6 job 전부 FAILURE.

**현황**: 본 cycle 에서는 `shared+auth+gateway` 만 `--log-failed` fetch 완료(P0-1/P0-2 확정). 나머지 6 job 은 미열람. 도메인 권한 IT(`InventoryPermissionControllerIT`, `EstimatePermissionIT` 등)는 코드 read 상 7-action allow/deny + metric 증가를 올바르게 검증하나(아래 §3), 컴파일/context 단계에서 동일 계열 실패(예: `local` 프로파일 오염, MockBean 누락, 또는 재주석화 page/action 불일치) 가능성. **머지 전 6 job 전수 fetch + 분류 의무.**

**권고**: 각 job `gh run view --job <id> --log-failed` 로 실패 유형(컴파일 vs assertion vs context) 분류 후 cycle 1 fix 에 포함.

---

## 3. 코드 read 검증 (PASS 측면 — 구조는 견고)

설계/구현 자체는 spec D-PO-01~09 과 정합하며, 실 IT 가 green 이면 통과할 구조이다:

- **`PermissionAction`**(shared/security): 7값 enum + `from/fromOrNull/column()`(`can_*`). 정상.
- **`PermissionAspect`**: `X-User-Id`(account UUID) 헤더 → `client.check(accountId, page, action)`. MASTER bypass(line 108) / PARTNER deny(line 112) / accountId null → deny(line 117, 현행 skip→deny 안전강화) / client bean 없으면 skip(line 121-126, consumer 호환). 설계 일치.
- **`DefaultDynamicPermissionClient.check(UUID,page,action)`**: `/auth/internal/permissions/check?accountId&pageCode&action` 호출, `data.allowed` 파싱, 4xx/예외 → false fallback. `bulkLoad` → `/auth/internal/permissions/account/{id}` map. 정상.
- **`PermissionInternalController`**: `/check` + `/account/{accountId}` 둘 다 `@PreAuthorize("hasRole('INTERNAL')")`. 정상.
- **`PermissionAdminController.getMyPermissions` (`/my`)**: `isAuthenticated()`, MASTER → 전 PageCode 7-action all-true(`allPageActions()`), PARTNER → empty, X-User-Id 누락/parse 실패 → empty(fail-closed). spec D-PO-08 일치.
- **`AccountPermissionService`**: `check`(account row `.allows(action)`, 없으면 false) / `bulkLoad` / matrix / applyTemplate / copyFromAccount / bulkApply. 정상.
- **V39 SQL 분해 규칙 (논리 검증)**: 기존 seed 와 cross-check 결과 IT assertion 이 논리적으로 정확:
  - V8: `MANAGER/accounting.journals`=(VIEW=T,EDIT=F) → can_create=F ✓ ; `ACCOUNTANT/accounting.journals`=(T,T) → can_create=T ✓
  - V10: `SALES/estimates.list`=(T,T)→can_create=T ✓ ; `WAREHOUSE/estimates.list`=(F,F)→can_view=F ✓ ; `ACCOUNTANT/estimates.list`=(T,F)→can_create=F ✓
  - V10: `WAREHOUSE/sales.partner-order.print` 존재 → PRINT 보존 매핑 유효 ✓
  - V39 step3 `NOT IN ('MASTER','PARTNER')` + `ON CONFLICT DO NOTHING` + RESTORE/DOWNLOAD/PRINT 는 명시 (role×page) `VALUES` IN-list 만 UPDATE (force-FALSE 덮어쓰기 없음) → narrowing/widening 회피 설계 정합.
- **도메인 IT 시나리오 (read)**: `InventoryPermissionControllerIT` 는 page×action 별 allow(not 403) + deny(403 + `deniedCount == before+1`) 쌍을 parameterized 로 검증(warehouse RESTORE 포함). `EstimatePermissionIT` 는 guard 가 role→account `check(ACCOUNT_ID, "estimates.list", VIEW/CREATE)` 로 전환됨을 C1~C4 로 검증. **단 실행 결과는 미확인(P1-1).**

> 즉 **설계 결함이 아니라 테스트 하네스 결함(P0-1 local 프로파일, P0-2 stale assertion)** 이 핵심. fix 난이도 낮음(테스트 어노테이션/stub 정정), 단 머지 전 필수.

---

## 4. P2 / Minor

- **P2-1 (환경)**: 로컬 Windows 호스트 메모리 고갈로 Testcontainers IT 직접 실행 불가. [[testcontainers-windows-docker]] 한계. CI fetch 로 대체했으나, CI 가 red 라 "실 green 증거" 는 fix 후 재실행 필요.
- **Minor-1**: `AuthPermissionMigrationIT` 클래스명이 "Migration" 이나 실제로는 system.* endpoint 이중 가드 IT (V39 migration 과 무관). P0-2 재작성 시 클래스 책임/명칭 재정렬 권고.
- **Minor-2**: dev-report §6 표가 V39 IT 를 "Linux CI 에서 확정" 으로 기재했으나 실제 CI 는 fail. fix 후 표 갱신 + 실 green run URL 첨부 필요([[continuous-docs-sync]]).

---

## 5. 권고 (cycle 1 fix 범위)

1. **P0-1**: V39 IT 3종 + `V39GuardGatedPageIT` 에서 `@TestPropertySource(properties="spring.profiles.active=local")` 제거 → Testcontainers + Flyway 로 실행.
2. **P0-2**: `AuthPermissionMigrationIT` 의 MASTER-deny 케이스 8건을 MASTER-bypass(통과) + 비-MASTER account deny 로 재작성, 7-action `check(UUID,page,action)` stub 으로 교체.
3. **P1-1**: 나머지 6 backend job `--log-failed` 전수 fetch → 분류 후 일괄 fix.
4. 재실행하여 backend 7 job 전부 green 확인 후에만 머지 진행([[dual-5agent-review]] "CI green 전 PM 리뷰 금지").
