# 동적 권한그룹 Phase C5-2b — FE 인가용 role 의존 → 권한 기반 이관

> 2026-06-06. 개발책임자 "123 순서" ③ C5 진행 / C5-2a(백엔드 role-clean 확인) 후 FE 선택. PM 전권.

## 1. 배경
C5-2a 정찰: 백엔드 사용자 경로 @PreAuthorize(hasRole)는 이미 0(C1~C4 정리), 동적 권한(@RequirePermission)은 role-독립. X-User-Role 잔존 실사용 = PermissionAspect master-bypass 폴백(C4-3)·PARTNER·arologis·**FE role 의존**. 본 슬라이스는 **FE 인가용 role 의존**을 권한 기반(usePermissions canAccess)으로 이관.

## 2. scope (FE-only, 저위험 — BE enforce)
### 이관 (인가용 → canAccess)
- **session.ts 헬퍼 4 제거**: `canCreateSlip`→`canAccess('sales.slip.create','create')`, `canInspectInbound`→`canAccess('inbound.inspection')`, `canQuerySales`→`canAccess('sales.slip.list')`, `canCreateTransfer`→`canAccess('inventory.stock-transfer','create')`. 호출처(Dashboard/SalesQuery/PurchaseQuery/SlipList/Transfer/AppLayout) usePermissions 훅 전환.
- **직접 role==='MASTER' 인가 5 이관**(BE @RequirePermission page-code 대조): SlipDetailPage 서명무효(`slip.signature` delete), SalesPartnerDcConfig CSV(`dc-config.import` create), BlockedPartners 일괄(`partners.block.bulk` create), Regions(`arologis.region.manage` create), AppLayout 권한위임 메뉴(`system.permission-admin`).
- mock 카탈로그 3 page-code 보강(slip.signature/partners.block.bulk/arologis.region.manage).

### 유지 (이관 금지)
- **표시용 role**: auth?.role 라벨/audit/profile chip (UUID 비공개 위반 아님).
- `canTransitionSlip/Transfer`(action별 복합, page-code 없음) · `hasAdminRole`(coarse MASTER/MANAGER/DEVELOPER) → page-code 불명확, 보류.
- C2b 보류 RoleGuard 3(vendor-order-upload/sales-closing/sheet-sync) · AdminLayout 부서(EXECUTIVE_OFFICE) 가드.

## 3. behavior / 안전
- canAccess 로딩 중 false(보수적 deny). BE 가 실제 enforce(FE 는 UX). 락아웃 무관(FE).
- ⚠️ 일부 이관은 **Option A widening**(예: slip.signature delete seed 가 MANAGER 도 grant → 원래 MASTER-only 화면이 MANAGER 노출). seed 진실원(D-PGC-01) 일관 — FE↔BE 정합. 리뷰 확인.

## 4. 검증
- typecheck/lint 0. 전체 mock suite(source-contract 영향 가능) + 수정. dual review(Claude TM·Codex TM 각각)+PM 종합. CI green. DECISIONS D-PGC-12.

## 5. 잔여 (C5 후속)
- hasAdminRole/canTransition* page-code 확정 후 이관. PARTNER/arologis role 처리. C4-3(role 폴백 제거). 최종 X-User-Role/role 클레임/accounts.role 제거(개발책임자 입회 cutover).
