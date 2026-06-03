# 3-A2-③ mock 권한제어 + RBAC 격리 재게이트 — 설계

> 3-A2-② revert 의 근본원인(VITE_MOCK_MODE in-process mock → Playwright `page.route` no-op)을 해소하는 mock 권한 시나리오 제어 메커니즘 + A그룹 RBAC 격리 스펙 재게이트. clients/desktop 단독(프로덕션 React 무변경).

## 근본원인 (3-A2-② 발견)

`client.ts` 가 mock 모드에서 `getMockResponse(config)` 를 in-process 직접 호출 → 실 HTTP 미발생 → Playwright `page.route`(네트워크 가로채기) 무효. sp-d1/d2/d3 가 `page.route` 로 `/permissions/my` 를 revoke/grant override 했으나 무효 → RBAC 시나리오 미재현 → 9 fail.

## 현 mock 인프라

- `_resolveMockRole()` — `window.location` 의 `?mockRole=` 읽어 역할 강제(이미 존재).
- `?mockDepartment=대표실` — isExecutiveOffice 부서 게이팅(이미 존재).
- `/permissions/my` 핸들러 — `MOCK_AUTH.role` + `_mockPermissionCells` 로 `Record<pageCode, UPPERCASE actions[]>` 반환.

## 메커니즘 (신규)

**`?mockPerms=` URL 파라미터** — mockRole 과 동일하게 `window.location` 기반(API config 아닌 page URL).

- `_resolveMockPerms(): Array<{pageCode, canView, canEdit}> | null` — `?mockPerms=` 를 base64(JSON) 디코드. 없으면 null.
- `/permissions/my` 핸들러: `mockPerms` 존재 시 그 권한셋을 **sp-d4 정답 shape** `{success, data:[{pageCode, canView, canEdit}]}` 로 반환(역할 기본 override). 없으면 기존 role 기반 유지(회귀 0).
- 이로써 spec 이 `page.goto(.../#/route?mockRole=SALES&mockPerms=<base64>)` 로 **revoke(특정 pageCode 제외)/grant(추가)/dept** 시나리오를 in-process mock 으로 재현. page.route 불요.
- 헬퍼: 스펙용 `encodeMockPerms(perms)` 유틸(공통 spec helper 또는 인라인).

## A그룹 재게이트 (verify-then-fix)

대상: `admin-hr/admin-hr-guard`, `permission-overhaul/applayout`, `sp-d1-dynamic-rbac`, `sp-d2-accounting-permission-migration`, `sp-d3-slip-dispatch-permission-migration`. (sp-d4 는 이미 통과·미격리.)

- 각 스펙의 `page.route('**/...permissions/my')` override → `?mockPerms=` URL 파라미터 방식으로 전환.
- 단언약화·false-green(`||true`/`test.skip(!ok)`/`setContent`) 금지. 현 소스/route/testId 진실로 정밀 갱신.
- `playwright.config.ts` testIgnore 에서 5항목 제거.
- 🚨 PM 직접 실 Playwright 실행 검증(Codex 샌드박스 EPERM — 구현은 Codex/PM 편집, 실행 검증은 PM).

## 검증

- 로컬 실 chromium: A그룹 5스펙 전량 PASS + skipped=0.
- CI Desktop Playwright 게이트 재게이트 확정.
- 프로덕션 React(src/renderer 비 mock) 무변경 — mock.ts(허용) + 스펙 + config 만.

## 범위/한계

- A그룹 우선 무결 완주. B그룹(sp-08-6-6/sp-09-1~5)·C그룹(tax-invoice-batch/supplier-profile/phase-2-5/phase-2-6c)은 동일 메커니즘으로 후속(시간 되면 추가, 아니면 정직 후속 분리 + handoff).
- mock.ts 변경은 테스트 인프라(권한 시나리오 주입)로, 프로덕션 권한 로직(PermissionGuard/usePermissions) 불변. 실 서버 동작과 독립.

## 자기검토

- mockPerms 부재 시 기존 role 기반 응답 유지(회귀 0).
- mockPerms shape = sp-d4 검증된 `{pageCode,canView,canEdit}`.
- 단언 약화 없이 RBAC 보장(redirect/hidden/역할헤더) 보존.
- false-green 가드(sp-d2 등) 자기적발 방지 유지.
