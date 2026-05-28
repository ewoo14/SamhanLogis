# Phase 1 권한 프레임워크 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **구현 주체**: 본 프로젝트는 **Codex 가 구현, Claude 가 리뷰** ([[codex-implements-claude-reviews]]). 본 plan 의 코드 블록은 **목표 형태(blueprint)** 이며, Codex 가 현행 코드 컨벤션을 따라 실제 구현한다. 각 Task 시작 시 Codex 디스패치.

**Goal:** role 기반(VIEW/EDIT 2-action) 동적 RBAC 을 **계정(account) 단위 × page × 7-action**(VIEW/CREATE/UPDATE/DELETE/RESTORE/DOWNLOAD/PRINT) enforcement 로 전환하고, MASTER 전용 매트릭스 UI(개별/일괄)를 제공한다. role 은 비강제 템플릿으로 잔존.

**Architecture:** auth-service 가 2 신규 테이블(`role_page_permission_templates`, `account_page_permissions`)을 소유. shared/security `PermissionAspect` 가 gateway 주입 `X-User-Id`(계정 UUID) + `X-User-Role` 을 읽어 MASTER bypass / PARTNER deny / account-level 7-action check. ~380 `@RequirePermission` 을 2→7 action 으로 재주석화. desktop `PermissionMatrixPage` 를 account×page×7action 평탄 매트릭스로 전면 재작성. Flyway V39 가 기존 role grant 를 행동보존 자동전개.

**Tech Stack:** Java 17 / Spring Boot 3 / Spring AOP / JPA / Flyway / PostgreSQL(service-per-DB) / Gradle multi-project; React + TypeScript + TanStack Query + Vite (clients/desktop); Playwright.

**입력 문서:**
- spec: [`docs/superpowers/specs/2026-05-28-permission-overhaul-phase-1-framework-design.md`](../specs/2026-05-28-permission-overhaul-phase-1-framework-design.md) (D-PO-01~07)
- 인벤토리: [`docs/permission-overhaul/menu-inventory.md`](../../permission-overhaul/menu-inventory.md) + [`inventory/*.md`](../../permission-overhaul/inventory/)

---

## 현재-상태 사실 (구현 조사 2026-05-28 — Codex 가 신뢰할 기준점)

| 항목 | 현행 | 정확 경로 |
|---|---|---|
| `@RequirePermission` | `String page()`, `String action() default "VIEW"` (enum 아님, "VIEW"/"EDIT" 문자열) | `shared/security/.../permission/RequirePermission.java:42-68` |
| action 타입 | enum 없음, 문자열 런타임 검증. 미지원 → WARN+skip | `PermissionAspect.java:102,120-136` |
| `PermissionAspect` | `@Around` 가 `X-User-Role` 헤더만 읽음. **account id 미사용**. `client.canView/canEdit(roleCode,page)`. MASTER bypass 없음. PARTNER 처리 없음 | `shared/security/.../permission/PermissionAspect.java:95,113-183` |
| `DynamicPermissionClient` | `canView(roleCode,page)` / `canEdit(roleCode,page)`. **캐시 없음**. `GET /auth/internal/permissions/check?roleCode&pageCode&type` | `shared/security/.../permission/DynamicPermissionClient.java:21-46`, `DefaultDynamicPermissionClient.java:46-114` |
| auth admin API | `GET/PUT/DELETE /auth/admin/permissions`, `POST /auth/admin/permissions/batch`, `GET /auth/admin/permissions/my` | `services/auth-service/.../web/PermissionAdminController.java:48-201` |
| auth internal API | `GET /auth/internal/permissions/check` (`hasRole('INTERNAL')`) | `services/auth-service/.../web/PermissionInternalController.java:17-50` |
| `role_page_permissions` | `id UUID PK + gen_random_uuid`, `role_code VARCHAR(20)`, `page_code VARCHAR(100)`, `can_view`, `can_edit`, audit(`created_at/created_by VARCHAR(50) DEFAULT 'system'/modified_at/modified_by/deleted_at/deleted_by/is_deleted`), partial UNIQUE active index | `V7__add_role_page_permissions.sql:16-31`, `domain/RolePagePermission.java:36-72` |
| `accounts.role` | `@Enumerated(STRING) Role role` | `services/auth-service/.../domain/Account.java:67-69` |
| `Role` enum | **10값** (PARTNER 없음): MASTER/DEVELOPER/MANAGER/DISPATCH/SALES/ACCOUNTANT/WAREHOUSE/INVENTORY/STAFF/DRIVER | `shared/common/.../security/Role.java:9-19` |
| 최신 Flyway | **V38** → 다음 **V39** | `services/auth-service/src/main/resources/db/migration/V38__seed_sp_d7_remaining_preauthorize_page_codes.sql` |
| gateway 헤더 | `X-User-Id`=`sub` claim(계정 UUID), `X-User-Role`=`role` claim 주입 (다운스트림) | `services/api-gateway/.../filter/JwtAuthenticationGatewayFilterFactory.java:44,61-64` |
| `EstimatePermissionGuard` | **실사용** (EstimateController list/getOne=checkView, 6 mutate=checkEdit). role 기준 | `services/slip-service/.../estimate/web/EstimatePermissionGuard.java:34,47-82` |
| `ProductPermissionGuard` / `PartnerOrderPermissionGuard` | **call site 0 (dead)** | `product-service/.../web/ProductPermissionGuard.java`, `partner-order-service/.../web/PartnerOrderPermissionGuard.java` |
| FE 매트릭스 | role×page×2action. `routes/PermissionMatrixPage.tsx` (1302줄), route `/admin/permission-matrix`, `PAGE_GROUPS`(16그룹)+`PAGE_LABEL` | `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`, `routes/index.tsx:1467-1474` |
| FE hook | `usePermissions().canAccess(pageCode, action='view'\|'edit')`, 미로드 시 false | `clients/desktop/src/renderer/hooks/usePermissions.ts:58-66` |
| FE api | `fetchPermissionMatrix()`/`updatePermissionBatch()`/`fetchMyPermissions()`, `PageCode` 170+ union, `PermissionAction='view'\|'edit'` | `clients/desktop/src/renderer/api/permissionsApi.ts` |

