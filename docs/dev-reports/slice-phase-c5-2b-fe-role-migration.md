# dev-report — Phase C5-2b: FE 인가용 role 의존 → 권한 기반 이관

> 2026-06-06. 개발책임자 "123 순서" ③ C5 / C5-2a(백엔드 role-clean) 후 FE 선택. PM 전권.
> spec: `docs/superpowers/specs/2026-06-06-permission-groups-phase-c5-2b-fe-role-migration-design.md`

## 1. 무엇을 했나 (FE-only, 저위험)
FE 인가용 role 의존을 `usePermissions().canAccess(pageCode)` 로 이관. 표시용 role 은 유지.
- **session.ts 헬퍼 4 제거**: canCreateSlip→`canAccess('sales.slip.create','create')`, canInspectInbound→`canAccess('inbound.inspection')`, canQuerySales→`canAccess('sales.slip.list')`, canCreateTransfer→`canAccess('inventory.stock-transfer','create')`. 호출처(Dashboard/SalesQuery/PurchaseQuery/SlipList/Transfer/AppLayout) usePermissions 훅 전환.
- **직접 role==='MASTER' 인가 5 이관**(BE @RequirePermission 대조): SlipDetailPage 서명무효→`slip.signature`(delete), SalesPartnerDcConfig CSV→`dc-config.import`(create), BlockedPartners 일괄→`partners.block.bulk`(create), Regions→`arologis.region.manage`(create), AppLayout 권한위임 메뉴→`system.permission-admin`.
- mock 카탈로그 3 page-code 보강(slip.signature/partners.block.bulk/arologis.region.manage).

## 2. 유지 (이관 금지)
- 표시용 role(auth?.role 라벨/audit/profile chip). canTransitionSlip/Transfer(action 복합·page-code 없음)·hasAdminRole(coarse) 보류. C2b 보류 RoleGuard 3·AdminLayout 부서 가드.

## 3. 안전 / widening
- canAccess 로딩 중 false. BE enforce(FE=UX), 락아웃 무관.
- ⚠️ 일부 이관 = Option A widening(slip.signature delete seed 가 MANAGER 도 grant → 원 MASTER-only 화면이 MANAGER 노출). seed 진실원(D-PGC-01) 일관, FE↔BE 정합.

## 4. 검증
- typecheck/lint 0.
- 전체 mock suite: **behavioral 0** + source-contract 4 갱신(canInspectInbound/canQuerySales 헬퍼 단언 → canAccess 단언: purchase-inspection-cta·sp-08-5-4·sp-08-6-1 T2/T5·sp-08-5-1) → **수정 후 21 passed**(414+).

## 5. 잔여 (C5 후속)
- hasAdminRole/canTransition* page-code 확정 후 이관. PARTNER/arologis role. C4-3(role 폴백). 최종 X-User-Role/role 클레임/accounts.role 제거(개발책임자 입회 cutover).
