# PR #417 DevOps 리뷰 — Claude DevOps 사이클 2

**PR**: [FIX] 권한그룹 C5 후속 정리 — ROLE_ dead-code 제거 + FE 사이드바/가드 권한 전환 + 보류 3 라우트 PermissionGuard 화
**브랜치**: fix/permission-groups-c5-followup-cleanup
**리뷰어**: Claude DevOps agent
**날짜**: 2026-06-07
**검토 범위**: `git diff 8c3ff6e4...e96861c4` (사이클 1 Codex fix 커밋 `e96861c4` 단일)

---

## 1. 사이클 1 DO-1 해소 확인

### DO-1 원래 지적 (Codex DevOps 사이클 1)

> `3374a0c9` 가 기적용 V47 을 변경했다. 구 V47 적용 DB 에서 Flyway checksum mismatch 발생. `repair` 만으로는 DEF-1 backfill SQL 이 미실행된다. PM 판단: V48 분리 불채택. 운영 노트 보강으로 처리.

### 확인 결과

**dev-report `docs/dev-reports/slice-permission-groups-c5-followup-cleanup.md` §5.6** 에 다음 운영 노트가 추가됐다.

- V48 분리 불채택 사유 명시 (미머지 브랜치 전용, 프로덕션/CI 신규 DB 무영향)
- 구 V47 적용 로컬 DB 전용 절차 2개 경로 명시:
  - 경로 A: DB 재생성 가능 시 — `flyway_schema_history` 의 version 47 행 삭제 후 최신 V47 재적용
  - 경로 B: 데이터 보존 필요 시 — backfill SQL 수동 적용 후 `flyway repair` 로 checksum 맞춤
- 로컬 개발 DB 전용임을 명시

**판정: DO-1 해소.** V48 분리 불채택 이유의 타당성(미머지 브랜치 전용 migration은 CI와 프로덕션 신규 DB에서 V47을 처음 적용하므로 checksum 이슈 없음)도 재확인됨.

---

## 2. C-3 AuthFlywayV47SeedIT 변경 — CI Testcontainers 안정성 검증

### 변경 요약

사이클 1 base(`8c3ff6e4`)의 약한 단언:
```java
assertThat(materialized).isGreaterThan(0);
assertThat(materialized).isLessThanOrEqualTo(managerAccounts);
```

head(`e96861c4`)의 강화된 단언:
- `expectedAccountIds` — 활성 MANAGER 배속 계정 집합에서 시스템 마스터 그룹 동시 배속 계정을 제외한 UUID 목록 (SQL로 직접 도출)
- `actualAccountIds` — account_page_permissions 에서 products.sync 7-action 정확 일치 행의 account_id 목록
- `containsExactlyElementsOf(expectedAccountIds)` exact-set 단언
- `assertThat(expectedAccountIds).isNotEmpty()` — 공집합 false-green 차단
- `assertDevManagerProductsSyncActions()` — dev_manager 계정 7 action 직접 단언
- `assertNoSystemMasterMaterializedRow()` — 시스템 마스터 배속 계정의 products.sync row 0건 단언

### CI Testcontainers 안정성 평가

| 검토 항목 | 결과 | 근거 |
|---|---|---|
| Flyway 마이그레이션 순서 | 안전 | AbstractPostgresIT 가 `postgres:16-alpine` + `spring.flyway.enabled=true` 로 V1→V47 순차 적용. V5(dev 계정) → V44(그룹 배속) → V47(products.sync seed) 순서 보장됨 |
| V46 role 컬럼 DROP 충돌 | 없음 | V44 는 role 컬럼 기반 JOIN(V46 이전). V47 IT 쿼리는 accounts.role 미참조, login_id 직접 사용. V46 이후 환경에서도 정상 |
| dev_manager 계정 존재 보장 | 보장됨 | V5 에서 id `a0000000-0000-0000-0000-000000000003`, login_id `dev_manager`, role `MANAGER` 으로 고정 시드. V44 에서 MANAGER 그룹(00000000-...-000000000101)에 배속. V47 IT 의 MANAGER_GROUP_ID 상수와 일치 |
| 시스템 마스터 그룹 제외 조건 | 정합 | V47 SQL 의 `NOT EXISTS (... AND pg.is_system_master = TRUE)` 와 IT 쿼리의 동일 서브쿼리 구조 일치. V43 seed 기준 MASTER 그룹만 is_system_master=TRUE — dev_manager 는 MANAGER 그룹 단독 배속이므로 제외 대상 아님 |
| account_page_permissions 부분 unique index | 정합 | V39 에서 `uq_app_active` 가 `(account_id, page_code) WHERE is_deleted = FALSE` 로 정의됨. V47 의 `ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO UPDATE` 와 완전 일치. ON CONFLICT 절 오작동 위험 없음 |
| Testcontainers Docker 미가용 환경 skip | 구현됨 | AbstractPostgresIT.DockerAvailableCondition 이 Docker 미가용 시 skip 처리. CI(GitHub Actions ubuntu-latest)는 Docker 가용하므로 실행됨 |
| CI matrix 커버리지 | 커버됨 | `ci.yml` 의 `shared+auth+gateway` group 이 `:services:auth-service:test` 포함. timeout 30분 내 Testcontainers 1컨테이너 기동 충분 |

**판정: CI Testcontainers 안정 실행 가능.** V5/V44 seed 의존 가정은 Flyway 순차 적용 보장으로 견고함.

---

## 3. 신규 mock runtime Playwright 테스트 (C-8) flaky 위험 평가

### 신규 테스트 2건

