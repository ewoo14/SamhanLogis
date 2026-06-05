---
name: feedback_fe_guard_removal_contract_tests
description: FE 정적 가드(RoleGuard) 제거 시 구 가드 UX/구조 박제 테스트가 여러 슬라이스에 흩어져 깨짐 — 전체 mock suite 필수
metadata:
  type: feedback
---

desktop `routes/index.tsx` 의 정적 `RoleGuard` 를 동적 `PermissionGuard` 로 전환/제거할 때(권한그룹 Phase C2), **정적 dual review APPROVE 후에도 전체 Playwright mock suite 실행이 박제 테스트 결함을 적발**한다(C2a PR #402: 핵심 36 스펙 green 인데 전체 suite 4건 추가 실패).

**Why**: 두 부류가 routes/index.tsx 의 구 가드를 박제:
1. **행위 박제** — RoleGuard 안내 메시지("접근 권한이 없습니다"/"권한 보유자만") 단언. 제거 후 PermissionGuard 는 홈 redirect(404 효과)라 메시지 미노출 → 실패. (permission-delegation, sp-d2 T5.)
2. **소스 계약 박제** — `fs.readFileSync('routes/index.tsx')` 후 `toMatch(/<RoleGuard allow={X}>...<Page/>/)` 또는 `toContain("const X_ROLES = [...]")`. 구 구조·상수 제거 → 실패. **여러 슬라이스에 흩어져** routes/index.tsx 참조(accounting-close-menu-gap, partner-ui-menu-gap, sp-08-4-4) → 핵심 스펙만 돌리면 놓침.

**How to apply**:
- FE 가드 변경 슬라이스는 **반드시 전체 mock suite**(필터 없이) 실행. 핵심 라우트 가드 스펙(sidebar/sp-d1/sp-d4/permission-groups)만으론 불충분.
- 깨진 테스트는 **접근 차단 보존 먼저 확인**(비-grant role 여전히 redirect/차단=widening 0) 후, 단언을 신 동작(PermissionGuard redirect)·신 구조(`pageCode="..."`)로 갱신 = 약화 아닌 **계약 갱신**.

관련: [[feedback_preauth_migration_lessons]], [[feedback_desktop_typecheck_command]], [[feedback_playwright_local_version_skew]].
