# Phase 2.6c BE 코드 리뷰 — claude-be-cycle2

> 브랜치: `feat/phase-2-6c-inventory-deduction` (HEAD `a292ac40`)
> 리뷰어: Claude BE agent (cycle 2)
> 기준 커밋: cycle1 결함 목록(`claude-be-cycle1.md`, HEAD `c4f517e1` 기준)
> cycle2 수정 커밋: `7fe9bb1c` (cycle1 5팀 결함 수정), `a292ac40` (CI 잔여 IT 3종 수정)

---

## 종합 판정

**APPROVE (cycle2)**

cycle1 에서 제기된 P0/P1/P2 결함 전체를 확인하였다. P1-1, P1-2 는 정확히 해소되었다. P2 3건은 비차단 잔여로 전환된다. 신규 P0/P1 없음. CI fix 회귀 없음.

---

## cycle1 결함 해소 여부 표

| 결함 ID | 내용 요약 | 해소 여부 | 근거 |
|---|---|---|---|
| P1-1 | reserve no-op double-release | **해소** | 상세 검증 §1 참조 |
| P1-2 | SENT PARTNER_ORDER cancel 우회 | **해소** | 상세 검증 §2 참조 |
| P2-1 | findByCode Javadoc soft-delete 명시 | **잔여(비차단)** | 미반영 — WarehouseRepository.findByCode() Javadoc 미변경. @SQLRestriction 엔티티 레벨 필터 의존 여전함. 기능 결함 아님 |
| P2-2 | SHA-256 이중계산 | **잔여(비차단)** | 미반영 — buildIdempotencyKey / buildConvertKeyUuid 각각 sha256hex(raw) 독립 호출 구조 유지. 성능·정합성 무결함 |
| P2-3 | ConvertIT stub 주석 미갱신 | **잔여(비차단)** | 미반영 — PartnerOrderConvertIT Javadoc @검증케이스 섹션 Phase 2.6c stub 갱신 안 됨. 기능 결함 아님 |

---

## §1: P1-1 double-release 해소 검증

### 1-1. ReservationResponse.alreadyReserved 필드

`ReservationResponse`(inventory-service) 는 7-인자 레코드로 재정의되었으며 `alreadyReserved` boolean 필드가 추가되었다.

- 멱등 no-op 경로: `StockService.reserve()` 115~121행 — 기존 RESERVE movement 존재 시 `alreadyReserved=true` 로 생성된 `ReservationResponse` 반환.
- 정상 예약 경로: 131~133행 — 6-인자 하위 호환 생성자 사용 → `alreadyReserved=false` 기본값.
- 하위 호환 6-인자 생성자가 `release` 응답과 기존 경로에 사용되어 컴파일 오류 없음.

### 1-2. InventoryClient.ReservationResult 분기

`InventoryClient` 에 `ReservationResult` 이너 레코드가 추가되었다.

- `reserved()` = `alreadyReserved=false`, `noop()` = `alreadyReserved=true`.
- `reserve(5인자)` 응답에서 `envelope.data.alreadyReserved` 를 추출하여 분기 반환 (129~140행). JSON 역직렬화 시 `Map<String, Object>` 에서 `Boolean.TRUE.equals(flag)` 로 안전하게 읽음.
- 레거시 3-인자 `reserve(productId, warehouseId, quantity)` 는 `noop=false` 고정으로 위임 — confirm 경로 호환 유지.

### 1-3. PartnerOrderConvertService.convert() skip 로직

155~169행:

```
if (!result.alreadyReserved()) {
    reservedLines.add(new ReservedLine(productId, warehouseId, item.quantity()));
}
```

`alreadyReserved=true` 이면 `reservedLines` 에 추가되지 않는다. 이후 `compensateReserved(reservedLines, ...)` 가 해당 라인에 대해 `release` 를 호출하지 않으므로 double-release 구조적으로 불가능.

### 1-4. release() no-op 방어 가드

`StockService.release()` 149~164행: `referenceType + referenceId` 가 있고 대응 RESERVE movement 가 없으면 `balance` 미변경 no-op 반환. `reservedQty` 음수 방지. 구현 정확.

**판정: P1-1 완전 해소.**

---

## §2: P1-2 SENT cancel 우회 해소 검증

`Slip.cancel()` 1058~1065행:

