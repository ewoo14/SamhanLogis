# Phase 2.6a BE 코드 리뷰 — claude-be-cycle2

- 브랜치: `feat/phase-2-6-order-to-slip-conversion` (HEAD 30b2c6d7)
- 비교 범위: `20ebc7da..30b2c6d7` (cycle1 fix diff)
- 리뷰 일자: 2026-05-30
- 리뷰어: Claude BE agent (cycle 2 — cycle1 fix cross-check)

---

## 요약

| 등급 | 건수 |
|------|------|
| P0 (블로커) | 0 |
| P1 (중요 결함) | 0 |
| P2 (잠재 결함) | 1 |
| Minor | 2 |

cycle1 P0-1·P0-2 + P1-1·P1-2 전부 수정 확인. **BE APPROVE (cycle2)**.

---

## cycle1 결함 수정 확인

### P0-1 (warehouseCode "DEFAULT" 폴백) — 수정 확인

`PartnerOrderConvertService.convert()` 내 수정 내용:

```
// 수정 전
if (req.warehouseCode() != null && !req.warehouseCode().isBlank()) {
    payload.put("warehouseCode", req.warehouseCode());
} else {
    payload.put("warehouseCode", "DEFAULT");
}

// 수정 후
// 2a. warehouseCode 검증 — "DEFAULT" 폴백 금지
if (req.warehouseCode() == null || req.warehouseCode().isBlank()) {
    throw new ResponseStatusException(CONFLICT, "warehouseCode 는 필수입니다.");
}
payload.put("warehouseCode", req.warehouseCode());
```

"DEFAULT" 폴백이 완전히 제거되고 명시적 409 CONFLICT 로 변환됨. ConvertToSlipRequest Javadoc 에도 "명시적 값 필수, null/blank 시 409" 명시됨. 정합.

---

### P0-2 (트랜잭션 재설계 — 발행 성공 후 converted 누적) — 수정 확인 + 세부 검증

**순서 재설계**:

```
수정 전: line.convert(qty) → slip 발행 → saveAndFlush
수정 후: 잔여 사전검증(convert 없이) → slip 발행 → 발행성공 후 line.convert(qty) → saveAndFlush
```

**사전검증이 모든 라인을 커버하는가?**

`for (ConvertToSlipRequest.Item item : req.items())` 루프에서 전 아이템을 순회하며 각각:
1. `item.quantity() <= 0` 검증 (양수 강제)
2. `item.quantity() > line.remainingQuantity()` 검증 (잔여 초과 차단)

모두 통과한 아이템만 `validatedItems` 에 추가. 루프 도중 한 라인이 잔여 초과면 즉시 `ResponseStatusException(409)` 던져 slip 발행 전에 전체 차단. 정합.

**발행 성공 후 convert 단계의 예외 위험 (비차단 — 2.6c)**:

Javadoc 과 메서드 주석에 다음이 명시됨:
> "slip 성공 후 saveAndFlush 실패는 드물지만 발생 시 슬립은 발행된 상태이므로 운영자가 slipNo 로 수동 converted_quantity 보정 필요 (로그에 orderId 기록)"

2.6c 에서 outbox 패턴으로 보강 예정. cycle1 지적의 "P0-2 V29/P1-3 inventory/배포순서 = dev-report(2.6c)" 커밋 메시지와 일치. 수용.

**markConvertedIfComplete 호출 순서 정합성**:

```java
// 5. 발행 성공 후 converted_quantity 누적
for (ConvertToSlipRequest.Item item : validatedItems) {
    PartnerOrderLine line = lineMap.get(item.orderLineId());
    line.convert(item.quantity()); // 발행 성공 후
}

// 6. 전량 전환 시 주문 CONVERTED 표시 + DB 영속화
order.markConvertedIfComplete();
orderRepository.saveAndFlush(order);
```

`line.convert()` 호출로 `convertedQuantity` 누적 완료 후 `markConvertedIfComplete()` 를 호출하므로 `isFullyConverted()` 판단이 최신 값으로 이루어짐. 순서 정합.

---

### P1-1 (idempotencyKey convertedBefore 스냅샷) — 수정 확인 + 시나리오 검증

**수정 내용**:

