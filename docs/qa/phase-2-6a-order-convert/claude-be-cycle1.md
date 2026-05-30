# Phase 2.6a BE 코드 리뷰 — claude-be-cycle1

- 브랜치: `feat/phase-2-6-order-to-slip-conversion` (HEAD 0c79ef4d)
- 리뷰 일자: 2026-05-30
- 리뷰어: Claude BE agent (cycle 1)

---

## 요약

| 등급 | 건수 |
|------|------|
| P0 (블로커) | 2 |
| P1 (중요 결함) | 2 |
| P2 (잠재 결함) | 2 |
| Minor | 3 |

P0 결함 2건이 존재하여 **BE APPROVE 불가**. 수정 후 재리뷰 필요.

---

## P0 — 블로커

### P0-1: `PartnerOrderConvertService` — Map 페이로드가 slip-service `PublishFromPartnerOrderRequest` 구조와 불일치

**파일**: `services/partner-order-service/.../service/PartnerOrderConvertService.java` (convert 메서드, lines 구성 블록)

**문제**:
slip-service 의 `POST /api/v1/slips/from-partner-order` 엔드포인트는 `PublishFromPartnerOrderRequest` 를 `@Valid @RequestBody` 로 받는다. 이 DTO 는 필수 필드로 `@NotBlank String partnerOrderId`, `@NotBlank @Size(max=50) String warehouseCode`, `@NotEmpty List<PublishLineRequest> lines` 를 요구하며, `lines` 의 각 항목은 `PublishLineRequest` 레코드 타입이다.

그런데 `PartnerOrderConvertService.convert` 는 `Map<String, Object> payload` 와 `List<Map<String, Object>> payloadLines` 를 raw Map 으로 직접 구성하고 `SlipServiceClient.publishFromPartnerOrder(payload, idempotencyKey)` 에 전달한다. `SlipServiceClient` 는 이 Map 을 `restClient.post().body(requestPayload)` 로 JSON 직렬화하여 전송하는데, 이 경우 실제로 전송되는 JSON 키-값이 `PublishLineRequest` 가 요구하는 `@NotBlank String qty` 필드를 포함하지만 `@PositiveOrZero BigDecimal unitPriceVat` 에 해당하는 `unitPriceVat` 키는 포함된다. 그러나 **결정적 불일치**는 `warehouseCode` 이다.

`PublishFromPartnerOrderRequest` 의 `warehouseCode` 는 `@NotBlank @Size(max = 50)` 제약이 걸려 있고 slip-service Controller 에서 `@Valid` 로 검증된다. `PartnerOrderConvertService` 는 `warehouseCode` 가 null/blank 이면 `"DEFAULT"` 를 Map 에 넣는데, slip-service `WarehouseCodeMapper.resolve("DEFAULT")` 가 `"DEFAULT"` 코드를 실제 UUID 로 매핑하도록 등록되어 있지 않으면 `BusinessException(INVALID_INPUT)` 으로 400 이 반환된다. 기존 `buildSlipPayload` 흐름과 달리 `WarehouseCodeMapper` 시드 데이터에 `"DEFAULT"` 항목이 있는지 코드베이스 어디에서도 보장되지 않는다. 이는 운영에서 창고 코드를 생략한 전환 요청 전부가 400 으로 실패하는 P0 결함이다.

더불어, `payloadLines` 의 구조에서 `unitPriceVat` 키에 `line.getPriceVat()` (`BigDecimal`) 을 넣지만, `PublishLineRequest` 에서 `unitPriceExVat` 에도 값을 넣어야 `SlipPublishService.resolveLines` 의 `unitPrice = l.unitPriceVat() != null ? ... : l.unitPriceExVat()` 분기가 `unitPriceVat` 경로를 타도록 되어 있다. Map 의 키명이 `unitPriceVat` 이므로 이 부분은 우연히 정합이지만, `lineNo` / `spec` / `supplyAmount` / `vatAmount` / `unitPriceExVat` 등 `PublishLineRequest` 필드가 Map 에 완전히 없어도 `@PositiveOrZero` 제약이 null 에 통과하는지 Bean Validation 동작에 의존하게 된다. Bean Validation 에서 `@PositiveOrZero` 는 null 을 허용하므로 해당 필드들은 null 통과가 맞으나, Map→Jackson 직렬화→DTO 역직렬화 경로이므로 키 누락이 JSON 에서 `null` 필드로 역직렬화됨을 명시적으로 확인해야 한다.

