# 동적 권한그룹 Phase C2a — redundant 외부 RoleGuard 제거 (FE 단일 게이트화)

> 2026-06-06. PM 전권([[feedback_pm_permission_autonomy]]). Phase C(고정역할 완전제거) C1 머지(#400) 후속.
> 상위 spec: `2026-06-05-permission-groups-phase-c-fixed-role-removal-design.md` §4 C2.

## 1. 배경 / 목표
desktop 클라이언트에 정적 역할 가드 `RoleGuard`(99 사용처)와 동적 권한 가드 `PermissionGuard`(page-code 기반)가 공존. 대부분 라우트가 **이중 가드**(`<RoleGuard allow={ROLES}><PermissionGuard pageCode=...>`) 형태. 동적 권한그룹 철학(Phase A/B)상 **seed/그룹 grant 가 단일 진실원**이므로, 이미 PermissionGuard 로 덮인 라우트의 **외부 RoleGuard 는 redundant** → 제거하여 PermissionGuard 를 단일 게이트로.

## 2. 개발책임자 결정 (2026-06-06) — Option A (widening 수용)
일부 RoleGuard 가 seed grant 보다 **제한적**(예: `AUDIT_ROLES=[WAREHOUSE,MASTER]` vs `inventory.audit` seed=`MASTER,MANAGER,ACCOUNTANT,WAREHOUSE,INVENTORY`). RoleGuard 제거 시 seed 에만 있는 role 이 UI 노출 = product-level widening. **BE API 는 이미 해당 role 에 열려 있어 보안 신규 노출 아님**(FE↔BE 정합). 개발책임자 **Option A 결정 = seed 를 진실원으로 수용**(#387 inventory Option A 선례, D-PAM-05 연장). → DECISIONS **D-PGC-01**.

## 3. scope (C2a)
**대상**: `clients/desktop/src/renderer/routes/index.tsx` 에서 `<RoleGuard allow={...}>` 가 **내부 `<PermissionGuard>` 를 감싸는** 모든 라우트(~75). 외부 RoleGuard wrapper 만 제거(PermissionGuard·children 불변).
- 정확일치(①): accounting.accounts/journals/balances/reports/general-ledger/period-close/daily-closing(`ACCOUNTING_ROLES`==seed), dispatch.board, partners.block, system.permission-admin(PERMISSION_MATRIX_ROLES) 등 → behavior-preserving.
- widening(②): inventory.audit, inbound.inspection, sales.partner-order.list/estimates, accounting.tax-invoice.list/sales-slip.list 등 → Option A 수용(seed 진실원).
- 제거 후 **미사용 ROLES 상수** 정리(eslint no-unused 회피).

**비대상(별도 슬라이스)**:
- C2b: RoleGuard 단독(PermissionGuard 미병행) gap 라우트 → page-code 전환.
- C2c: 상세페이지 액션 버튼 ROLES(SlipDetailPage/SalesPartnerOrderDetailPage/SalesQueryPage), AdminLayout 부서(EXECUTIVE_OFFICE) 가드.

## 4. behavior-preserving 검증 / 위험
- **API enforcement 불변**: BE `@RequirePermission` + materialized `account_page_permissions` 가 진짜 게이트. FE 가드는 UX 차단일 뿐. 본 변경은 FE-only.
- widening 라우트는 product 동작 변화 → **Docker 실QA 로 실증**(비-MASTER 계정으로 신노출 페이지 접근 가능 확인 — 단, dev seed 비번 한계 시 정적+DB 증명 대체, [[feedback_no_fake_data_ever]] 준수).
- MASTER bypass·seed 불변. 락아웃 없음.

## 5. 검증 절차
1. `npm run typecheck`(tsconfig.node+web, [[feedback-desktop-typecheck-command]]) 0 error.
2. Playwright 회귀: sidebar-disabled, permission-overhaul, sp-d1, sp-d4 (route 가드 영향 스펙).
3. dual review(Claude 5-agent + Codex) N=2.
4. Docker 실QA: 실 gateway/실 DB 로 widening 라우트 노출 검증.
5. dev-report `slice-phase-c2a-roleguard-removal.md`, DECISIONS D-PGC-01, README/ROADMAP 동기화([[feedback_continuous_docs_sync]]).

## 6. 산출물
- `routes/index.tsx` RoleGuard wrapper 제거 + ROLES 상수 정리.
- spec(본 문서)/dev-report/DECISIONS/QA evidence.