**환경 메모** (양 PC 공통):
- Gradle 캐시: `$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'`.
- 한글 path JDK 트랩 ([[korean-path-jdk]]): 전체 `test` 대신 모듈+`--tests` 타겟 실행. 풀빌드는 Linux CI.
- gradlew exec bit ([[gradlew-exec-bit]]): 커밋 시 `git update-index --chmod=+x gradlew`.
- FE: `clients/desktop` 에서 `npm.cmd run typecheck/lint/build`, `npx.cmd playwright test ...`.

---

## File Structure (Create / Modify)

**shared (security/common):**
- Create: `shared/security/src/main/java/com/samhanair/logis/security/permission/PermissionAction.java` — 7-action enum
- Modify: `shared/security/.../permission/RequirePermission.java` — `action()` → `PermissionAction`
- Modify: `shared/security/.../permission/PermissionAspect.java` — account-id + MASTER bypass + PARTNER deny + 7-action
- Modify: `shared/security/.../permission/DynamicPermissionClient.java` — `check(accountId,page,action)` + `bulkLoad`
- Modify: `shared/security/.../permission/DefaultDynamicPermissionClient.java` — account-based HTTP

**auth-service:**
- Create: `domain/RolePagePermissionTemplate.java`, `domain/AccountPagePermission.java` (+ repositories)
- Create: `service/AccountPermissionService.java` (check / bulkLoad / matrix / template-apply / copy / bulk)
- Modify: `web/PermissionInternalController.java` — account check + account map
- Modify: `web/PermissionAdminController.java` — account matrix + templates + bulk endpoints (+ DTOs)
- Create: `src/main/resources/db/migration/V39__account_page_permissions_overhaul.sql`
- Create IT: `V39MigrationParityIT`, `V39PartnerExclusionIT`, `V39GuardGatedPageIT`, `AccountPermissionServiceIT`

**14 service controllers:** 재주석화 (8 도메인 commit) — 아래 Task 9.1~9.8.

**clients/desktop:**
- Modify: `api/permissionsApi.ts` (7-action types + account endpoints)
- Modify: `hooks/usePermissions.ts` (7-action)
- Rewrite: `routes/PermissionMatrixPage.tsx` (account×page×7action 평탄 매트릭스)
- Create: `routes/PermissionMatrixBulkPage.tsx` (다계정 wizard) + route
- Modify: `components/AppLayout.tsx` (7-action canAccess)
- Create/Modify: `playwright/permission-overhaul/*.spec.ts`

**docs:** README / DECISIONS / dev-report / samhan-public-overview.html.

---

## Task 0: 브랜치 준비

- [ ] **Step 1: feature 브랜치 생성** (main 기준; 본 docs 브랜치 머지 후 또는 별도)

```bash
git checkout main && git pull origin main
git checkout -b feat/phase-1-permission-overhaul-framework
```

- [ ] **Step 2: Gradle 캐시 env 설정**

```powershell
$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'
```

---

## Task 1: `PermissionAction` enum (shared/security)

**Files:**
- Create: `shared/security/src/main/java/com/samhanair/logis/security/permission/PermissionAction.java`
- Test: `shared/security/src/test/java/com/samhanair/logis/security/permission/PermissionActionTest.java`

- [ ] **Step 1: 실패 테스트 작성**

```java
package com.samhanair.logis.security.permission;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;

class PermissionActionTest {
    @Test
    void hasSevenActions() {
        assertThat(PermissionAction.values()).hasSize(7);
    }
    @Test
    void parsesCaseInsensitive() {
        assertThat(PermissionAction.from("view")).isEqualTo(PermissionAction.VIEW);
        assertThat(PermissionAction.from("DOWNLOAD")).isEqualTo(PermissionAction.DOWNLOAD);
    }
    @Test
    void rejectsUnknown() {
        assertThat(PermissionAction.fromOrNull("EDIT")).isNull(); // 레거시 EDIT 제거 확인
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `./gradlew :shared:security:test --tests com.samhanair.logis.security.permission.PermissionActionTest --no-daemon`
Expected: FAIL (PermissionAction 없음)

- [ ] **Step 3: 구현**

```java
package com.samhanair.logis.security.permission;