**권장**: `PartnerOrderConvertService` 에서 `Map<String, Object>` raw 방식 대신 `PublishFromPartnerOrderRequest` + `PublishLineRequest` DTO 를 직접 생성하거나, `SlipServiceClient.publishFromPartnerOrder` 시그니처를 typed request 로 교체하여 컴파일 타임에 구조 불일치를 검출할 것. 최소한 `warehouseCode = "DEFAULT"` 폴백은 slip-service `WarehouseCodeMapper` 의 실제 시드 데이터에 `"DEFAULT"` 등록이 보장될 때까지 제거하고 `ConvertToSlipRequest.warehouseCode` 에 `@NotBlank` 제약을 추가하여 명시적 실패로 전환할 것.

---

### P0-2: 트랜잭션 경계 — slip 발행 실패 시 `converted_quantity` 부분 커밋 위험

**파일**: `services/partner-order-service/.../service/PartnerOrderConvertService.java:convert()` (`@Transactional` 범위 전체)

**문제**:
`convert` 메서드는 `@Transactional` 로 묶여 있으나, 내부 처리 순서가 다음과 같다.

```
1. order.requireConvertible()
2. line.convert(qty)  ← DB flush 없이 JPA dirty 상태로만 존재
3. buildIdempotencyKey
4. slipServiceClient.publishFromPartnerOrder(payload, key)  ← 외부 REST 호출
5. order.markConvertedIfComplete()
6. orderRepository.saveAndFlush(order)
```

4번 `slipServiceClient.publishFromPartnerOrder` 는 외부 HTTP 호출이다. Spring `@Transactional` 은 외부 네트워크 호출을 트랜잭션 안으로 포함시키지 않는다. 즉, 슬립이 slip-service 에서 성공적으로 발행된 뒤(200 반환) 6번 `saveAndFlush` 전에 예외(예: DB 연결 끊김, `OptimisticLockException`)가 발생하면:

- `converted_quantity` 변경이 롤백되어 라인은 여전히 전환 가능 상태가 된다.
- 그러나 slip-service 쪽에서는 이미 slip 이 DB 에 영속화됐다.
- 동일 `idempotencyKey` 로 재시도 시 slip-service 는 409 duplicate 를 반환하여 `slipNo` 를 다시 돌려주므로 이 경우는 멱등하게 복구된다.

반대로 `saveAndFlush` 성공 후 트랜잭션 커밋 전에 외부 오류로 롤백되는 경우도 동일 흐름이다. 이 흐름 자체는 "slip 발행 성공 → partner-order 미갱신" 방향의 불일치라 운영 위험이 있다. Saga/outbox 패턴 없이 단순 `@Transactional` 만으로는 완벽한 원자성이 보장되지 않는다.

더 심각한 방향은 그 반대다: 4번에서 slip-service 가 5xx 를 반환하면 `BusinessException(INTERNAL_ERROR)` 이 throw 되어 트랜잭션이 롤백되므로 `converted_quantity` 누적도 취소된다. 이 경우 슬립이 실제로 발행됐는지 아닌지 모른다(5xx 는 발행 직전 실패일 수도, 직후 응답 실패일 수도 있다). slip-service `idempotencyKey` 가 동일한 키로 재시도 시 idempotency replay 를 제공하므로 재시도 시 복구가 가능하지만, **`converted_quantity` 가 이미 누적되지 않은 상태**이므로 재시도 요청이 별도 API 호출로 와야 한다. 즉, 5xx 시 자동 롤백은 의도된 동작이나, 호출자에게 명시적으로 "재시도 가능" 상태임을 응답에 표현하지 않는다.

**권장**: 현재 설계에서 트랜잭션 부분 커밋 위험을 완전히 제거하려면 outbox 패턴이 필요하다. 단기적으로는 최소한 Javadoc 에 "slip-service 5xx 시 트랜잭션 롤백 → 재시도 가능, slip-service 200 후 partner-order saveAndFlush 실패 시 manual 확인 필요" 운영 가이드를 명시하고, 응답에 재시도 hint 를 포함할 것. 특히 slip-service 200 성공 후 saveAndFlush 실패 시나리오를 IT 로 커버하거나 최소한 P1 이슈로 등록하여 트래킹할 것.

