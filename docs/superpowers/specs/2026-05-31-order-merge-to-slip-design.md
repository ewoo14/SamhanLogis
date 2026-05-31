# 다중 주문(Partner-Order) → 단일 출고전표(Slip) 병합 전환 — 설계 (Phase 2.6b ② = D2)

> brainstorming 완료(2026-05-31). 선행 슬라이스 머지 후 grounding 재수행:
> 2.6a 부분전환(#325) / 2.6c 재고 reserve(#327) / D1 confirm 자동발행 폐지(#329) /
> C 창고코드 정렬(#328) 반영된 **실제 코드** 기준.
> ⚠️ Codex 6/1(월) 12:00 복구 전 → 구현+dual리뷰 모두 Claude 에이전트 대체.
> 상위 설계 모체: `2026-05-30-order-to-slip-conversion-design.md` §7 (2.6b ②).

---

## 1. 업무 규칙 (개발책임자 확정)

- 같은 거래처(`partnerCode`)의 **DRAFT/ON_HOLD 주문 여러 개**를 선택 → **단일 출고전표**로 병합 발행.
- 서로 다른 출고정보(배송지/납기/날짜 등 헤더)는 **FE가 선택 또는 `/`로 병기**한 최종 헤더를 전송. **거래처는 단일**(병합 전제).
- 라인별 부분수량 전환 가능(단일주문 전환과 동일 의미). 전량 전환된 주문은 각각 `CONVERTED`.
- **원자성(all-or-nothing)**: 한 라인이라도 가용재고 부족 시 **전체 409 사전차단**(slip 미발행). 단일주문 reserve 모델과 동일 철학.
- 병합 = **같은 거래처만**. `/` 병기는 출고정보 차이만, 거래처/회계 귀속은 단일로 명확.

## 2. 핵심 설계 결정 (2026-05-31 마우스 선택)

| # | 결정 | 선택 | 근거 |
|---|---|---|---|
| D-MRG-01 | N:1 출처추적 | **신규 `slip_source_orders` 테이블**(slip V30) + 기존 `SlipLine.sourceOrderLineId` 라인레벨 병행 | 헤더레벨 N:1 명시, '출처 주문들' 직접 쿼리, 회계 cross-check 명확. 현재 `slip.sourceId`는 단일 String 한계 |
| D-MRG-02 | API 구조 | **신규 병합 엔드포인트** 추가, 기존 단일주문 `{id}/convert-to-slip` 무변경 | #325/#327 검증된 reserve/보상 경로 회귀 0. 공통 헬퍼만 추출 재사용 |
| D-MRG-03 | 헤더 '/' 병기 책임 | **FE가 최종 병합 헤더 확정 전송**, BE는 그대로 저장 + partnerCode 동일성만 검증 | 사용자 통제, 단순, 예측가능. 병기 순서/중복제거 규칙을 BE가 떠안지 않음 |
| D-MRG-04 | 부분실패 처리 | **원자적(all-or-nothing)** — 한 라인 가용부족 시 전체 409, 예약 0 | 단일주문 사전차단과 일관. 부분발행 회계 모호성 회피 |
| D-MRG-05 | 권한 | 기존 `sales.partner-order.convert` CREATE 재사용 | 출고전표 생성 행위 동일. 신규 page 코드 불필요 |

## 3. 현행 (grounding, 2026-05-31 실제 코드)

- **단일주문 전환**: `POST /api/v1/partner-orders/{id}/convert-to-slip`
  → `PartnerOrderConvertService.convert`: `requireConvertible()`(DRAFT/ON_HOLD) → warehouseCode 검증 →
  결정적 idempotencyKey/convertKey(SHA-256) → `inventoryClient.resolveWarehouseIdByCode` →
  라인별 `inventoryClient.reserve`(referenceType=`PARTNER_ORDER_CONVERT`) → `slipServiceClient.publishFromPartnerOrder` →
  실패 시 `compensateReserved`(release) → 성공 시 `line.convert(qty)` 누적 + `markConvertedIfComplete` + `saveAndFlush`.
  멱등 no-op 라인(`alreadyReserved`)은 보상대상 제외(double-release 방지).
- **slip 발행**: `SlipPublishService.publishFromPartnerOrder(req, key, requesterId)` —
  `Slip.assignPublishSource(PARTNER_ORDER, sourceId, key)` (**sourceId 단일 String**) +
  `SlipLine.sourceOrderLineId`(라인별 출처, V29) 채움 + PARTNER_ORDER 전표는 발행 즉시 **SENT 불변** 전이 +
  `SlipPublishAudit` 1행 + fingerprint 멱등(같은 키+다른 본문 → 409).
- **상태**: `PartnerOrderStatus` = DRAFT/ON_HOLD/CONFIRMING/CONFIRMED/CANCELED/**CONVERTED**. `requireConvertible()` = DRAFT/ON_HOLD.
- **조회**: `GET /api/v1/slips/by-source?sourceType&sourceId` → `findAllBySourceTypeAndSourceIdAndIsDeletedFalse`.
- **Flyway 현재 최대**: slip **V29**(`add_slip_line_source_order_line`) → 다음 **V30** / partner-order **V8**(`converted_quantity`) → 신규 마이그레이션 불필요.

## 4. 설계

### 4.1 데이터 — slip-service V30

```sql
-- V30__create_slip_source_orders.sql
CREATE TABLE slip_source_orders (
    id               UUID PRIMARY KEY,
    slip_id          UUID NOT NULL REFERENCES slips(id),
    partner_order_id UUID NOT NULL,
    order_no         VARCHAR(64) NOT NULL,
    created_at       TIMESTAMP NOT NULL,
    created_by       VARCHAR(255),
    updated_at       TIMESTAMP NOT NULL,
    updated_by       VARCHAR(255),
    deleted_at       TIMESTAMP,
    deleted_by       VARCHAR(255),
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE
    -- BaseEntity 7 audit + soft delete 컨벤션 정합
);
CREATE INDEX ix_slip_source_orders_slip  ON slip_source_orders(slip_id);
CREATE INDEX ix_slip_source_orders_order ON slip_source_orders(partner_order_id);
```

- **단일주문 경로는 이 테이블에 쓰지 않음** → 기존 `slip.sourceId` 그대로, 회귀 0.
- 병합 전표: `slip.sourceType=PARTNER_ORDER`, `slip.sourceId`=대표(첫) 주문 UUID로 채우되, **N:1 진실은 `slip_source_orders`**.
- `findBySource` 를 `slip_source_orders` UNION 으로 확장 → 출처 주문 어느 것으로 조회해도 병합 전표가 잡힘(병합 전표는 sourceId가 대표 1건만이라 비대표 주문 조회 시 누락 방지).
- 라인 출처는 기존 `SlipLine.sourceOrderLineId`(V29) 그대로 채움 — 어느 라인이 어느 주문 라인에서 왔는지 라인레벨 보존.
- partner-order 측 **신규 마이그레이션 불필요**(`converted_quantity` V8 재사용, 각 주문 라인이 독립 누적).

### 4.2 BE — partner-order-service (병합 오케스트레이션)

**신규** `POST /api/v1/partner-orders/convert-to-slip-merge` (권한 `sales.partner-order.convert` CREATE 재사용).

요청 DTO `MergeConvertToSlipRequest`:
```
{
  orders: [ { partnerOrderId: UUID, items: [ {orderLineId: UUID, quantity: int>=1} ] } ],  // @NotEmpty, 라인 @Valid
  warehouseCode: String,                  // 명시 필수 (blank → 409, DEFAULT 폴백 금지)
  shippingInfo: {                         // FE 확정 병합 헤더 (모두 optional)
    partnerName?, shippingAddress?, receiverPhone?, paymentDueLabel?, discountInfo?, memo?
  }
}
```

`PartnerOrderMergeConvertService.convertMerge(req, actorId, actorName)` — 단일주문 `convert` 흐름의 N-주문 일반화:
1. `orders[].partnerOrderId` N건 조회 → 전원 존재 검증 + 전원 `requireConvertible()`(DRAFT/ON_HOLD) + **partnerCode 전원 동일 검증**(불일치 → 409 `CONFLICT`).
2. warehouseCode 검증 + 전 주문×라인 매핑 + 잔여수량 사전검증(초과 409) + slip payload 라인 빌드(`sourceOrderLineId` 포함).
3. **결정적 convertKey**: SHA-256(정렬된 `orderId:lineId:convertedBefore:qty` 전체 결합) → `PO-MRG-{hash[:16]}`. reserve referenceId(UUID 변환) + slip Idempotency-Key 공용 → 재시도 시 reserve no-op + slip 멱등 동시 보장.
4. `inventoryClient.resolveWarehouseIdByCode(warehouseCode)`.
5. 전 라인 **reserve** (referenceType=`PARTNER_ORDER_MERGE_CONVERT`, referenceId=convertKey). 가용부족 `CONFLICT` → 실제 예약 성공분만 `compensateReserved`(release) 후 전파(slip 미발행 = 사전차단).
6. slip-service **병합 발행** 호출(§4.3) → 실패 시 release 보상 후 전파.
7. 성공 → 전 주문 라인 `line.convert(qty)` 누적 + 각 주문 `markConvertedIfComplete` + `orderRepository.saveAll`. **단일 `@Transactional`** (partner_order_db 단일 DB → N개 주문 한 트랜잭션 안전).
8. 응답: `{ slipNo, convertedOrders: [{partnerOrderId, status, fullyConverted}] }`.

**공통 헬퍼 추출**(단일·병합 공유, 단일 메서드 시그니처 보존 → 회귀 0): reserve 루프 + `compensateReserved` + convertKey 생성 + 라인 payload 빌드.

### 4.3 BE — slip-service (병합 수신)

**신규** `POST /api/v1/slips/from-orders-merge` + `PublishFromOrdersMergeRequest`:
```
{
  partnerCode, partnerName?, warehouseCode, warehouseId?, ioDate?,
  shippingAddress?, receiverPhone?, paymentDueLabel?, discountInfo?, memo?,
  lines: [ {productCode, productName?, qty, unitPriceVat?, remarks?, sourceOrderLineId} ],
  sourceOrders: [ {partnerOrderId, orderNo} ]   // N:1 추적 기록용
}
```

`SlipPublishService.publishFromOrdersMerge(req, key, requesterId)` — 기존 `publishFromPartnerOrder` 공통부 재사용:
- 재사용: `lookupByIdempotencyKey`/replay·409, `verifyPartnerOrThrow`, `resolveWarehouseId`, `resolveLines`, 채번, `Slip.createOutbound`, `applyEcountSchema`, partner_code snapshot, **SENT 불변 전이**(PARTNER_ORDER), `SlipPublishAudit`.
- 차이점만:
  - `assignPublishSource(PARTNER_ORDER, primaryOrderId, key)` (primary = sourceOrders[0].partnerOrderId).
  - `slip_source_orders` **N행 INSERT**(slipId + 각 partnerOrderId/orderNo).
  - fingerprint = 병합 조합(정렬된 sourceOrders + lines) 기준.
- 기존 `publishFromPartnerOrder`(단일)는 **무변경**.
- `findBySource` 확장: `findAllBySourceTypeAndSourceIdAndIsDeletedFalse` UNION `slip_source_orders.partner_order_id = sourceId` → 비대표 주문 조회 누락 방지.

### 4.4 FE (order-app / desktop 전표작성·주문목록)

- **주문 목록**: 체크박스 다중선택 → "출고전표로 병합 전환" 버튼.
  - 선택 주문 거래처가 혼합이면 버튼 비활성 + 안내("같은 거래처만 병합 가능").
  - DRAFT/ON_HOLD 외 상태 포함 시 비활성.
- **병합 모달**: 선택 주문들의 라인 펼침 → 라인별 전환수량(기본 잔여 전량) + 창고 필수 선택(`WarehouseSelector`) + **헤더 충돌 필드**(배송지/납기/날짜 등 주문마다 다른 값) 표시 → 사용자가 값 선택 또는 `/` 병기 텍스트 입력 → 확정 헤더 전송.
- 전환 후 각 주문 잔여/전환완료 배지 갱신(react-query invalidate). **UUID 비공개**(주문번호/거래처명/모델명만 노출, [[feedback_uuid_no_user_visibility]]).
- design-system 컴포넌트 우선 재사용(자체 신규 작성 금지).

### 4.5 권한
- `sales.partner-order.convert` CREATE 재사용(2.6a 신설분). MASTER bypass 일관. 신규 page 코드/시드 불필요.

## 5. 멱등 / 보상 / 원자성
- 단일주문에서 검증된 **reserve → 발행 → 실패 시 release 보상** 패턴을 N-주문으로 확장.
- 멱등 no-op 라인(`alreadyReserved=true`)은 보상대상 제외(double-release → reservedQty 음수 방지) — 기존 로직 계승.
- 결정적 convertKey가 전 주문/라인 스냅샷(convertedBefore 포함) 기반 → 같은 병합 2회 요청도 1회만 반영(이중 누적/이중발행 차단).
- 멱등 재시도: 같은 키 + 같은 본문 → slip replay(동일 slipNo). 같은 키 + 다른 본문 → 409.

## 6. 테스트 + QA
- **IT(실 Postgres, skipped=0)**: 2주문 병합 발행 / 헤더 '/'병기 저장 / partnerCode 불일치 409 / 부분수량+잔여추적 / 한 라인 가용부족 → 전체 409 + 예약 0(보상검증) / 멱등 재시도 replay / `slip_source_orders` N행 적중 / `findBySource` 비대표 주문 조회 적중.
- **Playwright**: 다중선택(같은 거래처) → 병합모달 → 수량+헤더병기 입력 → 발행 → 배지 갱신. 혼합 거래처 비활성.
- **Docker 실 QA([[no-fake-data-ever]])**: 실 gateway+JWT+렌더러. 실 화면 캡처 + psql 실적중(`slip_source_orders` N행 + 각 주문 `converted_quantity` + `slip_lines.source_order_line_id`). 합성/mock 화면 금지.

## 7. 사이클 / 배포
- Claude 에이전트 구현 → 5-team 사이클 N=2 → CI green(skipped=0) → Docker 실 QA → PM 승인 → 머지.
- **배포 순서**: slip-service(V30 + from-orders-merge 수신) → partner-order-service(merge 오케스트레이션). slip 먼저 배포되어야 partner-order가 신규 엔드포인트 호출 가능.
- 문서 동기화: DECISIONS D-MRG-01~05 / dev-report `docs/dev-reports/slice-d2-order-merge-to-slip.md` / README·overview 갱신 ([[feedback_continuous_docs_sync]]).

## 8. 범위 밖 / 후속
- 2.6c 정합성(재고 차감=출고확정 단계)은 본 슬라이스 무관(reserve 까지만, 기존과 동일).
- confirm DC 실적용(partner_order ↔ dc_config 시드 정합)은 별도 비차단 후속.
- 공용 `AsyncAutocomplete<T>` 추출 등 FE 리팩터는 별개 슬라이스.
