## 개요

주문/출고전표(판매)/입고전표(구매) **상세에서 품목 라인을 다중 선택** → **창고별 가용/실/예약 매트릭스** 모달로 즉시 재고 확인 (Phase 2.6d). **읽기 전용 · FE 중심**(BE 1필드).

- 기본 **실재고 0 창고 숨김**(재고 있는 창고만), 토글 **"0수량 창고도 표시"** → 전 창고(마스터 머지).
- 셀당 **가용/실/예약 3줄**.

## 핵심 결정 (DECISIONS D-IL-01~06)

| # | 결정 |
|---|---|
| D-IL-01 | 0수량 토글 = 전 창고 마스터 머지(batch + listWarehouses) |
| D-IL-02 | 다중 품목 매트릭스 |
| D-IL-03 | 셀 3줄(가용/실/예약). OFF=실재고>0만, ON=전 창고 |
| D-IL-04 | `POST /inventory/balances/batch` 재사용(inventory 무변경, 전 role) |
| D-IL-05 | 신규 공유 `InventoryLookupModal`(기존 SlipFormPage 모달 무변경) |
| D-IL-06 | partner-order LineResponse productId 노출(재고 batch 키, 화면 미노출) |

## 변경

**partner-order-service** (1필드): `PartnerOrderDetailResponse.LineResponse` 에 `productId` 노출.

**desktop FE**:
- `inventory.ts fetchProductBalancesMatrix` — batch(가용/실/예약) + listWarehouses 머지, **lines 기준 순회**(잔량 없던 품목도 0/0/0 행), VIRTUAL 제외.
- `InventoryLookupModal` — 매트릭스(셀 3줄, 0토글, design-system 토큰: 가용0 danger·예약>0 warning, sticky 고정 컬럼, th scope/caption/aria, 로딩·에러·빈).
- `SlipDetailPage`(기존 단일 alert 재고조회 → 다중선택+모달, 출고·입고 공용) + `SalesPartnerOrderDetailPage` 배선.

## 테스트 / 리뷰

- partner-order `PartnerOrderDetailIT` 7 PASS(skipped=0).
- desktop Playwright **13 PASS(skipped=0)**: 3 컨텍스트 다중선택→모달 / 셀 실값 / 0토글 OFF·ON(CS-001 숨김·BK-001 0/0/0) / VIRTUAL 제외 / 출고·입고 UUID 가드 / batch 500 에러.
- **5-team 사이클 N=2 전원 APPROVE**. 사이클1: QA B-2(잔량 없던 품목 행 누락 실버그)·Designer 토큰화(가용>0 초록 오류 정정)·FE 상태 리셋 → fix → 사이클2 수렴. 산출물 `docs/qa/slice-2-6d-inventory-lookup/`.

## 배포

partner-order(LineResponse productId) → desktop FE. **Flyway/게이트웨이 변경 없음**. 기존 단일주문/전환/SlipFormPage 모달 회귀 0.

## Docker 실 QA

CI green 후 실 inventory_db 잔량 매트릭스 + 0토글 on/off 실 화면 캡처([[no-fake-data-ever]]) → 본 PR 코멘트 첨부.

## 연관
- spec `docs/superpowers/specs/2026-05-31-inventory-lookup-modal-design.md`
- plan `docs/superpowers/plans/2026-05-31-inventory-lookup-modal.md`
- 메모리 [[project_inventory_lookup_modal_2_6d]]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