/** 7-action 권한 액션. column 매핑: VIEW=can_view ... PRINT=can_print. */
public enum PermissionAction {
    VIEW, CREATE, UPDATE, DELETE, RESTORE, DOWNLOAD, PRINT;

    public static PermissionAction from(String raw) {
        PermissionAction a = fromOrNull(raw);
        if (a == null) throw new IllegalArgumentException("지원하지 않는 action: " + raw);
        return a;
    }
    public static PermissionAction fromOrNull(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try { return PermissionAction.valueOf(raw.trim().toUpperCase()); }
        catch (IllegalArgumentException e) { return null; }
    }
    /** account_page_permissions / templates 의 컬럼명 (can_*). */
    public String column() {
        return "can_" + name().toLowerCase();
    }
}
```

- [ ] **Step 4: 통과 확인**

Run: `./gradlew :shared:security:test --tests com.samhanair.logis.security.permission.PermissionActionTest --no-daemon`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add shared/security/src/main/java/com/samhanair/logis/security/permission/PermissionAction.java shared/security/src/test/java/com/samhanair/logis/security/permission/PermissionActionTest.java
git commit -m "feat(perm): PermissionAction 7-action enum 추가"
```

---

## Task 2: `@RequirePermission` action → `PermissionAction`

**Files:**
- Modify: `shared/security/.../permission/RequirePermission.java`
- Test: `shared/security/.../permission/RequirePermissionTest.java`

- [ ] **Step 1: 실패 테스트** — annotation 의 `action()` 이 `PermissionAction` 타입 반환

```java
@Test
void actionIsEnum() throws Exception {
    var m = Sample.class.getMethod("op");
    RequirePermission rp = m.getAnnotation(RequirePermission.class);
    assertThat(rp.action()).isEqualTo(PermissionAction.CREATE);
}
static class Sample {
    @RequirePermission(page = "x.y", action = PermissionAction.CREATE)
    public void op() {}
}
```

- [ ] **Step 2: 실패 확인** — Run: `./gradlew :shared:security:test --tests *RequirePermissionTest --no-daemon` → FAIL (action 이 String)

- [ ] **Step 3: 구현** — `action()` 시그니처 변경

```java
public @interface RequirePermission {
    String page();
    PermissionAction action() default PermissionAction.VIEW;
}
```

- [ ] **Step 4: 통과 확인** — Run 동일 → PASS

- [ ] **Step 5: 커밋** — `git commit -m "feat(perm): @RequirePermission action 을 PermissionAction enum 으로"`
  (주의: 이 시점 전 service 컴파일은 깨짐 — Task 9 재주석화에서 복구. Task 2~8 은 shared+auth 범위, service 재주석화 전까지 `:shared:security` + `:services:auth-service` 만 컴파일 타겟.)

---

## Task 3: `DynamicPermissionClient` account+7action 시그니처

**Files:**
- Modify: `shared/security/.../permission/DynamicPermissionClient.java`
- Modify: `shared/security/.../permission/DefaultDynamicPermissionClient.java`
- Test: `shared/security/.../permission/DefaultDynamicPermissionClientTest.java` (MockWebServer 또는 기존 테스트 패턴)

- [ ] **Step 1: 실패 테스트** — `check(accountId, page, action)` 가 auth-service `GET /auth/internal/permissions/check?accountId&pageCode&action` 호출, `{data:{allowed:true}}` → true

```java
@Test
void checkCallsAccountEndpoint() {
    // MockWebServer enqueue {"data":{"allowed":true}}
    boolean r = client.check(UUID.fromString("..."), "accounting.journals", PermissionAction.CREATE);
    assertThat(r).isTrue();
    // recorded request path contains accountId=... & pageCode=accounting.journals & action=CREATE
}
@Test
void checkReturnsFalseOnError() { /* 4xx / exception → false (현행 fail-closed 유지) */ }
```

- [ ] **Step 2: 실패 확인** — FAIL (메서드 없음)

- [ ] **Step 3: 구현**

```java
public interface DynamicPermissionClient {
    boolean check(UUID accountId, String pageCode, PermissionAction action);
    /** FE 부트/사이드바: 계정의 page→action 집합. 실패 시 빈 map (fail-closed). */
    Map<String, EnumSet<PermissionAction>> bulkLoad(UUID accountId);
}
```

`DefaultDynamicPermissionClient`:
- `check`: `GET /auth/internal/permissions/check?accountId={id}&pageCode={p}&action={a}` → parse `data.allowed`, 실패 시 false (현행 fail-closed 유지). 헤더 `X-Internal-Token`, `X-User-Id`("system-internal:"+caller), `X-User-Role` 는 caller service 식별로 유지.
- `bulkLoad`: `GET /auth/internal/permissions/account/{accountId}` → `{data:{"accounting.journals":["VIEW","CREATE"],...}}` parse, 실패 시 `Map.of()`.

