# Codex Designer Review — SP-D3 PR #243 Cycle 1

대상 commit: `df337cdd`  
범위: sidebar hidden/visible UX, PermissionGuard redirect UX, role category exposure read-only 검토

## 결론

**Cycle 2 진입 권고. 사용자 요구 ② hidden 보장 관점에서 blocker가 있다.**

## Findings

### F-Designer-01 [BLOCKER] 기본 권한 seed/mock 기준으로 SALES/WAREHOUSE 메뉴 노출이 기대 UX와 다르다

SP-D3 문서와 시나리오는 역할별 본인 카테고리 노출을 요구한다.

- SALES: 매출 중심, 매입/배차 hidden
- WAREHOUSE: 매입/OCR/입고 검수 중심, 매출/배차 hidden
- DISPATCH: 배차/SMS 중심, 매입/매출 hidden

하지만 기본 데이터 기준으로는 다음 노출이 발생한다.

- V7 DB: `SALES dispatch.board canView=TRUE` (`V7__add_role_page_permissions.sql:118`)
- V7 DB: `WAREHOUSE sales.slip.list canView=TRUE` (`V7__add_role_page_permissions.sql:130`)
- FE mock: `SALES` 에 `dispatch.board` 포함 (`clients/desktop/src/renderer/api/mock.ts:5607`)
- FE mock: `WAREHOUSE` 에 `sales.slip.list` 포함 (`mock.ts:5617`)

이 상태에서는 사이드바 hidden/visible 경험이 테스트 mock과 운영 seed 사이에서 달라질 수 있다. 특히 `AppLayout` 의 `showDispatchBoard` 는 `dynamicCanAccess('dispatch.board', 'view')` 단독 의존이라 seed 값이 곧 메뉴 노출로 이어진다: `clients/desktop/src/renderer/components/AppLayout.tsx:306`.

### F-Designer-02 [IMPORTANT] 최상단 `판매관리` / `구매관리`는 role-aware hidden 대상이 아니다

`AppLayout.tsx` 는 최상단 메뉴를 항상 노출한다.

- `판매관리`: `clients/desktop/src/renderer/components/AppLayout.tsx:317`
- `구매관리`: `clients/desktop/src/renderer/components/AppLayout.tsx:320`

SP-D3 범위를 `/sales/slips`, `/purchases/slips` 하위 페이지로 한정하면 허용 가능하지만, 사용자 요구 ②를 UX 문구 그대로 적용하면 DISPATCH 사용자는 판매/구매 entry 자체가 보이지 않아야 한다. 이 요구사항 해석을 cycle 2에서 명확히 해야 한다.

### F-Designer-03 [OK] PermissionGuard redirect UX 는 SP-D1/D2 패턴을 유지한다

권한 없는 route 직접 진입 시 홈(`/`) redirect 를 기대하는 Playwright T1/T4/T5 시나리오가 있다. 이 동작은 SP-D1/D2의 사용자 혼란 최소화 패턴과 일관된다.

## Designer Decision

**merge blocker.** UI 구조보다 권한 데이터/contract 불일치가 UX hidden 보장을 깨는 상태다. V9 및 FE mock 정합화 후 재검토 필요.
