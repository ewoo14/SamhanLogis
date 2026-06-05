# dev-report — Phase C2b: 단독 RoleGuard gap 라우트 → PermissionGuard 전환

> 2026-06-06. 동적 권한그룹 Phase C §4 C2 의 두 번째 슬라이스. PM 전권([[feedback_pm_permission_autonomy]]).
> spec: `docs/superpowers/specs/2026-06-06-permission-groups-phase-c2b-gap-routes-design.md`

## 1. 무엇을 했나
C2a 가 redundant 외부 RoleGuard 75 제거(PR #402) 후, 남은 **단독 RoleGuard**(PermissionGuard 미병행) 라우트를 적합 page-code 의 PermissionGuard 로 전환.
- **19 라우트 전환**: /sales/new·/purchases/new(sales.slip.create), /sales/link-dispatch(slip.delivery-batch), /sales/next-day-slip·/print/next-day-slip(slip.print.next-day), /sales/partner-dc-config, /sales/slip-cleanup(slip.cleanup), /inventory/stock-balance, /arologis/manual·dispatch-reconcile(arologis.dispatch.admin), /arologis/pre-classify·unassigned(arologis.dispatch.ops), /arologis/dispatch-sms(dispatch.batch), /warehouse/closing(accounting.period-close), /admin/aligo-address-book, /admin/chat-rooms(messenger.admin), /admin/slip-edit-requests(slip.edit-requests), /admin/photo-audit(slip.photo-audit), /inventory/safety-stock-alerts.
- **보류 3** (RoleGuard 유지 + `[C2b 보류]`): /sales/vendor-order-upload(BE OCR 미구현), /sales/closing(BE 미확정), /admin/sheet-sync(BE 미구현 mock).
- 전환 page-code 전부 auth seed 실재 검증(없으면 전원 차단 치명 — 안전 게이트).

## 2. 🔴 핵심 — mock 권한 카탈로그 동기화
PermissionGuard 는 mock 모드에서 `GET /auth/admin/permissions/my` mock(`SP_D1_PAGES`+`SP_D1_DEFAULT_VIEW/EDIT`)으로 판정. 전환 page-code 12개가 카탈로그에 **없어** mockRole-only 진입(ac-2/ac-3/slip-cleanup/dispatch-sms 등 19 spec)이 redirect → 실패. → **12 page-code 를 auth seed 의 역할별 can_view/can_edit 그대로 카탈로그에 추가**(MASTER 자동 전권). 핸드오프 P2 "mock PageCode 카탈로그 동기화"를 C2b 필수로 흡수.
- 추가 12: sales.slip.create, slip.delivery-batch, slip.print.next-day, sales.partner-dc-config, slip.cleanup, arologis.dispatch.admin/ops, dispatch.batch, aligo.address-book, messenger.admin, slip.edit-requests, slip.photo-audit. (stock-balance/period-close/safety-stock 기존재.)
- slip.edit-requests 는 V38 broaden(DISPATCH/ACCOUNTANT/WAREHOUSE/INVENTORY view) 반영.

## 3. 검증 (실 실행)
- typecheck 0.
- 전체 mock suite 재실행: **417 passed / 1 flaky**(phase-2-6c 시나리오5 — 전체 부하 타임아웃, **격리 8 passed/8.8s** = 기존 flakiness, C2b 로직 무관, CI retries:1 처리).
- 🔴 실 회귀 적발·수정(전체 suite 1차): behavioral 19(mock 동기화로 해결) + source-contract 2:
  - photo-audit: `routes` 의 SLIP_PHOTO_AUDIT_ROLES 단언 → PermissionGuard(slip.photo-audit) 정규식.
  - sp-d6-1: permission-matrix route 정규식 `</RoleGuard>` → `</PermissionGuard>`(C2a 에서 외부 RoleGuard 제거됨, C2b 가 하류 RoleGuard 도 제거해 매칭 깨짐).
- ✅ **mock 동기화 부작용 0**: 사이드바 신규 메뉴 노출에도 사이드바/메뉴 contract 테스트 회귀 없음(417 passed).

## 4. 산출물
- `routes/index.tsx`(19 전환, 보류 3 주석), `mock.ts`(SP_D1_PAGES+DEFAULT_VIEW/EDIT 12 page-code).
- `photo-audit.spec.ts`·`sp-d6-1-permission-migration.spec.ts` 단언 갱신.
- spec / 본 dev-report / DECISIONS D-PGC-02 갱신.

## 5. 잔여
- **C2c**: 상세페이지 버튼 ROLES(SlipDetailPage 등) + AdminLayout 부서 가드.
- **보류 3 라우트**: 각 BE 구현/page-code 확정 시 후속 전환.