- [ ] **Step 4: 통과 확인** — Run: `./gradlew :shared:security:test --tests *DefaultDynamicPermissionClientTest --no-daemon` → PASS

- [ ] **Step 5: 커밋** — `git commit -m "feat(perm): DynamicPermissionClient account 기준 7-action check+bulkLoad"`

---

## Task 4: `PermissionAspect` account-id + MASTER bypass + PARTNER deny + 7-action

**Files:**
- Modify: `shared/security/.../permission/PermissionAspect.java`
- Test: `shared/security/.../permission/PermissionAspectTest.java`

- [ ] **Step 1: 실패 테스트** (4 케이스)

```java
@Test void masterBypassesWithoutClientCall() { /* role=MASTER → proceed, client.check 미호출 */ }
@Test void partnerAlwaysDenied()            { /* role=PARTNER, 임의 page → AccessDenied */ }
@Test void accountGrantAllows()             { /* X-User-Id 있고 client.check(acct,page,CREATE)=true → proceed */ }
@Test void missingAccountIdDenies()         { /* role!=MASTER && X-User-Id null → AccessDenied (현행 skip→deny) */ }
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현** — pseudocode (spec §4-3):
  - `role = header("X-User-Role")`, `accountId = header("X-User-Id")` (parameter `@RequestHeader` 우선, 없으면 `RequestContextHolder` — 현행 X-User-Role 추출 로직 재사용 + X-User-Id 추가).
  - `if "MASTER".equals(role) return proceed();`
  - `if "PARTNER".equals(role) throw deny;`
  - `if accountId == null { log.warn; throw deny; }`
  - `UUID acct = UUID.parse(accountId)` (parse 실패 → deny + warn).
  - `if (!client.check(acct, rp.page(), rp.action())) { metrics.incrementDenied(svc, page, role, action.name()); throw deny; }`
  - `return proceed();`
  - 레거시 "VIEW/EDIT 문자열 분기" + "미지원 action skip" 제거.

- [ ] **Step 4: 통과 확인** — Run: `./gradlew :shared:security:test --tests *PermissionAspectTest --no-daemon` → PASS

- [ ] **Step 5: 커밋** — `git commit -m "feat(perm): PermissionAspect account 기준 + MASTER bypass + PARTNER deny + 7-action"`

---

## Task 5: auth-service 엔티티 + 리포지토리

**Files:**
- Create: `services/auth-service/.../domain/RolePagePermissionTemplate.java`, `domain/AccountPagePermission.java`
- Create: `.../repository/RolePagePermissionTemplateRepository.java`, `.../repository/AccountPagePermissionRepository.java`
- Test: `.../domain/AccountPagePermissionTest.java` (도메인 메서드)

- [ ] **Step 1: 실패 테스트** — `AccountPagePermission.allows(PermissionAction)` 반환 + `grant(action)`/`revoke(action)` 도메인 메서드

```java
@Test void allowsReflectsColumns() {
    var p = AccountPagePermission.of(accountId, "accounting.journals");
    p.grant(PermissionAction.CREATE);
    assertThat(p.allows(PermissionAction.CREATE)).isTrue();
    assertThat(p.allows(PermissionAction.DELETE)).isFalse();
}
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현** — 엔티티 (V7 RolePagePermission 패턴 미러: `@UuidGenerator id`, `@SQLRestriction("is_deleted = false")`, BaseEntity audit). 7 boolean 컬럼 + `allows(action)` switch + `grant/revoke(action)`. Repository: `findByAccountId(UUID)`, `findByAccountIdAndPageCode`, `findByRoleCode` 등.

- [ ] **Step 4: 통과 확인** — Run: `./gradlew :services:auth-service:test --tests *AccountPagePermissionTest --no-daemon` → PASS

- [ ] **Step 5: 커밋** — `git commit -m "feat(auth): account_page_permissions / role_page_permission_templates 엔티티+리포지토리"`

---

## Task 6: `AccountPermissionService` + internal 조회 endpoint

**Files:**
- Create: `services/auth-service/.../service/AccountPermissionService.java`
- Modify: `services/auth-service/.../web/PermissionInternalController.java`
- Test: `.../service/AccountPermissionServiceTest.java`, `.../web/PermissionInternalControllerTest.java` (@WebMvcTest 슬라이스 — bean ordering 회피 [[no-backlog-strict]])

- [ ] **Step 1: 실패 테스트**
  - `service.check(accountId, page, action)` → account_page_permissions 조회, 없으면 false.
  - `service.bulkLoad(accountId)` → `Map<pageCode, EnumSet<PermissionAction>>`.
  - controller `GET /auth/internal/permissions/check?accountId&pageCode&action` → `{data:{allowed}}`; `GET /auth/internal/permissions/account/{accountId}` → map.

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현** — service 조회 + controller 2 endpoint (`hasRole('INTERNAL')` 유지). 레거시 `check?roleCode&type` 제거(또는 410). MASTER 계정 조회 시 service 는 전 action true 반환(또는 aspect bypass 가 이미 처리 — internal check 는 비-MASTER 만 도달하므로 단순 조회로 충분, MASTER 도 안전하게 all-true 반환).

