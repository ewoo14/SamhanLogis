# SP-D1 동적 RBAC — Codex Designer Cycle 1 Review

대상: PR #241, commit `1904b65e`  
범위: Section C + 구현 정합성 cross-check  
결론: **디자인 산출물 자체는 방향성 양호하나, 구현/문서 contract drift 때문에 승인 불가.**

## Findings

### MAJOR 1 — 디자인 결정 로그의 API/데이터 모델이 실제 BE/FE 구현과 다름

- 위치:
  - `docs/design/sp-d1-dynamic-rbac/decisions.md:71-72`
  - `docs/design/sp-d1-dynamic-rbac/decisions.md:152-154`
  - `services/auth-service/src/main/java/com/samhanair/logis/auth/web/PermissionAdminController.java:44-99`
  - `clients/desktop/src/renderer/api/permissionsApi.ts:108-141`

디자인 로그는 `/api/v1/rbac/matrix`, `/api/v1/rbac/me/pages` 를 기준으로 작성되어 있다. FE는 `/admin/permissions`, BE는 `/auth/admin/permissions` 를 구현했다. 화면 명세가 실제 contract의 기준 문서 역할을 하지 못한다.

권고: 디자인 결정 로그를 cycle 2 최종 API contract 기준으로 갱신해야 한다.

### MAJOR 2 — 4번 direct access 산출물이 구현 방향과 불일치함

- 위치:
  - `docs/design/sp-d1-dynamic-rbac/decisions.md:78-91`
  - `docs/qa/sp-d1-dynamic-rbac/screenshots/04-route-direct-access-blocked.html`
  - `clients/desktop/src/renderer/components/PermissionGuard.tsx:47-49`
  - `clients/desktop/src/renderer/components/RoleGuard.tsx`

디자인은 기존 ForbiddenPage 재활용과 403 표시를 결정했다. 하지만 새 `PermissionGuard`는 홈으로 redirect 하고, 실제 route는 대부분 `RoleGuard`를 유지한다. 산출물은 403 안내 화면을 보여주지만 구현은 URL 유지형 403/404도 아니고 동적 RBAC 가드도 아니다.

권고: direct URL UX를 `ForbiddenPage` 또는 URL 유지형 NotFound 중 하나로 확정하고 구현/QA/스크린샷을 같은 상태로 맞춰야 한다.

### MAJOR 3 — 스크린샷 HTML의 역할/페이지 체계가 BE seed와 다름

- 위치:
  - `docs/qa/sp-d1-dynamic-rbac/screenshots/01-permission-matrix-default.html:8`
  - `docs/qa/sp-d1-dynamic-rbac/screenshots/02-permission-matrix-edited.html:8`
  - `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:40-73`

스크린샷은 `MASTER / MANAGER / ACCOUNTANT / SALES / WAREHOUSE / DISPATCH / DRIVER` 같은 역할 설명과 카테고리형 페이지를 사용한다. BE seed는 `MASTER / MANAGER / ACCOUNTANT / SALES / WAREHOUSE / DISPATCH / INVENTORY` 및 dot-separated page code를 사용한다. FE mock은 또 `DEVELOPER`를 포함한다. 역할/페이지 IA가 산출물마다 다르다.

권고: SP-D1에서 실제 운영할 7역할 목록과 12 pageCode를 하나로 고정한 뒤 mock HTML/PNG를 재생성해야 한다.

### MINOR 1 — 디자인이 요구한 접근성 일부가 구현에 미반영

- 위치:
  - `docs/design/sp-d1-dynamic-rbac/decisions.md:100-113`
  - `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx:488-518`

디자인 로그는 `role="checkbox"`, `aria-checked`, `scope` 헤더, `role="status"`/`alert` 변경 알림을 요구한다. 실제 구현은 native checkbox라 기본 접근성은 있으나, sticky table scope와 변경 카운트 live region 등은 명세만큼 반영되지 않았다.

## Positive Notes

- 메뉴 hidden UX 원칙은 명확하다. `display:none`/조건부 렌더링, 카테고리 헤더 동시 미렌더 방향은 사용자 요구와 맞다.
- dirty state, 저장 버튼 활성/비활성, MASTER 전권 시각 구분은 운영자가 이해하기 쉬운 방향이다.

## Designer Decision

**APPROVE 불가.**  
디자인 산출물은 독립 mock으로는 충분하지만, BE/FE 계약과 역할/페이지 체계가 drift 되어 있다. cycle 2에서 실제 구현 contract 기반으로 decisions + screenshots 재생성이 필요하다.
