# SP-D6-1 — auth + dashboard + dc-config @PreAuthorize → @RequirePermission 마이그레이션 설계

> SP-D5 (PR #247) 가 인프라 (shared:security `@RequirePermission` AOP + PermissionGuardMetrics Counter) + 시범 10 endpoint (accounting.reports) 완성.
>
> SP-D6+ 점진 마이그레이션 시리즈의 **첫 슬라이스** — 작은 service 3개 (dc-config + dashboard + auth) 의 RBAC 가드 endpoint 를 `@RequirePermission` 으로 일괄 이행.

## 1. 목표

1. **15 endpoint 변환** — 3 service 의 RBAC 가드 `@PreAuthorize("hasAnyRole(...)")` 패턴을 `@RequirePermission(page, action)` AOP 로 교체.
2. **5 신규 PageCode** — `system.permission-admin`, `system.password-admin`, `system.account-admin`, `dc-config.import`, `dashboard.admin`.
3. **V29 Flyway seed (auth-service)** — 신규 PageCode 별 MASTER view+edit + bootstrap 보장 (RBAC self-dependency 해소).
4. **2 기존 PageCode 재사용** — `sales.partner-dc-config`, `dashboard.ecount-mig-ops` (MIG-21 산출).
5. **5 RBAC 무관 endpoint 변환 X** — `isAuthenticated()` × 3, `hasRole('INTERNAL')` × 2 (service-to-service token).

## 2. Bootstrap 안전 정책 (auth-service self-dependency)

**문제**: `PermissionAdminController` 의 endpoint 는 RBAC 매트릭스를 관리한다. 만약 이 endpoint 가 `@RequirePermission(page="system.permission-admin")` 으로만 보호되고 매트릭스가 비어있으면 → MASTER 라도 lockout.

**해결책** (이중 가드):
- `@PreAuthorize("hasRole('MASTER')")` 정적 가드 **유지** (1차, 코드 레벨)
- `@RequirePermission(page="system.permission-admin", action="VIEW")` AOP 추가 (2차, 매트릭스 레벨)
- V29 seed 가 매트릭스에 MASTER view+edit 항상 보장 (멱등)
- `permission_guard_denied_total{role=MASTER, page=system.*}` Counter 가 0 이어야 함 (Grafana alert)

이 정책 = "static gate + dynamic override" — MASTER 정적 통과 후 매트릭스 비활성화 시도해도 V29 seed 가 즉시 복구.

## 3. 변환 매트릭스

### 3.1 auth-service (6 endpoint, 신규 PageCode 3)

| File:Line | 현재 | 신규 |
|---|---|---|
| `AuthController:40` | `@PreAuthorize("hasRole('MASTER')")` | `@PreAuthorize("hasRole('MASTER')") + @RequirePermission(page="system.account-admin", action="VIEW")` |
| `PasswordController:97` | `@PreAuthorize("hasRole('MASTER')")` | `+ @RequirePermission(page="system.password-admin", action="EDIT")` (admin reset, EDIT 의미) |
| `PermissionAdminController:68` | `@PreAuthorize("hasRole('MASTER')")` | `+ @RequirePermission(page="system.permission-admin", action="VIEW")` (GET matrix) |
| `PermissionAdminController:84` | 동일 | `+ @RequirePermission(page="system.permission-admin", action="EDIT")` (POST batch) |
| `PermissionAdminController:102` | 동일 | `+ @RequirePermission(page="system.permission-admin", action="EDIT")` (POST single) |
| `PermissionAdminController:122` | 동일 | `+ @RequirePermission(page="system.permission-admin", action="EDIT")` (DELETE) |

**변환 X**: `PasswordController:86` (`isAuthenticated()`), `PermissionAdminController:143/165` (`isAuthenticated()`), `PermissionInternalController:33` (`hasRole('INTERNAL')`).

### 3.2 dc-config-service (3 endpoint)

| File:Line | 현재 | 신규 |
|---|---|---|
| `DcConfigImportController:54` | `@PreAuthorize("@hr.isExecutiveOffice() and hasRole('MASTER')")` | **유지** (`@hr.isExecutiveOffice()` 비-RBAC 추가 검사) + `@RequirePermission(page="dc-config.import", action="EDIT")` |
| `PartnerDcConfigsController:48` | `@PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")` | `@RequirePermission(page="sales.partner-dc-config", action="VIEW")` (`@PreAuthorize` 제거) |
| `PartnerDcConfigsController:65` | `@PreAuthorize("hasAnyRole('MANAGER','MASTER')")` | `@RequirePermission(page="sales.partner-dc-config", action="EDIT")` (`@PreAuthorize` 제거) |

### 3.3 dashboard-service (5 변환 + 1 변환 X)

| File:Line | 현재 | 신규 |
|---|---|---|
| `DashboardAdminController:53` | `@PreAuthorize("hasAnyRole('MASTER','MANAGER')")` | `@RequirePermission(page="dashboard.admin", action="VIEW")` |
| `DashboardAdminController:76` | 동일 | 동일 |
| `DashboardAdminController:97` | 동일 | 동일 |
| `DashboardAdminController:123` | 동일 | 동일 |
| `DashboardMigrationOpsController:23` | `@PreAuthorize("hasAnyRole('MASTER','MANAGER','ACCOUNTANT')")` | `@RequirePermission(page="dashboard.ecount-mig-ops", action="VIEW")` (MIG-21 기존 PageCode 재사용) |
| `DashboardInternalController:46` | `@PreAuthorize("hasRole('MASTER')")` | **유지** (internal endpoint, RBAC 무관) |

## 4. Flyway V29 (auth-service)

```sql
-- V29__seed_sp_d6_1_page_codes.sql
-- SP-D6-1 system.* + dc-config.import + dashboard.admin PageCode seed

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    -- system.permission-admin (RBAC 매트릭스 관리)
    (gen_random_uuid(), 'MASTER', 'system.permission-admin', TRUE, TRUE, NOW(), 'system', FALSE),

    -- system.password-admin (admin reset password)
    (gen_random_uuid(), 'MASTER', 'system.password-admin', TRUE, TRUE, NOW(), 'system', FALSE),

    -- system.account-admin (account management)
    (gen_random_uuid(), 'MASTER', 'system.account-admin', TRUE, TRUE, NOW(), 'system', FALSE),

    -- dc-config.import (DC config import, MASTER + 대표실 별도 검사)
    (gen_random_uuid(), 'MASTER', 'dc-config.import', TRUE, TRUE, NOW(), 'system', FALSE),

    -- dashboard.admin (대시보드 admin)
    (gen_random_uuid(), 'MASTER', 'dashboard.admin', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'dashboard.admin', TRUE, TRUE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
```

## 5. PageCode enum 추가 (auth-service)

`services/auth-service/.../domain/PageCode.java` 에 5 신규 enum:

```java
SYSTEM_PERMISSION_ADMIN("system.permission-admin"),
SYSTEM_PASSWORD_ADMIN("system.password-admin"),
SYSTEM_ACCOUNT_ADMIN("system.account-admin"),
DC_CONFIG_IMPORT("dc-config.import"),
DASHBOARD_ADMIN("dashboard.admin");
```

## 6. FE 영향

- `permissionsApi.ts` Union literal 에 5 신규 PageCode 추가
- `PermissionMatrixPage.tsx` 의 `PAGE_GROUPS` 에 신규 그룹 추가:
  - "시스템 관리" (`system.permission-admin`, `system.password-admin`, `system.account-admin`)
  - 기존 그룹 (`관리`) 에 `dc-config.import`, `dashboard.admin` 추가
- MASTER 외 role 은 `system.*` PageCode UI 에 표시되지 않거나 회색 (체크 불가) — 사용자 혼란 방지

## 7. 권한 매트릭스 결과

| Role | system.permission-admin | system.password-admin | system.account-admin | dc-config.import | dashboard.admin |
|---|---|---|---|---|---|
| MASTER | view+edit | view+edit | view+edit | view+edit | view+edit |
| MANAGER | — | — | — | — | view+edit |
| 기타 | — | — | — | — | — |

## 8. Testing

- BE IT: 각 endpoint 별 (a) MASTER 통과 (b) 비-MASTER 403 (c) 매트릭스 row 없음 시 정적 가드 통과 (d) AOP Counter 증가
- `:shared:security:test` 회귀 0
- `:services:auth-service:test` 신규 PageCode IT
- `permission_guard_denied_total` metric 증가 검증 (`@Counted`)

## 9. 메모리 가드 준수

- `feedback_korean_commits`: 한국어 commit/PR
- `feedback_no_backlog_strict`: SP-D6-1 안 모든 변환 endpoint 처리, 잔여 SP-D6-2/3 으로 분리는 **scope 분리** (백로그 분리 X — 동일 시리즈의 다음 슬라이스 진행)
- `feedback_dual_5agent_review`: 사이클 1 (Claude+Codex) N=3 내 완료
- `feedback_continuous_docs_sync`: spec + plan + dev-report

## 10. 잔존 결정

- `@PreAuthorize` 유지 vs 제거: `system.*` 3 PageCode 는 정적 가드 유지 (bootstrap 안전). 나머지 (dashboard.admin / sales.partner-dc-config / dashboard.ecount-mig-ops) 는 `@PreAuthorize` 제거 — `@RequirePermission` 단독 가드 (SP-D5 시범 패턴 일치).