- [ ] **Step 4: 통과 확인** — Run: `./gradlew :services:auth-service:test --tests *AccountPermissionServiceTest --tests *PermissionInternalControllerTest --no-daemon` → PASS

- [ ] **Step 5: 커밋** — `git commit -m "feat(auth): AccountPermissionService + internal account 권한 조회 endpoint"`

---

## Task 7: auth-service admin 매트릭스 API (account / template / bulk)

**Files:**
- Modify: `services/auth-service/.../web/PermissionAdminController.java` (+ DTO records)
- Modify: `.../service/AccountPermissionService.java` (matrix/applyTemplate/copyAccount/bulk)
- Test: `.../web/PermissionAdminControllerTest.java`

- [ ] **Step 1: 실패 테스트** — 신규 endpoint 계약:
  - `GET /auth/admin/permissions/accounts` → 계정 목록(id, displayName, role, 활성).
  - `GET /auth/admin/permissions/account/{accountId}` → `{pageCode: {view,create,update,delete,restore,download,print}}`.
  - `PUT /auth/admin/permissions/account/{accountId}` (bulk upsert: `[{pageCode, actions:{...7 boolean}}]`) → 변경 건수.
  - `POST /auth/admin/permissions/account/{accountId}/apply-template?roleCode=SALES` → 적용 결과.
  - `POST /auth/admin/permissions/account/{accountId}/copy-from?sourceAccountId={id}` → 복사 결과.
  - `GET /auth/admin/permissions/templates` / `PUT /auth/admin/permissions/templates/{roleCode}` (템플릿 편집, 선택).
  - `POST /auth/admin/permissions/bulk` (다계정 wizard: `{accountIds:[...], mode:"template"|"explicit", roleCode?, grants?}`) → 영향 건수.
  - 모두 `@PreAuthorize("hasRole('MASTER')") @RequirePermission(page="system.permission-admin", action=...)` (VIEW 조회 / UPDATE 변경).

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현** — controller + service + DTO. bulk 는 트랜잭션 경계 1개, 부분 실패 시 전체 롤백 + 영향 건수 반환 (spec §12-4). 변경 시 audit(`modified_by` = MASTER 계정).

- [ ] **Step 4: 통과 확인** — Run: `./gradlew :services:auth-service:test --tests *PermissionAdminControllerTest --no-daemon` → PASS

- [ ] **Step 5: 커밋** — `git commit -m "feat(auth): MASTER 매트릭스 admin API (account/template/copy/bulk)"`

---

## Task 8: Flyway V39 마이그레이션 + 행동보존 IT

**Files:**
- Create: `services/auth-service/src/main/resources/db/migration/V39__account_page_permissions_overhaul.sql`
- Create IT: `.../V39MigrationParityIT.java`, `.../V39PartnerExclusionIT.java`, `.../V39GuardGatedPageIT.java` (AbstractPostgresIT / Testcontainers)

> **선행 산출물**: RESTORE/DOWNLOAD/PRINT 의 (role × page) 보존 매핑 표. Codex 가 인벤토리 §2-2/2-3/2-4 의 endpoint 목록 + 각 endpoint 현행 가드 bit(view/edit) + V10/V31/V32/V35/V36/V38 seed 의 그 (role,page,bit) 값을 조사해 **plan 부록표**로 산출 후 V39 step 2 SQL 에 인라인. (Task 9 재주석화의 endpoint→action 분류와 1:1 일치해야 함 — Task 9 와 동기.)

- [ ] **Step 1: 실패 IT 작성** — `V39MigrationParityIT`:

```java
// 마이그레이션 적용 후, 각 (role, page) 의 기존 role_page_permissions(view/edit) 가
// 분해 규칙(view→view, edit→create+update+delete, restore/download/print=보존표)대로
// 그 role 의 sample 계정 account_page_permissions 에 반영됐는지 비교.
@Test void viewMapsToView() { ... }
@Test void editMapsToCreateUpdateDelete() { ... }
@Test void restoreDownloadPrintPreservedPerMapping() { ... }
```

`V39PartnerExclusionIT`: `account_page_permissions` 에 role=PARTNER 계정 행 0건.
`V39GuardGatedPageIT`: estimates.list / products.* / sales.partner-order.* 의 효과가 마이그레이션 전후 동일(확대 0).

- [ ] **Step 2: 실패 확인** — Run: `./gradlew :services:auth-service:test --tests *V39*IT --no-daemon` → FAIL (V39 없음)

- [ ] **Step 3: V39 SQL 구현** — spec §6-2 골격:
  1. `CREATE TABLE role_page_permission_templates` + `account_page_permissions` (spec §3-1 DDL, `modified_at` 등 V7 컨벤션).
  2. templates INSERT: `SELECT role_code, page_code, can_view, can_edit AS can_create, can_edit AS can_update, can_edit AS can_delete, FALSE, FALSE, FALSE FROM role_page_permissions WHERE is_deleted=FALSE`.
  3. templates RESTORE/DOWNLOAD/PRINT UPDATE: 보존 매핑표의 (role,page) 쌍만 TRUE (force-UPDATE 금지, deliberate FALSE 미덮어씀).
  4. account_page_permissions INSERT: `accounts JOIN templates ON role` WHERE `role NOT IN ('MASTER','PARTNER')` AND active.
  5. `role_page_permissions` 테이블 코멘트로 deprecated 마킹 (drop 안 함).

