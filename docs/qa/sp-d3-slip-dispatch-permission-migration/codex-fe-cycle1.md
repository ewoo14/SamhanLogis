# Codex FE Review — SP-D3 PR #243 Cycle 1

대상 commit: `df337cdd`  
범위: `routes/index.tsx`, `AppLayout.tsx`, FE 권한 mock/read-only 검토

## 결론

**Cycle 2 진입 권고. FE 단독 결함과 BE/seed 연동 blocker가 함께 존재한다.**

## Findings

### F-FE-01 [BLOCKER] FE mock 기본 권한이 SP-D3 hidden 정책과 다르다

`clients/desktop/src/renderer/api/mock.ts` 의 VITE mock 권한이 SP-D3 시나리오/문서와 다르게 설정되어 있다.

- `SALES` 에 `dispatch.board` 포함: `mock.ts:5607`
- `WAREHOUSE` 에 `sales.slip.list` 포함: `mock.ts:5617`
- `WAREHOUSE` 에 `purchases.receipt-ocr` 없음: `mock.ts:5617`

Playwright spec 은 `/auth/admin/permissions/my` 를 테스트 내부에서 재정의하므로 이 문제가 가려진다. 개발/QA mock 환경에서는 사용자 요구 ②(SALES/WAREHOUSE/DISPATCH hidden, 각 역할 본인 카테고리만 표시)와 다른 메뉴/라우트 결과가 나온다.

### F-FE-02 [BLOCKER] `/dispatch-board` route guard 와 실제 BE 동적 guard 대상이 다르다

- FE route: `PermissionGuard pageCode="dispatch.board"` (`clients/desktop/src/renderer/routes/index.tsx:947`)
- 실제 page API: slip-service `/admin/dispatch-board/undispatched-slips` (`clients/desktop/src/renderer/api/dispatchBoard.ts:116`)
- SP-D3 BE 동적 `dispatch.board` 가드: arologis `DispatchAdminV1Controller`

FE 라우트 guard 자체는 추가됐지만, route 진입 후 쓰는 slip-service dispatch board/task API 에는 동적 row override 가 닿지 않는다. FE/BE contract 기준으로 `dispatch.board` PageCode 매핑이 불완전하다.

### F-FE-03 [IMPORTANT] `/sales` 와 `/purchases` 최상단 사이드바 링크는 여전히 무조건 노출된다

`AppLayout.tsx` 에서 `/sales`, `/purchases` 는 `NavLink` 로 항상 렌더링된다:

- `sidebar-sales`: `clients/desktop/src/renderer/components/AppLayout.tsx:317`
- `sidebar-purchases`: `clients/desktop/src/renderer/components/AppLayout.tsx:320`

SP-D3의 6개 마이그레이션 대상은 `/sales/slips`, `/purchases/slips` 이고, 최상단 `/sales`, `/purchases` 는 기존 SalesQuery/PurchaseQuery 엔트리라 범위 해석 여지는 있다. 다만 사용자 요구 ②를 "각 역할 본인 카테고리만 표시"로 엄격히 적용하면 WAREHOUSE에게 `판매관리`, DISPATCH에게 `판매관리/구매관리`가 노출되는 현재 IA는 hidden 보장을 충족하지 못한다.

### F-FE-04 [OK] 6개 route `PermissionGuard` pageCode 는 지정 라우트 기준으로 추가되어 있다

확인 라인:

- `/sales/slips` -> `sales.slip.list`: `routes/index.tsx:376`
- `/purchases/slips` -> `purchases.slip.list`: `routes/index.tsx:497`
- `/purchases/receipt-ocr` -> `purchases.receipt-ocr`: `routes/index.tsx:524`
- `/arologis/dispatch-sms/send-audit` -> `notification.dispatch-sms.send-audit`: `routes/index.tsx:932`
- `/dispatch-board` -> `dispatch.board`: `routes/index.tsx:947`
- `/warehouse/inbound-inspections` -> `inbound.inspection`: `routes/index.tsx:1297`

## FE Decision

**merge blocker.** FE route wrapping은 되어 있으나 mock 권한과 `/dispatch-board` BE contract 불일치가 남아 있다.
