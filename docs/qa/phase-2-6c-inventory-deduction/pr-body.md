## 개요
Phase 2.6c — **주문→출고전표 전환 시 재고 예약(reserve) 정합**. 개발책임자 모델 확정(2026-05-31):

- **주문서 = 재고 무영향** (견적전환 DRAFT·거래처 confirm 주문 모두)
- **출고전표로 전환(convert) = 재고 예약(reserve)** — 실재고 차감(deduct) 아님. 예약은 가용재고를 묶고 실재고는 유지
- **실재고 차감(deduct) = 후속 출고확정 단계** (본 슬라이스 제외)
- **재고 조회 = 가용/실/예약 구분 표시**, 예약 가능 부족 시 전환 **409 사전차단**

연관 spec/plan: `docs/superpowers/specs/2026-05-30-inventory-deduction-on-convert-2-6c-design.md`(§0 모델정정) / `docs/superpowers/plans/2026-05-30-inventory-deduction-2-6c.md`

## 변경

### inventory-service
- `GET /internal/inventory/warehouses/by-code` — warehouseCode→warehouseId (X-Internal-Token)
- `StockService.reserve` referenceType/referenceId **멱등 가드** + **V14** partial unique index (`stock_movements (reference_type, reference_id, product_id, RESERVE)`)
- `GET /inventory/balances` — 가용(availableQty)/실(totalQty)/예약(reservedQty) 노출

### partner-order-service
- `InventoryClient.reserve/release` referenceType+referenceId 오버로드 + `resolveWarehouseIdByCode`
- `PartnerOrderConvertService` 재설계: warehouseId 변환 → 라인별 reserve(**가용부족 409 사전차단**) → slip 발행 → **발행 실패 시 release 보상** → converted 누적. convertKey=reserve referenceId(멱등)
- `PartnerOrderConfirmService`: 주문확정-시점 reserve **제거**(주문=무영향). ⚠️ confirm 자동발행 자체 폐지는 **2.6b** 예정(과도기 dev-report 명시)

### slip-service
- 주문전환(sourceType=PARTNER_ORDER) 전표 발행 즉시 `DRAFT→SENT` **불변 전이**(수정/삭제 차단). 기존·타 sourceType 전표 미변경(회귀 0)

### FE (desktop)
- 재고 현황 페이지(`/inventory/stock-balance`) — 가용/실/예약 DataGrid + 가용0 강조
- 전환 409 재고부족 에러 UX (insufficientLines 파싱, Designer 가이드 문구)

### 부수
- `.gitignore` 복구 — #326 간결화 시 누락된 `.claude/`·`.pr-body*`·`.tmp-*`·`terraform`·`legacy-gas` ignore 항목 재추가

## 테스트
- IT 신규: `Phase26cReserveIT`(inventory 멱등/가용부족/조회), `Phase26cConvertReserveIT`(convert 예약/사전차단/보상/멱등), `Phase26cSlipImmutableIT`(전환전표 불변) + 기존 `PartnerOrderConvertIT` reserve stub
- 3서비스 `compileTestJava` SUCCESS, FE typecheck/lint/build 통과
- Docker 실 QA(실 inventory_db 예약 row psql 증빙) — 본문 하단 첨부

## 후속
- **2.6b**: 다중주문 병합 + confirm 자동발행 폐지(같은 거래처·'/'병기)
- **2.6d**: 품목 재고조회 모달(주문/판매/구매 상세, 0수량 창고 토글)
- 실재고 차감(deduct) — 출고확정 단계

🤖 Generated with [Claude Code](https://claude.com/claude-code)