```java
// 수정 전
.map(item -> item.orderLineId() + ":" + item.quantity())

// 수정 후
.map(item -> {
    PartnerOrderLine line = lineMap.get(item.orderLineId());
    int convertedBefore = line.getConvertedQuantity(); // 발행 직전 스냅샷
    return item.orderLineId() + ":" + convertedBefore + ":" + item.quantity();
})
```

**시나리오 A (발행 전 재시도 — 동일 키)**:
- 1차 요청 실패(5xx → 롤백) → convertedQuantity 변화 없음 → convertedBefore 동일 → SHA-256 동일 키 → slip-service 409-dup replay 또는 신규 발행. 정합.

**시나리오 B (발행 성공 후 2차 부분전환 — 다른 키)**:
- 1차 성공: `lineId=A, convertedBefore=0, qty=3` → 키 K1 → convertedQuantity=3 저장
- 2차: `lineId=A, convertedBefore=3, qty=3` → 키 K2 ≠ K1 → slip-service 새 발행 → convertedQuantity=6. 정상 2회 누적.

IT case7 이 이 시나리오를 실제로 검증함 (`key1.isNotEqualTo(key2)` + `convertedAfter2=7`). 정합.

---

### P1-2 (LineResponse lineId / convertedQuantity 미노출) — 별도 확인 불필요

cycle1 fix 커밋 메시지 "FE (linkedSlipNo 필드명 BE 일치 확인 — 버그 아님)" 에 언급된 대로, P1-2 는 이전 초기 구현(e1bed2d4) 에서 이미 LineResponse 에 lineId / convertedQuantity 가 추가된 것을 확인. cycle1 리뷰 당시 코드(0c79ef4d) 기준의 지적이었으며, 최종 HEAD(30b2c6d7) 에서는 이미 반영 상태임. 별도 diff 없는 이유 확인됨.

---

### P2-1 (PENDING_RETRY 이중발행) — 화이트리스트 방식으로 상위 차단, 수정 확인

cycle1 P2-1 은 `requireConvertible` 에 PENDING_RETRY 조건 추가를 권고했다. 수정된 코드:

```java
// 수정 전 (블랙리스트)
if (status == CANCELED || status == CONFIRMING) → 409

// 수정 후 (화이트리스트)
if (status != DRAFT && status != ON_HOLD) → 409
```

CONFIRMED(PENDING_RETRY 포함), CONVERTED, CONFIRMING, CANCELED 전부 화이트리스트에서 제외되어 한 번에 차단. P2-1 의 PENDING_RETRY 별도 조건 추가보다 더 강한 방어임. IT case9 가 `CONFIRMED + slipNo=null + PENDING_RETRY` 셋업으로 409 를 검증함. 정합.

**case9 셋업 정확성 검증**:
```sql
INSERT INTO partner_orders (..., slip_no, status, slip_publish_status, ...)
VALUES (?, ..., NULL, 'CONFIRMED', 'PENDING_RETRY', ...)
```
`slipNo=null`, `status=CONFIRMED`, `slipPublishStatus=PENDING_RETRY` — PENDING_RETRY 주문의 정확한 상태 재현. 정합.

---

### P2-2 (CONVERTED 상태 명시적 거부) — 화이트리스트로 포함, 수정 확인

화이트리스트 방식 전환으로 CONVERTED 도 명시적으로 차단됨. IT case8 이 `status='CONVERTED'` 주문으로 409 를 검증. 정합.

---

### Minor-1 (SHA-256 16자 잘라내기) — 미수정, 수용

16자(64bit) 유지. 커밋 주석 "PO-CONV- prefix(8) + orderId(36) + -(1) + hash(16) = 61자 ≤ length=80" 으로 이유 명시됨. 충돌 확률 2^-64 는 운영 규모에서 실질 위험 없음. 수용.

---

### Minor-3 (V41 partial UNIQUE 의존) — 해당 파일 미변경, 별도 확인 필요

cycle1 fix diff 에 V41 파일 변경 없음. auth-service 마이그레이션 확인이 2.6c 배포 전 필요함(P2 잔여, 아래 참조).

---

## 신규 검토 항목

### [1] V8 CHECK 제약 기존 마이그레이션 충돌 여부

V8 파일은 이 브랜치에서만 존재하며 main 에 V8 이 없음을 확인:

