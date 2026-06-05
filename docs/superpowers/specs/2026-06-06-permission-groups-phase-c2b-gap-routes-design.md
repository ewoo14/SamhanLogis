# 동적 권한그룹 Phase C2b — RoleGuard 단독 gap 라우트 → PermissionGuard 전환

> 2026-06-06. PM 전권([[feedback_pm_permission_autonomy]]). C2a(redundant RoleGuard 제거 #402) 후속.
> 상위 spec: `2026-06-05-permission-groups-phase-c-fixed-role-removal-design.md` §4 C2.

## 1. 배경
C2a 가 내부 PermissionGuard 를 감싸던 외부 RoleGuard 75건을 제거했고, 남은 것은 **PermissionGuard 미병행 단독 RoleGuard** 라우트 22건. C2b 는 이들을 적합 page-code 의 PermissionGuard 로 전환하여 동적 권한그룹 단일 게이트로 통일.

## 2. scope
**전환 19건** (page-code 명확 + auth seed 실재 확인):
sales.slip.create(×2: /sales/new·/purchases/new), slip.delivery-batch, slip.print.next-day(×2), sales.partner-dc-config, slip.cleanup, inventory.stock-balance, arologis.dispatch.admin(×2), arologis.dispatch.ops(×2), dispatch.batch, accounting.period-close(/warehouse/closing), aligo.address-book, messenger.admin, slip.edit-requests, slip.photo-audit, inventory.safety-stock.

**보류 3건** (BE 미구현/page-code 미확정 → RoleGuard 유지 + `[C2b 보류]` 주석):
- /sales/vendor-order-upload (VENDOR_ORDER_OCR_ROLES) — BE OCR 미구현.
- /sales/closing (ACCOUNTING_ROLES) — BE endpoint/page-code 미확정.
- /admin/sheet-sync (SHEET_SYNC_ROLES) — BE 미구현 mock.

## 3. 🔴 핵심 — mock 권한 카탈로그 동기화 (필수 동반)
mock 모드에서 PermissionGuard 는 `GET /auth/admin/permissions/my` mock 으로 판정. 이 mock 카탈로그(`SP_D1_PAGES` + `SP_D1_DEFAULT_VIEW/EDIT`)에 전환 page-code 일부가 **없어** mockRole-only 진입이 redirect 됨(ac-2/ac-3/slip-cleanup/dispatch-sms 등 19 spec 실패). → **12개 누락 page-code 를 auth seed 의 역할별 can_view/can_edit 그대로 카탈로그에 추가**(MASTER 자동 전권). 핸드오프 P2 "mock PageCode 카탈로그 동기화"를 C2b 필수로 흡수.
- 🚨 page-code 가 seed 에 없으면 PermissionGuard.canAccess 가 항상 false → 라우트 전원 차단(치명). 전환 전 seed 실재 검증 필수.

## 4. 안전 / behavior-preserving
- 각 page-code 의 RoleGuard role-set 과 seed grant role-set 비교 — Option A(seed 진실원, D-PGC-01) 적용. 대부분 RoleGuard ⊆ seed(widening) 또는 동일.
- BE enforcement 불변(FE+mock 만 변경).
- mock 카탈로그 추가로 사이드바에 해당 메뉴가 granted 역할에 신규 노출될 수 있음 — production seed 와 정합(faithful mock).

## 5. 검증
- typecheck 0.
- 전체 mock suite(필수 — [[feedback_fe_guard_removal_contract_tests]]) 0 fail / 0 skip(슬라이스 관련).
- source-contract 갱신: photo-audit(slip.photo-audit), sp-d6-1(permission-matrix `</PermissionGuard>`).
- dual review(Claude TM·Codex TM 각각 게시) + PM 종합. CI green.

## 6. 산출물
- routes/index.tsx(19 전환), mock.ts(카탈로그 12 page-code), photo-audit·sp-d6-1 spec 갱신, spec/dev-report/DECISIONS D-PGC-02 갱신.