```java
if (SlipSourceType.PARTNER_ORDER.equals(this.sourceType)) {
    throw new BusinessException(ErrorCode.CONFLICT,
            "주문 전환 출고전표는 취소할 수 없습니다. ...");
}
```

- 가드 위치: `CANCELABLE_STATUSES` 상태 체크(1066행) **이전** — sourceType 가드가 상태 조건과 무관하게 먼저 발동.
- `CANCELABLE_STATUSES = {DRAFT, SAVED, SENT}` 는 변경 없음 → 비-PARTNER_ORDER 전표 DRAFT/SAVED/SENT cancel 회귀 0.
- 비-PARTNER_ORDER cancel 경로: sourceType 가드 미해당 → 기존 상태 체크 → `requireNotLocked()` → `status=CANCELED` 정상 전이.

**판정: P1-2 완전 해소. 비-PARTNER_ORDER 회귀 없음.**

---

## §3: CI fix 회귀 검증

### 3-1. StockService.reserve() balance 미존재 → CONFLICT(409) 변경

`reserve()` 102~105행: `stockBalanceRepository.findBy...` 미존재 시 `ErrorCode.CONFLICT` 로 던진다.

deduct 경로(`loadBalanceOrThrow`, 323~328행): 여전히 `ErrorCode.NOT_FOUND` 를 던진다. 변경 없음 — **deduct 경로 회귀 없음.**

기존 reserve 호출처:
- `PartnerOrderConfirmService` 는 `inventoryClient.reserve(3인자)` 를 stub 하여 테스트 (`PartnerOrderConfirmServiceIT` 74행, 98행). 실 호출 경로에서 `PartnerOrderConfirmService` 는 Phase 2.6c 에서 inventoryClient 필드를 제거했으므로(`PartnerOrderConfirmService.java` 80~81행 주석 참조) confirm 흐름에서 inventory.reserve() 실 호출이 없다. **confirm 회귀 없음.**

단, `PartnerOrderConfirmServiceIT` 는 여전히 `@MockBean InventoryClient` 를 선언하고 `inventoryClient.reserve(3인자)` stub 을 설정하고 있다(74행, 98행). ConfirmService 가 더 이상 `inventoryClient` 를 주입받지 않으므로 이 stub 은 사용되지 않는 dead stub 이다. 테스트 결과에 영향 없으나, 미래 유지보수 혼선 가능성이 있다(P2 이하 수준).

### 3-2. receivedAt LocalDateTime fix

`Phase26cReserveIT.inbound()` 헬퍼의 `receivedAt` 값을 `"2026-01-01"` → `"2026-01-01T00:00:00"` 으로 수정 (275행). `InboundRequest.receivedAt` 는 `LocalDateTime` 타입이므로 날짜-only 문자열은 Jackson 파싱 오류. 테스트 데이터 수정만 — 구현 로직 불변.

---

## §4: 신규 IT 정합 검증

### 4-1. Phase26cConvertReserveIT

**R4 멱등**: 1차 요청 성공 후 `convertedAfterFirst=3` 단언. 2차 요청 시 `inventoryClient.reserve → noop()` stub, `slipServiceClient.publishFromPartnerOrder → 동일 slipNo` stub. 2차 성공 후 `verify(inventoryClient, never()).release(...)` 로 no-op 라인 release 미호출 단언. `convertedAfterSecond=6`(3+3) — 2차 요청이 별개의 수량 전환으로 처리됨.

주의 사항: R4 의 2차 요청에서 `convertedBefore=3`으로 바뀌어 `idempotencyKey` 가 달라진다. 따라서 R4 는 "완전히 동일한 idempotencyKey 재전송" 시나리오라기보다 "no-op reserve + 추가 converted 증가" 시나리오이다. `idempotencyKey` 변경으로 인해 slip-service 는 새 전표를 발행할 수 있다는 점이 테스트 설명과 미묘하게 불일치하나, P1-1 핵심 보증("no-op 라인에 대해 release 미호출")은 정확히 검증된다. 기능 결함 아님.

**M5 멀티라인**: 선행 A `reserved()`, 후행 B `CONFLICT` stub. `verify(inventoryClient).release(productIdA, ...)` 단언 + `verify(inventoryClient, never()).release(productIdB, ...)` 단언. `slip 미발행` + `converted_quantity=0` 단언. 완전한 시나리오 검증.

