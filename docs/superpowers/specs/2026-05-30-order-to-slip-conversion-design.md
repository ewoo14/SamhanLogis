# 주문(Partner-Order) → 출고전표(Slip) 전환 고도화 — 설계 (Phase 2.6)

> grounding 완료(2026-05-30). 부분전환/병합 **완전 부재** 확인 → 신규 구축.
> ⚠️ Codex 토큰 소진 → 2026-06-01(월) 12:00 복구 전까지 구현+dual리뷰 Claude 에이전트 전면 대체.

## 1. 업무 규칙 (개발책임자)
- 주문서 → 출고전표 전환 가능. (현재 confirm=확정 시 자동 1:1 발행만 존재)
- ① **품목별(라인 단위) 부분 전환**: 한 주문서의 일부 품목만 골라 출고전표로.
- ② **다중 주문서 → 단일 출고전표 병합**: 여러 주문서를 하나로. 서로 다른 출고정보(배송지/거래처 등 헤더)는 **선택 또는 '/'로 병기**.

## 2. 결정 (2026-05-30 마우스 선택)
- **전환 = 확정(confirm)과 별개의 명시적 액션.** CONFIRMED 주문에서 "출고전표 전환" 버튼으로 품목선택/병합 전환. (기존 confirm 자동 1:1 발행은 유지하되, 본 고도화는 별도 전환 엔드포인트.)
- **라인별 전환수량 추적.** 각 주문 라인에 `convertedQuantity` — 일부 전환 시 잔여 수량은 주문에 남아 추가 전환 가능. 전량 전환 시 주문 전환완료.

## 3. 현행 (grounding)
- 주문→슬립: `PartnerOrderConfirmService.confirm` → `buildSlipPayload`(전 라인) → `SlipServiceClient.publishFromPartnerOrder` → slip-service `SlipPublishController POST /api/v1/slips/from-partner-order` → `SlipPublishService.publishFromPartnerOrder`(전 라인 → `Slip.createOutbound` + `assignPublishSource(PARTNER_ORDER, sourceId)`).
- `Slip.sourceType`(ESTIMATE/PARTNER_ORDER/MANUAL/MIGRATED_ECOUNT) + `sourceId`(단일 String). **SlipLine 역추적 필드 없음.**
- `PartnerOrderLine`: productId/modelName/productName/categoryKey/quantity/priceVat/subtotal/remark. **전환수량 추적 없음.**
- slip 1:1 강제: `PartnerOrder.slipNo` UNIQUE.
- Flyway: partner-order V7 / slip V9.

## 4. 설계 (단계 분할 — §7 참조)

### 4.1 데이터
- **partner-order-service V8**: `partner_order_lines.converted_quantity INT NOT NULL DEFAULT 0`. (잔여 = quantity - converted_quantity)
- **주문 status**: `PARTIALLY_CONVERTED`(부분전환) 추가 검토 또는 기존 status 유지 + 라인 집계로 판정. (Phase 2.5 status enum 에 추가.)
- **slip-service V10**: slip 다중 출처 추적 — `slip_source_orders` 테이블(slip_id, partner_order_id, order_no) 또는 `SlipLine.source_order_id`/`source_order_line_id` 컬럼. 병합 시 N:1 추적.

### 4.2 BE — partner-order-service (전환 오케스트레이션)
- 신규 `POST /api/v1/partner-orders/convert-to-slip` — 요청: `{ items: [{partnerOrderId, orderLineId, quantity}], shippingInfo: {배송지/거래처 선택 또는 '/' 병기 필드} }`. 여러 주문/라인/수량 묶음.
- `PartnerOrderConversionService`:
  1. 각 라인 검증(주문 CONFIRMED, 잔여수량 ≥ 요청수량, 같은 거래처/병합가능 규칙).
  2. slip-service 로 병합 발행 요청(선택 라인+수량+병합 헤더).
  3. 성공 시 각 라인 `convertedQuantity += 전환수량`, 주문 전환완료 판정.
  4. 멱등성: 전환 요청 idempotencyKey.
- 헤더 충돌 병합 규칙: 배송지/수령인 등 서로 다르면 요청의 선택값 또는 `/` 병기 문자열. (FE 가 선택/병기 입력.)

### 4.3 BE — slip-service (병합 발행 수신)
- 신규 또는 확장 `POST /api/v1/slips/from-orders-merge` — 여러 주문 라인 → 단일 slip. 요청에 라인별 source(partnerOrderId, orderLineId) + 병합 헤더.
- `Slip.assignPublishSource` 다중화 또는 `slip_source_orders` 기록. `SlipLine.sourceOrderLineId` 채움.
- idempotency + fingerprint(병합 조합 기준).