- [ ] **Step 4: 통과 확인** — Run: `./gradlew :services:auth-service:test --tests *V39*IT --no-daemon` → PASS (Docker 필요; 불가 시 Linux CI 결과 첨부 [[qa-docker-real-test]])

- [ ] **Step 5: 커밋** — `git update-index --chmod=+x gradlew` 확인 후 `git commit -m "feat(auth): V39 행동보존 자동전개 마이그레이션 + parity/PARTNER/guard IT"`

---

## Task 9.1 ~ 9.8: 도메인별 재주석화 (8 commit)

> **방식**: 각 도메인은 (a) 그 service 의 controller 에서 `@RequirePermission(page, action="VIEW"|"EDIT")` 를 찾아 (b) 인벤토리 섹션 + HTTP verb 기준으로 7-action 으로 재분류, (c) 인벤토리 §2-1 의 mis-annotation/dead 코드 동반 정정, (d) 그 도메인 권한 IT(allow/deny stub) 보강, (e) commit. **enum 1개 bit 가 아니라 의미 기준** 으로 분류.

**공통 action 매핑 규칙** (spec §5):
| HTTP / 의미 | action |
|---|---|
| GET 조회/list/detail/realtime/SSE | VIEW |
| POST 생성 | CREATE |
| PUT/PATCH 수정 | UPDATE |
| DELETE soft-delete | DELETE |
| export (xlsx/csv) | DOWNLOAD |
| 인쇄 view/endpoint | PRINT |
| 롤백(revert)/warehouse restore | RESTORE |
| POST trigger(import/refresh, 비-CRUD) | 도메인 의미상 CREATE 또는 UPDATE |

**공통 IT 패턴** ([[no-backlog-strict]] / SP-D6-7 see-saw 교훈): `DynamicPermissionClient @MockBean` 을 **account+action-aware stub** 으로. allow 케이스 `when(client.check(eq(acct), eq(page), eq(action))).thenReturn(true)`, deny 케이스 명시 `false`. 도메인 IT 는 **일괄** 보강(점진 금지).

각 Task 9.x 의 step 형식 (예: 9.1 accounting):

- [ ] **Step 1: 대상 식별** — `grep -rn "@RequirePermission" services/accounting-service/src/main/java` (Grep 도구). 인벤토리 [`accounting-core.md`](../../permission-overhaul/inventory/accounting-core.md) + [`ecount-migration.md`](../../permission-overhaul/inventory/ecount-migration.md) 와 대조하여 endpoint→action 분류표 작성 (commit 메시지/ dev-report 에 첨부).
- [ ] **Step 2: 재주석화** — 각 `@RequirePermission(action="VIEW")` → `action=PermissionAction.VIEW`, `"EDIT"` → 해당 endpoint 의 의미 action(CREATE/UPDATE/DELETE/DOWNLOAD/PRINT/RESTORE). import 추가.
- [ ] **Step 3: mis-annotation/dead 정정** — 인벤토리 §2-1 해당 도메인 항목 (예: accounting 없음; partners.delete EDIT→DELETE; slip.cleanup-history EDIT→VIEW; admin.users 코드 정렬; ecount orphan 코드).
- [ ] **Step 4: IT 보강** — 도메인 권한 IT allow/deny stub 일괄. Run: `./gradlew :services:accounting-service:test --tests *Permission*IT --no-daemon` → PASS (compileTestJava 먼저 확인).
- [ ] **Step 5: 커밋** — `git commit -m "feat(perm): accounting-service @RequirePermission 7-action 재주석화 (SP-PO-9.1)"`

**8 commit 도메인 + 매핑 파일:**
| Task | service(s) | 인벤토리 |
|---|---|---|
| 9.1 | accounting-service | accounting-core.md + ecount-migration.md |
| 9.2 | inventory-service | inventory.md |
| 9.3 | slip-service (estimates 포함) | slip-estimates.md |
| 9.4 | arologis-service | arologis.md |
| 9.5 | partner-service (+partner-auth) | partners.md |
| 9.6 | partner-order-service + dc-config-service | sales-products.md (sales 부분) |
| 9.7 | product-service | sales-products.md (products 부분) |
| 9.8 | user/auth/dashboard/notification/groupware | platform-admin-notify.md |

> 각 commit 후 해당 모듈 `compileJava compileTestJava` 가 green 이어야 다음 진행. Task 2(annotation enum) 이후 service 컴파일이 깨진 상태이므로, 9.x 는 **순차** 진행하며 각 service 를 차례로 복구.

---

## Task 10: EstimatePermissionGuard account 전환 + dead guard 삭제