---

## P1 — 중요 결함

### P1-1: idempotencyKey 해시 충돌 — 같은 주문, 같은 라인, 다른 수량의 2회 부분전환

**파일**: `services/partner-order-service/.../service/PartnerOrderConvertService.java:buildIdempotencyKey()`

**문제**:
`buildIdempotencyKey` 는 `SHA-256(orderId + 정렬된 lineId:qty)` 를 사용하며, `"PO-CONV-{orderId}-{hash앞16자}"` 를 반환한다. 이 키는 `lineId:qty` 조합이 동일할 때만 동일하다.

그런데 리뷰 요청에서 명시된 "같은 주문 2회 다른 부분전환 시 키 충돌" 을 점검하면, **lineId 가 다르거나 qty 가 다르면 키가 달라진다**. 이는 의도된 동작이다. 그러나 다음 시나리오가 위험하다:

- 1차 전환: `lineId=A, qty=3` → SHA-256 해시 H1 → slip-service 에 발행 성공
- 2차 전환: `lineId=A, qty=4` (같은 라인, 다른 수량) → SHA-256 해시 H2 → 다른 키 → slip-service 에 새 발행

이 경우 키가 달라지므로 slip-service 는 새 slip 을 발행한다. **이 자체는 의도된 정상 동작이다.** 문제는 **같은 라인, 같은 수량으로 2차 전환을 시도할 때**다:

- 1차: `lineId=A, qty=3` → `converted_quantity=3`, slip 발행 → DB 저장
- 2차: `lineId=A, qty=3` (잔여=7, 동일 라인, 동일 수량) → 같은 idempotencyKey H1 → slip-service 409 duplicate 반환 → 1차 slipNo 재반환

2차 전환 시 `line.convert(3)` 이 먼저 호출되어 `converted_quantity = 6` 으로 누적된 뒤, slip-service 가 409 duplicate 를 반환해도 `PublishResult.duplicate(slipNo)` 를 반환하고 흐름이 계속 진행되어 `order.markConvertedIfComplete()` 와 `saveAndFlush` 까지 실행된다. 결과적으로:

- DB: `converted_quantity = 6` (2번 누적)
- slip: 1차와 동일한 slip 1개만 존재

**동일 라인을 동일 수량으로 2회 전환하면 converted_quantity 가 이중 누적되지만 slip 은 1개만 발행되는 데이터 불일치**가 발생한다. idempotencyKey 가 slip-service 의 중복 발행은 막지만, partner-order-service 쪽의 `converted_quantity` 누적은 막지 못한다.

**권장**: `line.convert(qty)` 를 slip-service 발행 결과 확인 후에 호출하거나, slip-service 409 duplicate 응답 시 `converted_quantity` 를 원래대로 복구(`line.revertConvert(qty)` 도메인 메서드 추가)하거나, 트랜잭션 내에서 idempotency 를 partner-order-service DB 레벨에서도 체크할 것. 가장 단순한 방법은 슬립 발행 전 idempotencyKey 를 DB 에 기록해두고 같은 키 재시도 시 convert 호출 자체를 skip 하는 것이다.

---

### P1-2: `PartnerOrderDetailResponse.LineResponse` — `lineId` / `convertedQuantity` 미노출

**파일**: `services/partner-order-service/.../web/dto/PartnerOrderDetailResponse.java:LineResponse.from()`

**문제**:
리뷰 대상 목록에 `PartnerOrderDetailResponse` 의 `lineId` / `convertedQuantity` 노출이 포함되어 있다. 그런데 현재 `LineResponse` 레코드에 해당 필드가 없고, `LineResponse.from(PartnerOrderLine)` 도 `convertedQuantity` 를 매핑하지 않는다.

FE 의 부분전환 모달은 라인별 잔여 수량을 표시하고 전환할 수량을 입력해야 하므로, `quantity` (주문 수량) 와 `convertedQuantity` (전환 완료 수량) 를 함께 응답에서 제공해야 한다. 또한 `ConvertToSlipRequest.Item` 에서 `orderLineId` 로 `UUID` 를 사용하는데, `LineResponse` 에 `lineId` 필드가 없으면 FE 가 어떤 라인 UUID 를 전환 요청에 포함시켜야 하는지 알 방법이 없다.