### 4.4 FE
- 주문 목록: 체크박스 다중선택 → "출고전표로 전환" 버튼(다중주문 병합 진입).
- 전환 모달: 선택 주문들의 라인 표시 → 라인별 전환수량 입력(기본 잔여 전량) + 헤더 충돌 시 배송지/거래처 선택/병기 UI.
- 주문 상세: 단일 주문 부분전환 버튼.
- 전환 후 잔여수량/전환완료 배지.

### 4.5 권한
- 신규 `sales.partner-order.convert` CREATE 또는 기존 `slip.publish.from-partner-order` 재사용. (구현 시 확정.)

## 5. 테스트 + QA
- IT: 단일 부분전환(라인 1개 일부수량)/전량전환/다중주문 병합/헤더 '/'병기/잔여수량 추적/초과수량 거부/멱등. 실 Postgres.
- Playwright: 다중선택→전환모달→수량입력→병합헤더→전환.
- Docker 실 QA: 실 적중(주문 라인 convertedQuantity + slip source 추적 psql).

## 6. 사이클/리뷰
- Claude 에이전트 구현 → Claude 5-team 사이클 N=2 → CI green(skipped=0) → Docker 실 QA(실 화면, [[no-fake-data-ever]]) → 머지.

## 7. 단계 분할 (확정 — 범위 큼, 회계/재고 정합성 민감)
- **2.6a 부분전환 인프라** (본 PR): **slip 미발행 주문**(견적전환 DRAFT 등, slipNo=null) 대상 라인별 부분전환. V8 `converted_quantity` + 단일주문 convert API + `SlipLine.sourceOrderLineId` + FE 상세 부분전환. **confirm 자동발행은 건드리지 않음**(병합/폐지 제외).
  - **2.6a 대상 = slip 미발행 주문만.** confirm 으로 이미 slip 발행된 주문(slipNo≠null)은 전환 대상 아님(이미 출고전표 있음). → 모순 회피.
- **2.6b confirm 자동발행 폐지 + 다중주문 병합**: 거래처 포털 confirm 을 "주문만 생성(slip 미발행)"으로 변경 → 전환 액션으로 출고전표 분리. slip_source_orders + merge API + 헤더 충돌 선택/'/'병기(같은 거래처만) + FE 다중선택 모달. 거래처 포털 E2E/outbox/idempotency 재설계.
- **2.6c 정합성/회계 연계**: 재고 차감·매출 연계 정합 + 전환완료 status + 회귀.

각 단계 독립 PR. **본 plan = 2.6a.**

## 7a. 2.6a 상세 범위 (본 PR)
- **대상 판정**: 전환 가능 주문 = `slipNo == null` AND status ∈ {DRAFT, ON_HOLD, (CONFIRMED 중 slip 미발행=PENDING_RETRY 제외)}. 즉 **출고전표가 아직 없는 주문**. (견적→주문 DRAFT 가 주 대상.)
- **converted_quantity**: PartnerOrderLine 에 추가. 잔여 = quantity - converted_quantity. 부분전환 시 += 전환수량.
- **convert API**(단일 주문): `POST /api/v1/partner-orders/{id}/convert-to-slip` — `{ lines: [{orderLineId, quantity}], shippingInfo? }`. 선택 라인+수량 → slip-service 발행 → 성공 시 converted_quantity 갱신 + (전량 전환 시) 주문 전환완료 표시.
- **slip-service**: 기존 `publishFromPartnerOrder` 확장 또는 신규 — 선택 라인만 + `SlipLine.sourceOrderLineId` 기록. (병합 아님, 단일 주문.)
- **전환완료 판정**: 모든 라인 converted_quantity==quantity → 주문 status `CONVERTED`(신규) 또는 플래그. (구현 시 status 신규 vs 집계판정 확정.)

## 8. 결정/미정 (2026-05-30)
- **병합 조건 = 같은 거래처만** (개발책임자 확정). 다중주문 병합은 동일 partnerCode 주문들만 하나의 slip 으로. 헤더 '/'병기는 **배송지/납기/날짜 등 출고정보 차이**만 병기(거래처는 단일). 회계·매출 귀속 명확.
- **분할 = 2.6a 부분전환 먼저** (개발책임자 확정). 본 plan 은 2.6a 범위. 2.6b(병합)/2.6c(정합성)는 후속 슬라이스.
- 미정(2.6a 구현 시): 전환완료 주문 status 신규(`CONVERTED`) vs 라인 집계 판정 / 기존 confirm 자동 1:1 발행과 신규 전환 액션 공존·중복 방지(부분전환은 CONFIRMED 주문 대상이므로 confirm 후 단계 — 충돌 적음).
