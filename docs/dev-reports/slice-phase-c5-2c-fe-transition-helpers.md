# dev-report — Phase C5-2c: FE 잔여 인가 헬퍼(hasAdminRole/canTransition*) → canAccess

> 2026-06-06. 개발책임자 "FE 폴리시 자율 진행" 선택. C5-2b(#409) 후 FE role 의존 마무리.

## 1. 무엇을 했나 (FE-only, 저위험)
session.ts 잔여 인가 헬퍼 3종을 action별 `usePermissions().canAccess(pageCode, action)` 로 이관(BE @RequirePermission 정밀 대조).
- **hasAdminRole** → `canAccess('inventory.warehouse.admin','create')`(WarehouseController). DEVELOPER 제외(원래 FE>BE, seed 미grant → 정합 교정).
- **canTransitionSlip** → `slipActionPageCode(action)`: save/send→sales.slip.edit, accept/process/inspect/complete/ship/deliver→slip.transfer.process, confirm→sales.slip.confirm, reject→slip.reject, cancel→sales.slip.cancel (전부 update, SlipController 대조). exhaustive switch.
- **canTransitionTransfer** → `transferActionPageCode(action)`: approve/reject/confirm/cancel→inventory.adjust, ship/receive→inventory.transfer (StockTransferController 대조).
- mock 카탈로그 5 page-code 보강(seed V35/V36 정확, 과다 grant 0).

## 2. dual review 적발·수정
- **P1**(Codex): 하단 삭제 버튼이 `possibleActions.includes('cancel')` 만 보고 canAccess 미확인 → FE 노출/BE 403 가능. → `canAccess('sales.slip.cancel','update')` 가드 추가(disabled+title).
- **P2**: session.ts EOF blank line 제거.
- Claude APPROVE(전 매핑 BE 일치, exhaustive, mock seed 정확).

## 3. 검증
- typecheck/lint 0. 전체 mock suite **418 passed / 0 fail**(source-contract 무파괴). slip 삭제 스펙 10 passed.

## 4. 잔여 = C5 최종 cutover (개발책임자 입회)
- C4-3(role 폴백 제거) · PARTNER/arologis 신원 정책(그룹 밖, 신규 정책) · X-User-Role/role 클레임/accounts.role 제거(총 락아웃 위험). 계획서 §7.
- (참고) mock 5 page-code 의 DOWNLOAD/PRINT/RESTORE action 정밀화는 후속(C5-2c UI 는 update/create 만 사용, 기능영향 0).