**@Transactional**: 클래스 레벨 `@Transactional` 선언(78행) + Javadoc 설명(72~75행). MockMvc 요청은 별도 서블릿 트랜잭션에서 처리 → 커밋 후 `jdbcTemplate` DB 단언이 작동한다는 설계가 코멘트로 명시됨.

### 4-2. Phase26cSlipImmutableIT S5

- S5 `publishPartnerOrderSlip` → `status=SENT` 단언(214행) 후 `POST /slips/{id}/cancel` 호출 → `status().isConflict()` 단언(221행).
- `Slip.cancel()` sourceType 가드가 발동하여 409 반환. 이후 `slipRepository.findBySlipNo` 재조회 → `status=SENT` 불변 단언(225행).
- cancel 경로 URL `/slips/{id}/cancel` 이 `SlipController` 실제 매핑과 일치함을 확인 필요. cycle1 CI fix 커밋 메시지에 "/api/v1/slips→/slips/{id}/cancel(실제 SlipController 매핑)"으로 수정됨이 명시됨 — 정확히 반영됨.

### 4-3. Phase26cReserveIT T2-1~5

| 케이스 | 검증 항목 | 판정 |
|---|---|---|
| T2-1 | 정상 reserve — availableQty=7, reservedQty=3 | PASS |
| T2-2 | 멱등 reserve 2회 — reservedQty=4 고정, balance 단일 반영 | PASS |
| T2-3 | 가용 부족(10 요청, 5 가용) → 409 | PASS |
| T2-4 | release 후 availableQty=10, reservedQty=0 복원 | PASS |
| T2-5 | balance 조회 — availableQty=13, reservedQty=7, totalQty=20 | PASS |

---

## §5: 도메인 규칙 최종 확인

| 도메인 규칙 | 구현 위치 | 판정 |
|---|---|---|
| 주문 = 재고 무영향 | PartnerOrderConfirmService — inventoryClient 필드 제거(80행 주석) | PASS |
| confirm reserve 제거 | PartnerOrderConfirmService 필드 목록 + R6 IT 단언 | PASS |
| 전환 = 예약(reserve) | PartnerOrderConvertService step 5(155~175행) | PASS |
| 가용 부족 409 사전차단 | StockService.reserve() balance guard(104행) + 부족 시 IllegalState→CONFLICT | PASS |
| 발행 실패 → release 보상 | PartnerOrderConvertService step 7(191~196행) + compensateReserved | PASS |
| 전환전표 발행 즉시 SENT 불변 | Phase26cSlipImmutableIT S1 + Slip.send() 도메인 메서드 | PASS |
| 수정 차단(SENT) | requireEditable() EDITABLE_STATUSES={DRAFT,SAVED} + S2 IT | PASS |
| 삭제 차단(SENT) | deleteForSales() EDITABLE_STATUSES 검사 + S3 IT | PASS |
| 취소 차단(PARTNER_ORDER) | Slip.cancel() sourceType 가드 + S5 IT | PASS |

---

## §6: 신규 결함

### P0 (머지 차단)

없음.

### P1 (릴리즈 전 필수)

없음.

### P2 이하 (비차단 잔여)

1. **PartnerOrderConfirmServiceIT dead stub**: `inventoryClient.reserve(3인자)` stub 이 설정되지만 ConfirmService 에서 inventoryClient 가 주입 제거되어 사용되지 않는다. 테스트는 통과하나 미래 리팩토링 혼선 소지. 제거 권장.

2. **P2-1/P2-2/P2-3**: cycle1 잔여 — 본 cycle 에서도 미반영. 기능 결함 아님. 차단 아님.

---

## 요약

| 우선순위 | 건수 | 요약 |
|---|---|---|
| P0 (머지 차단) | 0 | 없음 |
| P1 (릴리즈 전 필수) | 0 | 없음 |
| P2 (권고) | 4 | findByCode Javadoc(P2-1), SHA-256 이중계산(P2-2), ConvertIT stub 주석(P2-3), ConfirmServiceIT dead stub(신규) |

**APPROVE (cycle2)**

P1-1 double-release 방지(ReservationResponse.alreadyReserved + PartnerOrderConvertService no-op skip + StockService.release() no-op 가드)와 P1-2 SENT PARTNER_ORDER cancel 차단(Slip.cancel() sourceType 가드) 모두 구조적으로 정확하게 구현되었다. CI fix 회귀(deduct 경로, confirm 경로) 없음. IT 3종 의미 검증 이상 없음. 차단 결함 없음.
