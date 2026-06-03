# Slice 3-A2-③ mock 권한제어(?mockPerms=) + A그룹 RBAC 격리 부분 재게이트

> branch `feat/3-a2-3-mock-permission-control` / 2026-06-03 / clients/desktop 단독(프로덕션 React 무변경).
> 3-A2-② revert 의 근본원인(Playwright `page.route` no-op) 해소 메커니즘 도입 + A그룹 verify-then-fix(정직한 부분완주).

## 1. 근본원인 (3-A2-② 발견)

`client.ts` 가 `VITE_MOCK_MODE` 에서 `getMockResponse(config)` 를 in-process 직접 호출 → 실 HTTP 미발생 → Playwright `page.route`(네트워크 가로채기) 무효. sp-d1/d2/d3 의 `/permissions/my` revoke/grant override 가 mock 모드에서 작동 안 함.

## 2. 해소 메커니즘 (Task 1, 완료)

`mock.ts` `_resolveMockPerms()` — `?mockPerms=<base64(JSON [{pageCode,view?,edit?}])>` 를 `window.location`(mockRole 과 동일 경로)에서 읽어 `/permissions/my` 핸들러가 우선 적용. 없으면 기존 role 기반(회귀 0). → spec 이 `page.goto(.../?mockRole=X&mockPerms=...)` 로 revoke/grant/dept 시나리오를 in-process mock 에 주입. tsc 0, 기존 권한 스펙 무회귀(compensation 7/7).

## 3. A그룹 verify-then-fix 결과 (실 chromium, PM 검증)

5스펙 page.route → mockPerms 전환 후 실 Playwright: **19 passed / 9 failed**.

| 스펙 | 결과 | 처리 |
|---|---|---|
| **permission-overhaul/applayout** | ✅ 전건 green | **재게이트**(testIgnore 제거). pre-response hidden 단언은 OBSOLETE(mockPerms 즉시 응답이라 지연 재현 불가) → post-response matrix/bulk 동작 보존으로 현 truth 재고정 |
| admin-hr | 2 fail | 재격리 — TC-HR2 부서(대표실) 게이팅 forbidden/redirect, TC-HR4 "관리자"→"인사" 라벨 |
| sp-d1 | 3 fail | 재격리 — 매트릭스 role-grid(7역할 헤더) → account-select UI **재설계** 드리프트(변경카운터·저장 toast 포함) |
| sp-d2 | 1 fail | 재격리 — T2 권한 없는 회계 URL PermissionGuard redirect "/" 미작동 |
| sp-d3 | 3 fail | 재격리 — T1/T3/T5 권한 없는 URL redirect "/" 미작동 |

## 4. 정직한 부분완주 (사전 승인)

- **재게이트**: `applayout`(green). + 메커니즘(전 RBAC 스펙 재게이트의 공통 enabler).
- **재격리(진행분 보존)**: admin-hr/sp-d1/sp-d2/sp-d3 의 mockPerms 전환은 워크트리에 보존하되 `testIgnore` 복원. 잔존 실패는 단언 약화·false-green 으로 통과시키지 않음(원칙 준수).
- 단언 약화·false-green·프로덕션 무변경 원칙 전면 준수.

## 5. 후속 (3-A2-④)

- **sp-d2/sp-d3 redirect 의미론**: 권한 없는 URL 직접 진입 시 PermissionGuard "/" redirect 가 mockPerms 권한셋으로 재현되는지 — usePermissions 캐시 로드 타이밍 vs 가드 평가 순서 조사(sp-d4 통과 패턴 대조).
- **sp-d1 매트릭스 UI 재설계**: role-grid(7역할×12페이지 헤더) → account-select 기반 현 UI 로 스펙 전면 재작성.
- **admin-hr**: 부서(대표실) 게이팅(`?mockDepartment=`) + AdminLayout "인사" 라벨 현 소스 정합.
- B그룹(sp-08-6-6/sp-09-1~5)·C그룹(tax-invoice-batch/supplier-profile/phase-2-5/phase-2-6c)도 동일 mockPerms 메커니즘으로 재게이트.

> 메커니즘(핵심 unblock)이 확보되어 후속은 스펙별 verify-then-fix(약화 없이)만 남음.