UUID 비공개 가드(`feedback_uuid_no_user_visibility`) 원칙상 내부 UUID 를 사용자 화면에 직접 노출하면 안 되지만, 이 `lineId` 는 사용자 표시용이 아니라 FE→BE 폼 전송용 hidden 참조값이다. 설계서에서 이 부분을 어떻게 해결하는지(별도 모델코드 기반 매핑인지, hidden field UUID 인지) 확인이 필요하다. 만약 hidden field UUID 사용이라면 LineResponse 에 추가해야 하고, 모델코드 기반이라면 서비스에서 modelName 으로 라인을 찾는 로직이 필요하다. **현재 `ConvertToSlipRequest.Item` 은 UUID 를 사용하는데 LineResponse 에 lineId 가 없으므로 FE 구현이 불가능한 상태**다.

**권장**: `LineResponse` 에 `lineId` (UUID 또는 숨김용 토큰), `convertedQuantity`, `remainingQuantity` 를 추가하고 `LineResponse.from` 에서 매핑할 것.

---

## P2 — 잠재 결함

### P2-1: `requireConvertible` — CONFIRMED+slipNo=null (PENDING_RETRY) 주문의 이중발행 위험

**파일**: `services/partner-order-service/.../domain/PartnerOrder.java:requireConvertible()`

**문제**:
```java
public void requireConvertible() {
    if (this.slipNo != null) { ... 409 }
    if (this.status == CANCELED || this.status == CONFIRMING) { ... 409 }
}
```

`slipPublishStatus = PENDING_RETRY` 인 주문은 `slipNo = null`, `status = CONFIRMED` 이다. `requireConvertible` 가드에서 이 조합은 통과된다. 즉, slip 발행이 대기 중(outbox 재시도 큐)인 주문에 대해 부분전환을 시도하면 새로운 slip 이 이중 발행될 수 있다.

outbox 재시도가 완료되면 PENDING_RETRY 주문은 `markSlipPublished` 가 호출되어 `slipNo` 가 채워지지만, 그 전에 convert 가 먼저 실행되면 서로 다른 idempotencyKey 로 2개의 slip 이 생성된다.

**권장**: `requireConvertible` 에 `slipPublishStatus == PENDING_RETRY` 거부 조건 추가:
```java
if (this.slipPublishStatus == SlipPublishStatus.PENDING_RETRY) {
    throw new ResponseStatusException(HttpStatus.CONFLICT,
        "출고전표 발행 재시도 중인 주문은 전환할 수 없습니다.");
}
```

---

### P2-2: CONVERTED 상태 주문의 추가 전환 방어 부재

**파일**: `services/partner-order-service/.../domain/PartnerOrder.java:requireConvertible()`

**문제**:
주문이 전량전환되어 `status = CONVERTED` 가 된 경우, 이후 convert 재호출 시 `requireConvertible` 가드를 통과한다. `slipNo = null` 이고 `CANCELED/CONFIRMING` 도 아니기 때문이다.

`markConvertedIfComplete` 가 CONVERTED 로 전환했어도, 이후 `line.convert(qty)` 가 409 를 던지는 것은 `remainingQuantity() = 0` 이기 때문이다. 즉 도메인 가드(`convert(qty)` 의 잔여 0 체크) 가 이를 막는다고 볼 수 있다. 그러나 **모든 라인이 이미 CONVERTED 이지만 일부 라인이 soft-delete 된 경우**, 새 활성 라인이 없으면 `getLines()` 가 빈 리스트를 반환하고 `lineMap` 이 비어있어 요청 `Item` 의 `orderLineId` 가 null 매핑 → `BusinessException(PARTNER_ORDER_UPDATE_INVALID_LINE)` 으로 던진다. 결과적으로 막히기는 하나 409 대신 INVALID_LINE 에러를 반환하므로 클라이언트가 혼란스러울 수 있다.

명시적 가드로 `requireConvertible` 에 `CONVERTED` 상태 거부를 추가하는 것이 더 명확하다.

