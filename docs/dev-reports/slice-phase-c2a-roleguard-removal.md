# dev-report — Phase C2a: redundant 외부 RoleGuard 제거 (FE 단일 게이트화)

> 2026-06-06. 동적 권한그룹 Phase C(고정역할 완전제거) §4 C2 의 첫 슬라이스. PM 전권([[feedback_pm_permission_autonomy]]).
> spec: `docs/superpowers/specs/2026-06-06-permission-groups-phase-c2a-roleguard-removal-design.md`

## 1. 무엇을 했나
desktop `routes/index.tsx` 에서 **내부 `PermissionGuard` 를 이미 감싸던 외부 `RoleGuard` wrapper 75건 제거** → `PermissionGuard`(seed/그룹 grant 기반)가 단일 라우트 게이트.
- 미사용 ROLES 상수 정리: 로컬 8건(AUDIT_ROLES/INBOUND_INSPECTION_ROLES/SALES_PARTNER_ORDER_ROLES/TRANSFER_CREATE_ROLES/RECEIPT_OCR_ROLES/BLOCKED_PARTNER_ROLES/DISPATCH_BOARD_ROLES/PERMISSION_MATRIX_ROLES) + import 11건 제거.
- `RoleGuard` import 는 단독 RoleGuard 라우트 22건이 남아 **유지**(C2b 대상).
- diff: 237++/460-- (순 -223 라인).

## 2. 개발책임자 결정 — Option A (widening 수용) / D-PGC-01
일부 RoleGuard 가 seed grant 보다 제한적(예: `AUDIT_ROLES=[WAREHOUSE,MASTER]` vs `inventory.audit` seed=MASTER/MANAGER/ACCOUNTANT/WAREHOUSE/INVENTORY)이라 제거 시 seed 에만 있는 role 의 UI 노출 = product-level widening. **BE API 는 이미 해당 role 에 열려 있어 보안 신규 노출 아님**(FE↔BE 정합). 개발책임자 **Option A = seed 진실원 수용**(2026-06-06, #387 inventory Option A 선례 연장).

## 3. behavior-preserving 경계
- **API enforcement(BE @RequirePermission + materialized account_page_permissions) 완전 불변** — FE-only 변경.
- MASTER 전용 라우트(예: `/admin/permission-groups/delegation` = `system.permission-admin`)는 RoleGuard 제거 후에도 PermissionGuard(MASTER-only)가 비-MASTER 차단 유지. **접근 차단 동일, UX 만 변경**(RoleGuard 안내 메시지 → 홈 redirect/404 효과).
- 비대상(후속): C2b(RoleGuard 단독 gap 라우트 22), C2c(상세페이지 버튼 ROLES + AdminLayout 부서 가드).

## 4. 검증 (실 실행)
- `npm run typecheck`(tsconfig.node+web) **0 error** ([[feedback-desktop-typecheck-command]]).
- Playwright mock 회귀(로컬 실행, chromium): **sidebar-disabled 5 + sp-d1 6 + sp-d4 20 + permission-groups 5 = 36 passed**.
- **🔴 실 회귀 적발·수정**: `permission-delegation.spec.ts` "비-MASTER 직접 접근 차단" 이 RoleGuard 안내 메시지("접근 권한이 없습니다")를 단언했으나 C2a 로 PermissionGuard 홈 redirect 로 동작 변경 → 테스트를 **redirect 단언**(`perm-delegation-page` hidden + hash 가 delegation 미포함)으로 갱신. **접근 차단 자체는 보존**(MANAGER 여전히 차단). → 핸드오프 교훈 "실행이 정적리뷰를 이긴다" 재확인([[feedback_preauth_migration_lessons]]).
- 전체 mock 회귀 suite: (CI 게이트에서 최종 확인).

## 5. 환경 메모
- 로컬 Playwright 최초 실행 시 `npx playwright`(전역 1.60.0)와 설치본(@playwright/test 1.59.1) 버전 skew 로 "did not expect test.describe()" 발생. → **`node_modules/.bin/playwright`(로컬 1.59.1) 직접 호출**로 해결. trio(@playwright/test·playwright·playwright-core) 1.59.1 정렬 필요.

## 6. 산출물
- `clients/desktop/src/renderer/routes/index.tsx` (RoleGuard 75 제거 + 상수 정리)
- `clients/desktop/playwright/permission-groups/permission-delegation.spec.ts` (redirect 단언 갱신)
- spec / 본 dev-report / DECISIONS D-PGC-01 / handoff