```
main 의 최신 마이그레이션: V7__add_partner_order_revisions.sql (Phase 2.4, 머지 완료)
브랜치의 V8: V8__add_partner_order_line_converted_quantity.sql (신규, V7 직후)
```

V7 이 main 에 이미 있고 V8 은 이 브랜치에만 있으므로 **머지 전 V 번호 충돌 없음**. ADD COLUMN 에 `DEFAULT 0` 이 있어 기존 데이터 마이그레이션도 안전. CHECK 제약 `chk_converted_quantity_range` 이름도 기존 constraint 와 중복 없음(V1~V7 에 없음). 정합.

---

### [2] confirm/from-estimate 발행 회귀 (sourceOrderLineId null)

`PartnerOrderConfirmService.buildSlipPayload()` 는 `sourceOrderLineId` 를 포함하지 않음. `SlipLine.create` 는 sourceOrderLineId 없는 호환 오버로드(`SlipLine.create(... note)` 9파라미터 버전) 가 존재하여 `null` 로 처리됨.

slip-service `SlipPublishService.resolveLines()` 에서 `l.sourceOrderLineId()` 를 `PublishLineRequest` 에서 취득하는데, confirm 흐름은 `PublishFromPartnerOrderRequest` 의 `lines` 필드가 `List<PublishLineRequest>` 이고, 기존 confirm 페이로드 Map 에 `sourceOrderLineId` 키가 없으면 Jackson 역직렬화 시 `UUID sourceOrderLineId = null` 이 됨. `resolveLines` 에서 `l.sourceOrderLineId()` 가 null 로 전달되고 `SlipLine.create(..., null)` 호출 → `sourceOrderLineId` 필드 null 저장. legacy 호환 오버로드 설계 의도와 일치. 회귀 없음.

---

### [3] IT case7 2키 검증 — false-green 위험 없음

case7 은 `mockMvc.perform` 2회 호출 사이에 `Mockito.reset(slipServiceClient)` + `lenient().when(...).thenReturn(PublishResult.published("2026/05/30-2"))` 를 수행. `verify(slipServiceClient).publishFromPartnerOrder(captor2, keyCaptor2)` 가 reset 이후 1번 호출을 검증하므로 1차 호출과 2차 호출의 captor 가 혼합되지 않음. `key1.isNotEqualTo(key2)` 는 convertedBefore(0 vs 3) 차이로 SHA-256 이 달라져 사실상 확정적으로 다름(false-green 위험 없음). DB 단언 `convertedAfter2=7` 도 실제 누적을 검증. 정합.

---

### [4] ON_HOLD 주문 전환 (견적전환 DRAFT 정상 통과 회귀)

`requireConvertible` 화이트리스트에 `ON_HOLD` 도 포함됨:

```java
if (this.status != PartnerOrderStatus.DRAFT && this.status != PartnerOrderStatus.ON_HOLD) → 409
```

DRAFT → 전환 가능, ON_HOLD → 전환 가능, 나머지 → 409. 견적전환 흐름(`from-estimate`)은 주문을 DRAFT 로 생성하므로 회귀 없음. hold → convert 시나리오도 허용됨(Phase 2.6a 설계 의도에 따름). 정합.

---

## 잔여 P2 (비차단, 머지 전 확인 필요)

### P2-R1: auth-service V41 partial UNIQUE INDEX 전제 (Minor-3 승격)

**파일**: `services/auth-service/.../V41__seed_partner_order_convert_page.sql`

cycle1 fix diff 에 V41 변경 없으나 리뷰 대상 브랜치에 포함 여부를 확인하지 않음. V41 에서 `ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE` 절을 사용한다면, V39/V40 에서 해당 partial UNIQUE INDEX 가 이미 생성됐는지 확인 필요. 머지 전 auth-service 마이그레이션 시퀀스 점검 권고.

**영향**: 마이그레이션 실패 시 배포 차단.

---

## 결론

**BE APPROVE (cycle2)**

cycle1 P0-1 / P0-2 / P1-1 / P1-2 전부 수정 확인. 신규 결함 없음.

잔여 비차단 항목:
- P2-R1 (auth-service V41 마이그레이션 전제) — 머지 전 개발책임자 확인 권고
- P0-2 slip 성공 후 saveAndFlush 실패 시나리오 — 2.6c outbox 패턴 완성 시 해소 예정
