# 동적 권한그룹 Phase C2c — 상세페이지 버튼 정적 역할 게이트 → 동적 권한 전환

> 2026-06-06. PM 전권([[feedback_pm_permission_autonomy]]). C2a(#402)·C2b(#403) 후속, C2 FE 마무리.

## 1. 배경
라우트 가드(C2a/C2b) 외에, 상세페이지의 **액션 버튼**(편집/삭제/인쇄/전환/병합)이 `useSessionStore(role)` + `*_ROLES.includes(role)` 정적 비교로 show/hide. 이를 `usePermissions().canAccess(pageCode, action)` 동적 권한으로 전환 → 고정역할 제거 FE 마무리.

## 2. scope (4파일 10상수)
| 파일 | 상수 | canAccess 매핑 |
|---|---|---|
| SlipDetailPage | PURCHASE_EDIT/DELETE_ROLES | purchases.slip.edit(update)/purchases.slip.delete(delete) |
| SlipDetailPage | SALES_EDIT/DELETE_ROLES | sales.slip.edit(update/delete) |
| SalesPartnerOrderDetailPage | EDIT/PRINT/CONVERT_ROLES | sales.partner-order.edit(update)/.print(print)/.convert(create) |
| SalesPartnerOrderListPage | MERGE_CONVERT_ROLES | sales.partner-order.convert(create) |
| SalesQueryPage | SALES_EDIT/DELETE_ROLES | sales.slip.edit(update/delete) |

- role 비교 부분만 교체, status/mode 등 다른 조건 유지.
- canAccess 로딩 중 false(보수적 deny) — 버튼 잠깐 숨김은 정상.

## 3. mock 카탈로그 동기화 (필수)
mock SP_D1_PAGES/DEFAULT_VIEW/EDIT 에 5 page-code 추가(seed 정확): purchases.slip.edit/delete, sales.slip.edit, sales.partner-order.edit, sales.partner-order.convert. (sales.partner-order.print 기존재.) FE PageCode 타입 + PermissionMatrixPage 카탈로그에 convert/revisions 보강.

## 4. 비대상 — AdminLayout 부서 가드 유지
AdminLayout = RoleGuard(MASTER) + isExecutiveOffice(BE) 2단 가드. 부서(조직)는 page-code 로 표현 불가 → **유지**(C2 비목표). 인사 메뉴는 MASTER+대표실 정책이 page 권한과 직교.

## 5. behavior-preserving / 안전
- 각 page-code+action 이 auth seed + mock 카탈로그에 grant 되어야 버튼 정상(미존재 시 전원 숨김 치명) → seed 검증 필수. (sales.partner-order.edit=V30 MASTER/MANAGER/SALES, convert=V41 동일, slip.edit/delete=V36 검증 완료.)
- BE enforcement 불변(버튼은 UX, 실제 차단은 @RequirePermission).

## 6. 검증
typecheck 0, 전체 mock suite 0 fail/skip, dual review(Claude TM·Codex TM 각각) + PM 종합, CI green. DECISIONS D-PGC-06.
