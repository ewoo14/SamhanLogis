# SP-D6-1 Implementation Plan — auth + dashboard + dc-config @RequirePermission 마이그레이션

> **For agentic workers:** Codex 디스패치 의무 (feedback_codex_implements_claude_reviews).

**Goal:** 15 endpoint @PreAuthorize → @RequirePermission + 5 신규 PageCode + V29 seed bootstrap.

**Spec:** `docs/superpowers/specs/2026-05-26-sp-d6-1-auth-dashboard-dcconfig-permission-migration-design.md`

---

## Task 1: auth-service PageCode enum + V29 Flyway

**Files:**
- Modify: `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`
- Create: `services/auth-service/src/main/resources/db/migration/V29__seed_sp_d6_1_page_codes.sql`

### Step 1.1: PageCode enum 5 신규

```java
SYSTEM_PERMISSION_ADMIN("system.permission-admin"),
SYSTEM_PASSWORD_ADMIN("system.password-admin"),
SYSTEM_ACCOUNT_ADMIN("system.account-admin"),
DC_CONFIG_IMPORT("dc-config.import"),
DASHBOARD_ADMIN("dashboard.admin");
```

### Step 1.2: V29 Flyway seed (spec section 4 exact content)

ON CONFLICT DO NOTHING idempotent.

### Step 1.3: PageCodeTest 회귀 0 확인

---

## Task 2: auth-service 6 endpoint @RequirePermission 추가

**Files:**
- Modify: `services/auth-service/src/main/java/.../web/AuthController.java`
- Modify: `services/auth-service/src/main/java/.../web/PasswordController.java`
- Modify: `services/auth-service/src/main/java/.../web/PermissionAdminController.java`

각 endpoint 에 spec section 3.1 매트릭스 그대로 적용:
- `@PreAuthorize("hasRole('MASTER')")` 유지 (bootstrap 안전)
- `@RequirePermission(page="system.*", action="VIEW|EDIT")` 추가

**중요**: `isAuthenticated()`, `hasRole('INTERNAL')` endpoint 는 변경 X (RBAC 무관).

---

## Task 3: dc-config-service 3 endpoint

**Files:**
- Modify: `services/dc-config-service/src/main/java/.../web/DcConfigImportController.java`
- Modify: `services/dc-config-service/src/main/java/.../web/PartnerDcConfigsController.java`
- Modify: `services/dc-config-service/build.gradle` (`shared:security` 의존 확인 — 이미 있으면 skip)

각 endpoint spec section 3.2 매트릭스:
- `DcConfigImportController:54`: `@hr.isExecutiveOffice() and hasRole('MASTER')` **유지** + `@RequirePermission(page="dc-config.import", action="EDIT")`
- `PartnerDcConfigsController:48`: `@PreAuthorize` **제거** + `@RequirePermission(page="sales.partner-dc-config", action="VIEW")`
- `PartnerDcConfigsController:65`: `@PreAuthorize` 제거 + `@RequirePermission(page="sales.partner-dc-config", action="EDIT")`

---

## Task 4: dashboard-service 5 endpoint

**Files:**
- Modify: `services/dashboard-service/src/main/java/.../controller/DashboardAdminController.java`
- Modify: `services/dashboard-service/src/main/java/.../controller/DashboardMigrationOpsController.java`
- Modify: `services/dashboard-service/build.gradle` (의존 확인)

- `DashboardAdminController:53/76/97/123`: `@PreAuthorize` 제거 + `@RequirePermission(page="dashboard.admin", action="VIEW")`
- `DashboardMigrationOpsController:23`: `@PreAuthorize` 제거 + `@RequirePermission(page="dashboard.ecount-mig-ops", action="VIEW")` (MIG-21 기존 PageCode 재사용)
- `DashboardInternalController:46`: **변경 X** (internal endpoint)

---

## Task 5: FE permissionsApi.ts + PermissionMatrixPage

**Files:**
- Modify: `clients/desktop/src/renderer/api/permissionsApi.ts` — `PageCode` Union literal 5 신규 추가
- Modify: `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx` — `PAGE_GROUPS` 에 신규 그룹/항목 추가

### Step 5.1: permissionsApi.ts Union literal

```typescript
| 'system.permission-admin'
| 'system.password-admin'
| 'system.account-admin'
| 'dc-config.import'
| 'dashboard.admin'
```

### Step 5.2: PermissionMatrixPage 그룹

`PAGE_GROUPS` 배열에 추가:
```typescript
{
  label: '시스템 관리',
  pages: ['system.permission-admin', 'system.password-admin', 'system.account-admin'],
},
```

기존 "관리" 그룹에 `dc-config.import`, `dashboard.admin` 추가. (정확한 위치는 기존 그룹 정의 보고 결정)

---

## Task 6: BE IT 보강

**Files:**
- Create / Modify: `services/auth-service/src/test/java/.../web/PermissionAdminControllerIT.java` (또는 신규)
- Create / Modify: `services/dc-config-service/src/test/java/.../web/PartnerDcConfigsControllerIT.java`
- Create / Modify: `services/dashboard-service/src/test/java/.../controller/DashboardAdminControllerIT.java`

각 endpoint 별 테스트 케이스:
- (a) 매트릭스 권한 있는 role → 200
- (b) 매트릭스 권한 없는 role → 403
- (c) 매트릭스 row 미존재 시 정적 `@PreAuthorize` 통과 (system.* 만 해당)
- (d) `permission_guard_denied_total` Counter 증가 검증

---

## Task 7: 전체 검증

```powershell
$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'
.\gradlew.bat :services:auth-service:test :services:dc-config-service:test :services:dashboard-service:test :shared:security:test --no-daemon

cd clients/desktop
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

---

## Task 8: PR 발행

```
[FEAT] SP-D6-1 — auth + dashboard + dc-config @PreAuthorize → @RequirePermission 마이그레이션 (15 endpoint + 5 신규 PageCode + V29 seed)
```

---

## Self-Review

### Spec coverage
- [x] auth 6 endpoint (system.* PageCode 3종)
- [x] dc-config 3 endpoint (dc-config.import + sales.partner-dc-config 재사용)
- [x] dashboard 5 endpoint (dashboard.admin + ecount-mig-ops 재사용)
- [x] V29 seed bootstrap
- [x] FE permissionsApi.ts + PermissionMatrixPage
- [x] BE IT 보강

### Bootstrap 안전
- system.* PageCode 3종 → `@PreAuthorize("hasRole('MASTER')")` 유지 + V29 seed MASTER 보장
- 나머지 → `@PreAuthorize` 제거 (`@RequirePermission` 단독)

### Scope
SP-D6-1 = 작은 service 3개. 다음 슬라이스 SP-D6-2 (groupware + product 등) 는 별도 PR — 이는 **시리즈의 sub-slicing 진행** 이지 백로그 분리 X.