**Files:**
- Modify: `services/slip-service/.../estimate/web/EstimatePermissionGuard.java` + `EstimateController.java`
- Delete: `services/product-service/.../web/ProductPermissionGuard.java`, `services/partner-order-service/.../web/PartnerOrderPermissionGuard.java`, (인벤토리 §2-1) `PartnerPermissionGuard` if dead
- Test: `.../estimate/web/EstimatePermissionGuardTest.java`

- [ ] **Step 1: 실패 테스트** — guard 가 `DynamicPermissionClient.check(accountId, "estimates.list", VIEW/CREATE...)` 기준 (role 아님). deny 시 Forbidden.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — `checkView(accountId)`/`checkEdit(accountId)` → account 기준 client.check. EstimateController 가 `X-User-Id` 전달. dead guard 2~3개 파일 삭제 + import 정리.
- [ ] **Step 4: 통과 확인** — Run: `./gradlew :services:slip-service:test --tests *EstimatePermissionGuardTest --no-daemon` + `:services:product-service:compileJava :services:partner-order-service:compileJava` → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat(perm): EstimateGuard account 전환 + 미사용 PermissionGuard 삭제"`

---

## Task 11: FE permissionsApi + usePermissions 7-action

**Files:**
- Modify: `clients/desktop/src/renderer/api/permissionsApi.ts`
- Modify: `clients/desktop/src/renderer/hooks/usePermissions.ts`
- Test: `clients/desktop/src/renderer/hooks/usePermissions.test.ts` (Vitest)

- [ ] **Step 1: 실패 테스트** — `PermissionAction` 타입 = 7값; `canAccess(page, 'download')` 동작; `fetchMyPermissions` 가 `GET /auth/internal/permissions/account/{me}` (또는 admin/my account 기준) 7-action 반환 파싱.

```ts
it('canAccess supports 7 actions', () => { /* mock cache → canAccess('accounting.journals','print') */ })
```

- [ ] **Step 2: 실패 확인** — Run: `cd clients/desktop; npm.cmd run test -- usePermissions` → FAIL
- [ ] **Step 3: 구현** — `type PermissionAction = 'view'|'create'|'update'|'delete'|'restore'|'download'|'print'`. `MyPermission.actions: PermissionAction[]`. `canAccess(pageCode, action='view')` 미로드 시 false 유지. matrix 타입: `PermissionCell` 7 boolean. API: account 기준 endpoint 추가(`fetchAccounts`, `fetchAccountMatrix(accountId)`, `updateAccountMatrix`, `applyTemplate`, `copyFromAccount`, `bulkApply`).
- [ ] **Step 4: 통과 확인** — Run: `npm.cmd run test -- usePermissions` + `npm.cmd run typecheck` → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat(perm-fe): permissionsApi/usePermissions 7-action + account endpoint"`

---

## Task 12: FE PermissionMatrixPage 전면 재작성 (account×page×7action 평탄)

**Files:**
- Rewrite: `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`
- Reuse: `PAGE_GROUPS`/`PAGE_LABEL` (도메인 14~16 그룹). 신규 도메인 그룹 매핑 (`ecount.mig*`=이카운트 마이그 그룹 등).

- [ ] **Step 1: 실패 Playwright/Vitest** — 계정 선택 → 7 컬럼(VIEW~PRINT) 렌더, 행 `[전부]` 토글, 컬럼헤더 토글, 도메인 섹션 `[전체ON/OFF]`, 검색, 변경 N건 + 저장. data-testid: `perm-matrix-account-select`, `perm-matrix-cell-{pageNorm}-{action}`, `perm-matrix-row-all-{pageNorm}`, `perm-matrix-col-all-{action}`, `perm-matrix-domain-all-{domain}`, `perm-matrix-save-btn`, `perm-matrix-change-count`, `perm-matrix-apply-template`, `perm-matrix-copy-account`.
- [ ] **Step 2: 실패 확인** — Run: `npx.cmd playwright test playwright/permission-overhaul/matrix --reporter=line` → FAIL
- [ ] **Step 3: 구현** — 계정 selector + 평탄 매트릭스(도메인 섹션 헤더, sticky thead, 173 행) + 툴바(템플릿 적용/전체ON/OFF/복사/검색) + dirty 추적 sticky 패널 + 저장(`updateAccountMatrix` + query invalidate). spec §7-2 레이아웃.
- [ ] **Step 4: 통과 확인** — Run: `npm.cmd run typecheck && npm.cmd run build` + Playwright matrix → PASS (Windows EPERM 시 Linux CI 보류 명시 [[testcontainers-windows-docker]])
- [ ] **Step 5: 커밋** — `git commit -m "feat(perm-fe): PermissionMatrixPage account×page×7action 평탄 매트릭스 재작성"`

---

## Task 13: FE 다계정 일괄 wizard

**Files:**
- Create: `clients/desktop/src/renderer/routes/PermissionMatrixBulkPage.tsx`
- Modify: `clients/desktop/src/renderer/routes/index.tsx` (route `/admin/permission-matrix/bulk`, MASTER guard)

