# Codex Designer Review — SP-D2 cycle 1

대상: PR #242 `feat/sp-d2-accounting-permission-migration` @ `8090c109`  
관점: 사용자 노출/hidden UX/권한 매트릭스 화면 일관성

## TM 판정

**cycle 2 진입 권고 — hidden UX 요구 미충족 가능성이 높음.**

## Findings

### Blocker 1 — 회계 그룹이 권한 없음 상태에서도 남을 수 있다

- `SidebarLink` 는 `show=false` 일 때 `return null` 로 완전 미노출 처리한다.
  - `clients/desktop/src/renderer/components/AppLayout.tsx:98`
- 그러나 회계 그룹 자체는 `showAccounting` 이 정적 fallback 을 OR 한다.
  - `clients/desktop/src/renderer/components/AppLayout.tsx:220`
  - `clients/desktop/src/renderer/components/AppLayout.tsx:226`
- `showAccounting` 이 true 이면 회계 섹션 렌더 경로로 들어간다.
  - `clients/desktop/src/renderer/components/AppLayout.tsx:430`
- `sidebar-accounting-sales-closing` 은 개별 PageCode 없이 `showAccounting` 에 묶여 있어, 동적 권한이 전부 false 여도 보일 수 있다.
  - `clients/desktop/src/renderer/components/AppLayout.tsx:569`

영향: 사용자 요구 ② "hidden 보장" 은 단순 disabled 회피뿐 아니라 권한 없는 정보 구조 자체를 숨기는 요구다. 현재 구조는 ACCOUNTANT/MANAGER/MASTER 권한 전부 revoke 같은 운영 시나리오에서 회계 카테고리 잔존 가능성이 있다.

권고: 로딩 중 skeleton/임시 허용과 로딩 완료 후 hidden 판정을 분리한다. 회계 그룹은 로딩 완료 후 동적 child show 값만 기준으로 렌더해야 한다.

### Major 1 — QA 문구와 실제 UI 정책이 다르다

- Playwright T3 주석은 `tax-invoice.list` revoke 시 계정과목/분개장 hidden 을 말한다.
  - `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts:552`
  - `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts:560`
- 하지만 실제 route/AppLayout 은 계정과목과 분개장을 각각 `accounting.accounts`, `accounting.journals` 로 본다.
  - `clients/desktop/src/renderer/components/AppLayout.tsx:207`
  - `clients/desktop/src/renderer/components/AppLayout.tsx:208`
  - `clients/desktop/src/renderer/routes/index.tsx:543`

영향: QA 캡처가 통과해도 사용자가 보는 hidden 정책을 올바르게 검증하지 않는다.

권고: 메뉴별 PageCode 기준으로 "권한 없음 -> 메뉴 미노출 -> URL 직접 접근 redirect" 스토리를 다시 나눈다.

### Pass Notes

- MASTER 행 편집 불가/전권 표시는 `PermissionMatrixPage` 에서 명시되어 있고, 사용자에게 UUID 대신 roleCode/pageCode 비즈니스 식별자를 보여주는 방향은 유지된다.
- `SidebarLink` 는 disabled 회색 노출이 아닌 조건부 미렌더링 패턴이라, fallback 제거 후에는 hidden UX 요구에 맞는 구조다.