**권장**: `requireConvertible` 에 `CONVERTED` 상태 거부 추가:
```java
if (this.status == PartnerOrderStatus.CONVERTED) {
    throw new ResponseStatusException(HttpStatus.CONFLICT,
        "이미 전량 전환 완료된 주문입니다.");
}
```

---

## Minor

### Minor-1: `buildIdempotencyKey` SHA-256 앞 16자 잘라내기 — 충돌 확률

**파일**: `PartnerOrderConvertService.java:buildIdempotencyKey()` (마지막 줄)

SHA-256 을 64자로 생성하고 앞 16자(`sb.substring(0, 16)`)만 사용한다. 16자(hex) = 64bit 로 충돌 확률은 `2^-64` 이며, 운영 데이터 규모에서는 실질적 위험이 없다. 그러나 동일 orderId 에서 서로 다른 라인/수량 조합이 우연히 앞 16자가 같을 가능성을 완전히 배제하지 않는다. slip-service 의 `idempotencyKey` UNIQUE 제약이 걸려있으므로 충돌 시 DataIntegrityViolationException 이 발생하고 `handleIdempotencyRaceCondition` 경로를 탄다. `idempotencyKey` 컬럼 max 길이는 `length = 80` 이고, `"PO-CONV-" + UUID(36) + "-" + 16 = 61자`로 충분하다. 앞 24자 또는 32자로 늘리면 충돌 확률을 사실상 0으로 낮출 수 있다.

---

### Minor-2: `PartnerOrderConvertIT` — 2회 연속 부분전환 누적 / PENDING_RETRY 시나리오 누락

**파일**: `services/partner-order-service/.../it/PartnerOrderConvertIT.java`

현재 IT 케이스:
1. 일부전환 → 200 + DB 단언 (1회)
2. 전량전환 → CONVERTED
3. 잔여 초과 → 409
4. slipNo 있는 주문 → 409
5a/5b. 권한 deny/bypass
6. payload captor

누락:
- **케이스 7**: 같은 주문 2차 부분전환 누적 (`convert(3)` → `convert(4)` → `convertedQuantity=7`, 잔여=3 남음)
- **케이스 8**: `slipPublishStatus=PENDING_RETRY` (slipNo=null, status=CONFIRMED) 주문 전환 → P2-1 결함이 수정되면 409 를 기대하는 테스트

이 두 케이스가 없으면 P1-1, P2-1 결함이 IT 에서 검출되지 않는다.

---

### Minor-3: `V41` — `role_page_permission_templates` UNIQUE constraint 의존

**파일**: `services/auth-service/.../V41__seed_partner_order_convert_page.sql`

`ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE` 절을 사용하는데, partial UNIQUE index 가 `(role_code, page_code)` + `is_deleted = FALSE` 조건으로 V39/V40 패턴과 동일하게 생성되어 있어야 한다. V39/V40 을 확인하지 않으면 DDL 전제 불일치로 마이그레이션이 실패할 수 있다. V39/V40 에서 동일 partial index 가 이미 생성됐다면 문제없으나, 명시적 주석으로 "V39 partial UNIQUE INDEX 의존" 을 기술하면 가독성이 높아진다.

---

## 결론

**BE APPROVE 불가.**

필수 수정:
- **P0-1**: `warehouseCode="DEFAULT"` 폴백 제거 또는 WarehouseCodeMapper 시드 보장 + Map→typed DTO 전환 검토
- **P0-2**: 트랜잭션/외부 REST 부분 커밋 위험 운영 가이드 명시 또는 outbox 연동
- **P1-1**: 동일 라인 동일 수량 2회 전환 시 `converted_quantity` 이중 누적 방어 (slip-service 409 duplicate 응답 시 revert 또는 partner-order 레벨 idempotency)
- **P1-2**: `LineResponse` 에 `lineId` / `convertedQuantity` / `remainingQuantity` 추가

권고 수정:
- **P2-1**: `requireConvertible` 에 `PENDING_RETRY` 거부 추가
- **P2-2**: `requireConvertible` 에 `CONVERTED` 명시적 거부 추가
- **Minor-2**: IT 케이스 7(2차 부분전환 누적), 케이스 8(PENDING_RETRY 주문 변환) 추가