- [ ] **Step 1: 실패 Playwright** — 4 step wizard: 계정 다중선택 → mode(템플릿/명시) → 미리보기(영향 계정×page×action) → 적용. data-testid: `perm-bulk-account-{id}`, `perm-bulk-mode`, `perm-bulk-preview`, `perm-bulk-apply`.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — wizard + `bulkApply` API. 미리보기는 적용 전 dry-run 집계.
- [ ] **Step 4: 통과 확인** — `npm.cmd run typecheck && npm.cmd run build` + Playwright bulk → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat(perm-fe): 다계정 일괄 권한 wizard"`

---

## Task 14: FE AppLayout + Playwright 통합

**Files:**
- Modify: `clients/desktop/src/renderer/components/AppLayout.tsx`
- Modify/Create: `playwright/permission-overhaul/*.spec.ts`

- [ ] **Step 1: 실패 테스트** — 사이드바 메뉴가 `canAccess(page,'view')` 로 게이트 유지(미로드 false). 7-action 도입 후에도 메뉴 flash 0.
- [ ] **Step 2: 실패 확인** — FAIL (필요 시)
- [ ] **Step 3: 구현** — `dynamicCanAccess(page,'view')` 호출 유지(타입만 7-action 호환). 버튼 단위(입력/수정/삭제/다운로드/출력) 노출 정책: 권한 false 시 hidden (spec §7-4, [[uuid-no-user-visibility]] 무관, [[no-backlog-strict]] flash 정책).
- [ ] **Step 4: 통과 확인** — `npm.cmd run typecheck && npm.cmd run build` + 전체 Playwright permission-overhaul → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat(perm-fe): AppLayout 7-action 게이트 + Playwright 통합"`

---

## Task 15: 문서 동기화 ([[continuous-docs-sync]] [[samhan-public-overview-sync]])

**Files:**
- Create: `docs/dev-reports/phase-1-permission-overhaul-framework.md`
- Modify: `README.md`, `docs/DECISIONS.md` (D-PO-01~07), 각 service/client README, `docs/samhan-public-overview.html`

- [ ] **Step 1: dev-report 작성** — 함수 단위 3-layer ([[function-documentation]]): 한국어 Javadoc + springdoc + dev-report.
- [ ] **Step 2: DECISIONS 추가** — D-PO-01~07 + 마이그레이션 행동보존 근거.
- [ ] **Step 3: overview.html sync** — nav-badge + progress 표 + callout.
- [ ] **Step 4: 검증** — `git diff --check`.
- [ ] **Step 5: 커밋** — `git commit -m "docs(perm-overhaul): Phase 1 dev-report + DECISIONS + overview sync"`

---

## PR 발행 + 리뷰 사이클

- [ ] PR 발행 `[FEAT] Phase 1 권한 프레임워크 — account×page×7action 전환` ([[pr-title-caps-bracket]]), `연관 Issue: #N`, QA 스크린샷 인라인 ([[pr-qa-screenshots]]).
- [ ] CI watch ([[pr-ci-monitoring]] [[monitor-no-permission]]). green 의무.
- [ ] dual 5-agent 리뷰 ([[dual-5agent-review]]) — Claude 기획자, **Codex 구현/수정** ([[codex-implements-claude-reviews]]). 사이클 N=2 의무 ([[cycle-n2-mandatory]]). QA Docker 실서버 ([[qa-docker-real-test]]).
- [ ] 무결함 + CI green → PM 마지막 리뷰 + 자동 머지 ([[user-merge-authority]]).

---

## Self-Review (writing-plans 체크리스트)

**1. Spec coverage:** spec §3(데이터모델)→T5/T8, §4(프레임워크)→T1/2/3/4, §5(재주석화)→T9.1~9.8/T10, §6(마이그레이션)→T8, §7(UI)→T11/12/13/14, §8(테스트)→각 T 의 IT/Playwright + T8 parity IT, §9(commit plan)→Task 매핑, §10(Phase2 spillover)→비포함 명시, §11(위험)→T8 IT/T9 IT 패턴/T4 PARTNER. **누락 없음.**

**2. Placeholder scan:** RESTORE/DOWNLOAD/PRINT 보존 매핑표는 T8 선행 산출물로 명시(placeholder 아님, Codex 산출 절차 규정). 재주석화 380건은 규칙+인벤토리 대조표로 규정(열거 대신 절차 — 의도적, 기계적 변환).

**3. Type consistency:** `PermissionAction`(enum, T1) ↔ `@RequirePermission.action()`(T2) ↔ `DynamicPermissionClient.check(...,PermissionAction)`(T3) ↔ aspect(T4) ↔ FE `PermissionAction`(소문자 union, T11) — BE enum 대문자 / FE union 소문자, API 경계에서 변환(T3 HTTP `action={ACTION}` 대문자, T11 파싱 소문자). 일관.

**4. 위험 메모:** Task 2 이후 ~14 service 컴파일 깨짐 → T9.1~9.8 순차 복구 전까지 전체 빌드 불가. 각 service commit 후 모듈 컴파일 green 게이트. PR 은 모든 service 복구 후에만 CI green 가능 (단일 PR 특성).
