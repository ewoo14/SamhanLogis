---
name: feedback_pgc_c2_widening_option_a
description: 권한그룹 Phase C2 FE 가드 widening 정책 = Option A(seed 진실원 수용) — 개발책임자 2026-06-06
metadata:
  type: feedback
---

권한그룹 Phase C2(FE RoleGuard→PermissionGuard 전환)에서 일부 RoleGuard 가 seed grant 보다 **제한적**(예: `AUDIT_ROLES=[WAREHOUSE,MASTER]` vs `inventory.audit` seed=`MASTER/MANAGER/ACCOUNTANT/WAREHOUSE/INVENTORY`)이라, RoleGuard 제거 시 seed 에만 있는 role 이 UI 노출 = product-level widening.

**개발책임자 결정(2026-06-06) = Option A: seed 를 단일 진실원으로 수용.** → DECISIONS **D-PGC-01**.

**Why**: BE API(`@RequirePermission` + materialized `account_page_permissions`)는 **이미 해당 role 에 열려 있어** 보안 신규 노출 아님(FE 가드는 UX 차단일 뿐). RoleGuard 제거 = FE 를 이미 허용적인 BE/seed 에 정합. 동적 권한그룹(Phase A/B) 철학 = 그룹/seed grant 가 단일 신원. #387 inventory Option A(D-PAM-05) 연장.

**How to apply**:
- C2 슬라이스에서 RoleGuard 제거는 widening 이어도 **자율 진행**(개발책임자 사전 승인 받음). 단 각 라우트의 BE seed 가 실제로 그 role 에 grant 인지 확인(BE 가 닫혀 있는데 FE 만 열면 진짜 widening — 그건 별개).
- widening 수용은 [[feedback_pm_permission_autonomy]] 의 "멈춤=신규 정책" 예외였으나 C2 한정 사전 승인됨.

관련: [[feedback_pm_permission_autonomy]], [[feedback_preauth_migration_lessons]], [[feedback_fe_guard_removal_contract_tests]].
