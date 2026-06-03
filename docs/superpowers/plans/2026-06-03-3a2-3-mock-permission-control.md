# 3-A2-③ mock 권한제어 + RBAC 격리 재게이트 — 구현 계획

> spec: `docs/superpowers/specs/2026-06-03-3a2-3-mock-permission-control-design.md`. clients/desktop 단독.

**Goal:** `?mockPerms=` 메커니즘으로 page.route no-op 한계 해소 + A그룹 5스펙 verify-then-fix 재게이트.

**대원칙:** 프로덕션 React 무변경(mock.ts+스펙+config 만) / 단언약화·false-green 금지 / PM 직접 Playwright 검증.

---

## Task 1 (완료): mock 권한제어 메커니즘
- `mock.ts` `_resolveMockPerms()` (`?mockPerms=base64(JSON [{pageCode,view?,edit?}])` → window.location 기반) + `/permissions/my` 핸들러가 mockPerms 우선 적용(없으면 role 기반 회귀 0). tsc 0, 무회귀 확인.

## Task 2: A그룹 스펙 page.route → mockPerms 전환 (verify-then-fix)
대상 5: `admin-hr/admin-hr-guard`, `permission-overhaul/applayout`, `sp-d1-dynamic-rbac`, `sp-d2-accounting-permission-migration`, `sp-d3-slip-dispatch-permission-migration`.
- 각 스펙의 `page.route('**/...permissions/my', ...)` override 제거 → `page.goto(.../#/route?mockRole=X&mockPerms=<base64>)` 로 권한 시나리오 주입. base64 인코딩 헬퍼(인라인 `btoa(JSON.stringify(...))`).
- revoke = 해당 pageCode 제외/`view:false`, grant = 추가, dept = `?mockDepartment=`.
- selector/route 드리프트는 현 소스 testId 로 정밀 갱신(단언약화 금지).
- applayout fail-closed(응답 전 hidden): mockPerms 로도 응답 자체는 즉시 오므로, 현 프로덕션 게이팅 truth 확인 후 단언 재고정(OBSOLETE 면 현 동작 반영).
- sp-d2 false-green 가드 자기적발(이전 발견) 정밀화.

## Task 3: 재게이트 + 검증
- `playwright.config.ts` testIgnore 에서 5항목 제거.
- 🚨 PM 직접: `npx playwright test admin-hr permission-overhaul/applayout sp-d1 sp-d2 sp-d3 sp-d4 --reporter=line` 전량 PASS + skipped=0.
- 스펙별 green 안 되면 OBSOLETE/MOCK-GAP/REGRESSION 판정 → 현 truth 재고정 or 정직 재격리(사유 문서화).

## 위임 패턴
Codex(EPERM 로 Playwright 실행 불가 — 스펙 편집만) 가 Task 2 편집, **PM 이 실 Playwright 실행 검증**. 미green 스펙은 PM 직접 fix or Codex 재위임.

## 범위/한계
A그룹 우선 무결 완주. green 안 되는 스펙은 정직 재격리(B/C 와 함께 후속). 무리한 약화·false-green 금지.

## 자기검토
- mockPerms 부재 회귀 0(확인). 단언 약화 없이 RBAC 보장 보존. PM 실행 검증 의무(Codex 실행 불가).
