# dev-report — Phase C2c: 상세페이지 버튼 정적 역할 게이트 → 동적 권한

> 2026-06-06. 권한그룹 Phase C §4 C2 마무리(FE). PM 전권([[feedback_pm_permission_autonomy]]).
> spec: `docs/superpowers/specs/2026-06-06-permission-groups-phase-c2c-detail-buttons-design.md`

## 1. 무엇을 했나
라우트 가드(C2a/C2b) 외 **상세페이지 액션 버튼**의 `useSessionStore(role)` + `*_ROLES.includes(role)` 정적 게이트를 `usePermissions().canAccess(pageCode, action)` 동적 권한으로 전환.
- **4파일 10상수**: SlipDetailPage(PURCHASE_EDIT/DELETE·SALES_EDIT/DELETE), SalesPartnerOrderDetailPage(EDIT/PRINT/CONVERT), SalesPartnerOrderListPage(MERGE_CONVERT), SalesQueryPage(SALES_EDIT/DELETE).
- 매핑: purchases.slip.edit(update)/purchases.slip.delete(delete)/sales.slip.edit(update/delete)/sales.partner-order.edit(update)/.print(print)/.convert(create).
- role 비교부만 교체, status/mode 등 조건 유지. 미사용 상수·useSessionStore 정리.

## 2. mock 카탈로그 동기화
mock SP_D1_PAGES/DEFAULT_VIEW/EDIT 에 5 page-code 추가(seed 정확, MASTER 자동): purchases.slip.edit/delete(V36 MASTER/MANAGER/WAREHOUSE), sales.slip.edit(V36 MASTER/MANAGER/SALES), sales.partner-order.edit(V30 MASTER/MANAGER/SALES), sales.partner-order.convert(V41 MASTER/MANAGER/SALES). (sales.partner-order.print 기존재.) FE PageCode 타입 + PermissionMatrixPage 카탈로그에 convert/revisions 보강.

## 3. AdminLayout 부서 가드 — 유지 (C2 비목표)
AdminLayout = RoleGuard(MASTER) + isExecutiveOffice(BE GET /users/me/is-executive-office) 2단. 부서(조직)는 page-code 표현 불가 → 유지. 인사 메뉴는 MASTER+대표실 정책이 page 권한과 직교.

## 4. 검증 (실 실행)
- typecheck 0.
- 전체 mock suite: **behavioral 실패 0**(mock 동기화로 버튼 정상 렌더) + source-contract 7(아래 수정) → 수정 후 7 스펙 36 passed.
- 🔴 source-contract 7 갱신: sp-08-4-2/4-3/4-4·5-2/5-3·6-2/6-3 의 `toContain("const X_ROLES=[...]")` → `toContain("canAccess('<pc>','<action>')")` (계약 갱신, 약화 X).
- seed 검증: 전 page-code auth seed + FE PageCode 타입 실재(보안 — 미존재 시 버튼 전원 숨김 치명).

## 5. 산출물
- SlipDetailPage/SalesPartnerOrderDetailPage/SalesPartnerOrderListPage/SalesQueryPage(canAccess 전환), mock.ts(5 page-code), permissionsApi.ts(convert 타입), PermissionMatrixPage(convert/revisions 라벨).
- 7 source-contract spec 갱신. spec/dev-report/DECISIONS D-PGC-06.

## 6. C2 완료 + 잔여
- **C2(FE 고정역할 게이트 제거) 완료**: C2a(라우트 redundant)·C2b(라우트 gap)·C2c(버튼) 3슬라이스.
- 잔여: C2b 보류 3 라우트(BE 미구현), AdminLayout 부서 가드(유지). 다음 = **C3**(역할부여 UX→그룹배속).