**T1**: `mock runtime: products.sync grant controls /admin/sheet-sync allow and redirect`
- 첫 번째 goto: `${BASE_URL}/#/admin/sheet-sync?mockRole=MANAGER` → `admin-sheetsync-trigger-btn` visible 단언
- 두 번째 goto: `${BASE_URL}/#/admin/sheet-sync?mockRole=SALES` → URL redirect 단언 + button count 0 단언

**T2**: `mock runtime: MANAGER can enter /sales/closing and sees close action surface`
- goto: `${BASE_URL}/#/sales/closing?mockRole=MANAGER` → `sales-closing-new-button` visible 단언

### flakiness 위험 분석

| 위험 항목 | 분석 | 판정 |
|---|---|---|
| 동일 테스트 내 다른 mockRole 두 번 goto — MOCK_AUTH 재초기화 | `page.goto()` 는 Playwright CDP Page.navigate 명령으로 항상 전체 문서 재로드를 강제. 두 번째 goto 시 새 document context 에서 mock.ts 모듈이 재평가되어 `_resolveMockRole()` 가 새 `?mockRole=SALES` 를 읽음. MOCK_AUTH 정상 재초기화됨 | 안전 |
| TanStack Query permissions 캐시 잔류 | 각 full reload 는 새 React 인스턴스 → QueryClient 도 새로 생성. staleTime 5분 캐시는 동일 document context 내에서만 유지됨. 두 번째 goto 후 `/permissions/my` 를 재요청하여 SALES 권한(products.sync 없음)을 반환함 | 안전 |
| PermissionGuard redirect 타이밍 — expect.poll 충분성 | PermissionGuard 는 `usePermissions().canAccess()` 기반으로 isLoading 중 spinner 렌더 후 권한 확인. mock 환경에서 `/permissions/my` 응답은 동기에 가까운 인메모리 반환. expect.poll 타임아웃 15s 는 충분함 | 안전 |
| `admin-sheetsync-trigger-btn` testId 존재 보장 | `SheetSyncPage.tsx:137` 에 `data-testid="admin-sheetsync-trigger-btn"` 이 직접 선언됨. 조건부 렌더 없음 (PermissionGuard 통과 후 항상 렌더) | 안전 |
| `sales-closing-new-button` testId 존재 보장 | `SalesClosingPage.tsx:422` 에 `data-testid="sales-closing-new-button"` 이 직접 선언됨. MANAGER 는 `accounting.period-close CREATE` 권한을 mock 매트릭스에서 보유 (SP_D1_DEFAULT_VIEW MANAGER 목록에 포함) | 안전 |
| VITE_MOCK_MODE 미설정 시 mock 미활성 | `playwright.config.ts` webServer 설정에 `env: { VITE_MOCK_MODE: '1' }` 명시. CI desktop-playwright job 은 webServer 를 통해 Vite 기동하므로 MOCK_MODE 항상 활성 | 안전 |
| 기존 testIgnore 목록과 충돌 | `permission-groups-c5-followup/` 는 `playwright.config.ts` 의 testIgnore 목록에 없음. 현재 gate 대상 스펙으로 정상 실행됨 | 확인됨 |
| CI retries | `retries: process.env['CI'] ? 1 : 0` — CI 에서 1회 재시도 허용. 진짜 flaky 가 아닌 이상 false-positive gate fail 방지됨 | 안전 |

**판정: flaky 위험 없음.** Playwright `page.goto()` 가 전체 재로드를 강제하므로 동일 테스트 내 두 번의 mockRole 전환이 정확히 동작함. testId 가 실제 컴포넌트에 존재함.

---

## 4. git diff --check / 와이어 포맷 변경 0 재확인

| 항목 | 결과 |
|---|---|
| `git diff 8c3ff6e4...e96861c4 --check` | 0건 (whitespace 오류 없음) |
| 회계 서비스 @RequestMapping/@GetMapping/@PostMapping 추가/변경 | 0건 — `AccountingEditRequestController`, `DailyClosingController`, `MonthEndCloseController`, `TaxInvoiceController` 변경은 전량 Javadoc/Swagger @Operation description 텍스트뿐 |
| DTO 추가/삭제/필드 변경 | 0건 — diff 내 DTO 파일 없음 |
| HTTP endpoint 경로 변경 | 0건 |
| auth-service V47 SQL wire 변경 | 없음 — SQL 은 데이터 DML/DDL, HTTP 와이어 무관 |
| EcountMigPartialIdentitySupport helper 추출 | test 코드만. 프로덕션 wire 무관 |
| AppLayout/routes FE 변경 | SPA 클라이언트 내부 라우팅. BE API 호출 시그니처 변경 없음 |

---

## 5. 결함표

| ID | 심각도 | 위치 | 내용 | 처리 |
|---|---|---|---|---|
| — | — | — | 신규 결함 없음 | — |

---

## 6. 판정

**APPROVE.**

사이클 1 DO-1 의 V47 checksum 운영 노트 요건이 dev-report §5.6 에 명확하게 박제됐다. V48 분리 불채택 사유(미머지 PR 브랜치 전용, 프로덕션/CI 신규 DB 무영향)는 타당하며 PM 판단과 일치한다. AuthFlywayV47SeedIT exact-set 단언 강화는 Flyway V5→V44→V47 순서 보장 하에 CI Testcontainers 에서 안정적으로 동작한다. 신규 mock runtime Playwright 테스트 2건은 `page.goto()` 전체 재로드 메커니즘과 VITE_MOCK_MODE 주입으로 flaky 위험이 없다. git diff --check 0건, 와이어 포맷 변경 0건 재확인 완료.

인프라 관점 추가 주의 사항 없음.
