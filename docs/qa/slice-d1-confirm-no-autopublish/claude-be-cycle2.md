# BE 리뷰 — 슬라이스 D1 사이클2 (commit 03dfe554)

- 리뷰어: Claude BE agent
- 대상 커밋: 03dfe554
- 대상 파일:
  - `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderConfirmServiceIT.java`
  - `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderConfirmController.java`

---

## P1 해소 판정 (사이클1 CHANGES_REQUESTED 3건)

### P1-1: 멱등 재confirm IT (`idempotent_reconfirm_returns_same_order_no_without_duplicate_rows`)

**판정: 부분 해소 — 핵심 멱등 경로(findByIdempotencyKey hit) 미검증**

근거:

테스트 Javadoc(130~155행)에서 스스로 인정하고 있다.

> "draftId=null 이면 두 번째 호출의 MAX+1 draftSeq 가 달라지므로 idemKey 도 달라진다."
> "실제 멱등 경로(동일 idemKey hit)는 DB 에 이미 저장된 key 로 재조회함으로써 확인:"

테스트가 검증하는 것은 다음 두 가지다:

1. `orderRepository.findByIdempotencyKey(savedIdemKey)` → `isPresent()` — DB에 해당 key가 저장됐는가 (단순 존재 확인).
2. 1회 confirm 후 `partnerCode=P-IDEM` 주문 row count, `lineCountAfterFirst == lineCountNow` — 동일 시점 비교이므로 항등이 보장된다.

**실제로 검증하지 못한 것:**

사이클1 P1의 핵심 요구사항은 `findByIdempotencyKey hit` 경로(서비스 111~115행)가 실제로 실행되는지, 즉 동일 `idempotencyKey`로 **2회 confirm 호출** 시 두 번째 호출이 기존 주문을 반환하고 새 row를 삽입하지 않음을 단언하는 것이었다. 현재 테스트는 2회 confirm을 실제로 호출하지 않는다. `when: 동일 idemKey 로 2회 confirm 시뮬레이션` 주석 아래에 실제 `confirmService.confirm()` 두 번째 호출이 없다. 대신 `findByIdempotencyKey` 조회만 수행하고 "idemKey가 DB에 있다"를 단언하는 데 그친다.

row 중복 0 단언(`orderCountNow == orderCountAfterFirst`, `lineCountNow == lineCountAfterFirst`)은 1회 호출 직후와 `findByIdempotencyKey` 조회 직후를 비교하는 것으로, 2회 호출에 의한 중복 삽입 여부를 검증하지 않는다.

**진짜 멱등 경로를 검증하는 최소 구현:**

```java
// draftId=고정UUID로 동일 draftSeq를 강제한 뒤
UUID draftId = UUID.randomUUID();
// 단, draftRepository에 row를 미리 insert 해야 resolveDraftSeq가 동작함
// 또는 동일 partnerCode + 2회 confirm에서 첫 번째 저장 orderNo를 확인하는 방식
ConfirmResponse second = confirmService.confirm(partnerCode, bizCode, "user-idem-2", "홍길동", null, request2);
assertThat(second.orderNo()).isEqualTo(first.orderNo());
long orderCountAfterSecond = orderRepository.findAll().stream()
        .filter(o -> o.getPartnerCode().equals(partnerCode)).count();
assertThat(orderCountAfterSecond).isEqualTo(orderCountAfterFirst);
```

현재 테스트가 실제로 멱등 서비스 로직(서비스 111~115행 if 분기)을 실행시키지 않으므로 P1-1은 **미완 해소**다.

---

### P1-2: revision CREATE IT (`confirm_creates_revision_with_no1_and_type_create`)

**판정: 해소**

근거:

- `revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(savedOrder.getId())` — `PartnerOrderRevisionRepository`의 실제 메서드 사용, 경로 정확.
- `revisionNo == 1` 필터 후 `orElseThrow` — revision_no=1 row 존재 단언.
- `firstRevision.getRevisionType() == PartnerOrderRevisionType.CREATE` — type 단언.
- `firstRevision.getPartnerOrderId() == savedOrder.getId()` — 소속 주문 UUID 단언.

서비스 코드(163~165행)에서 `revisionService.capture(order, PartnerOrderRevisionType.CREATE, null, actorId, actorName, null)` 가 `@Transactional` confirm 트랜잭션 내에서 호출되고, `capture` → `saveWithNextRevisionNo` → `findMaxRevisionNo(null→0) + 1 = 1` → `saveAndFlush` 경로가 명확하다. 테스트가 이 경로의 DB 결과를 정확히 단언한다.

---

### P1-3: history CONFIRMED IT (`confirm_records_history_event_confirmed`)

**판정: 해소**

근거:

- `historyRepository.findAllByPartnerOrderIdOrderByOccurredAtAsc(savedOrder.getId())` — `PartnerOrderHistoryRepository`의 실제 메서드 사용, 경로 정확.
- `h.getEventType() == HistoryEventType.CONFIRMED` 필터 후 `orElseThrow` — CONFIRMED row 존재 단언.
- `confirmedEvent.getPartnerCode() == partnerCode` + `confirmedEvent.getPartnerOrderId() == savedOrder.getId()` — 소속 주문 UUID와 partnerCode 단언.

서비스 코드(155~157행)에서 `historyRepository.save(PartnerOrderHistory.ofOrder(order.getId(), partnerCode, HistoryEventType.CONFIRMED, ...))` 호출이 확인된다. `HistoryEventType.CONFIRMED` 상수가 실제 enum에 존재(14행)하고, `ofOrder` 팩토리 메서드가 `partnerOrderId`를 채운다. 테스트 단언과 코드가 일치한다.

---

## 신규 결함 / 회귀 분석

### N1: `PartnerOrder.getLines()` Lazy 초기화 — 안전 판정

`@OneToMany(mappedBy = "partnerOrder", cascade = CascadeType.ALL, orphanRemoval = false)` 는 JPA 기본 fetch가 LAZY다. `PartnerOrderSnapshot.from(order)` 내부에서 `order.getLines()` 를 호출하는데(snapshot L117), 이 호출은 confirm 서비스의 `@Transactional` 범위(ConfirmService.confirm) 내에서 이루어진다. `orderRepository.save(order)` 후 영속 컨텍스트가 살아있고 `order.lines`는 confirm 흐름 중 `addLine()`으로 이미 인메모리 초기화된 상태다. 따라서 Lazy proxy 실제 DB 조회가 발생하지 않는다. LazyInitializationException 위험 없음.

한편 IT의 revision/history 테스트에서 `orderRepository.findByOrderNo(response.orderNo())` 로 엔티티를 새로 로드한 뒤, 해당 엔티티의 `lines`에 직접 접근하지 않고 `lineRepository.findAllByPartnerOrder_Id(savedOrderAfterFirst.getId())` 를 별도 호출한다. Javadoc 주석(189~191행) 에서도 "lazy 컬렉션이므로 lineRepository 로 직접 조회"라고 명시했다. 올바른 우회 방식이고 트랜잭션 경계 문제 없다.

---

### N2: P1-1 — 멱등 테스트의 구조적 한계가 미래 회귀를 차단하지 못한다 (등급: P1 잔존)

멱등 경로(서비스 111~115행)는 현재 테스트로 전혀 실행되지 않는다. 만약 해당 if 분기 내부에 버그(예: `ConfirmResponse.from()` 이외 다른 코드가 추가되어 side effect 발생)가 생겨도 이 테스트가 잡지 못한다. 사이클1 P1 요건("멱등 재confirm — findByIdempotencyKey hit 확인 + 주문/라인 row 중복 0 검증")이 이 테스트로는 충족되지 않는다.

---

### N3: 컨트롤러 Javadoc vs 실제 동작 일치 여부

컨트롤러 Javadoc(24~43행) 내용:
- `status=DRAFT`, `slipPublishStatus=NOT_REQUIRED`, `slipNo=null` — 코드(createFromConfirm 176~181행)와 일치.
- 멱등 보장 설명 (`"PO-CONF-" + partnerCode + "-" + draftSeq`) — 서비스 109행과 일치.
- draftId=null 시 MAX+1 draftSeq — resolveDraftSeq 182행과 일치.
- `@Operation`, `@ApiResponses` 추가 — 코드 변경 없이 문서만 갱신. 기존 로직에 영향 없음.

**판정: 동작 일치, 코드 미변경 확인.**

단, `@ApiResponse(responseCode = "409", description = "멱등 충돌 (동일 주문 중복 confirm 시도)")` 는 현재 서비스 로직에서 409를 throw하지 않는다 — 멱등 hit 시 기존 주문을 정상 200으로 반환한다. 409는 revision_no 채번 충돌(`DataIntegrityViolationException` 2회 재시도 후)에서만 발생한다. 문서가 멱등 시나리오를 409로 오기술했다. 심각도: Minor (Javadoc 오기술, 동작 코드 무영향).

---

### N4: 기존 `confirm_creates_draft_order_without_slip_publish` / `confirm_does_not_enqueue_outbox` 테스트 — 이상 없음

2개 기존 테스트는 commit 전부터 존재한 사이클1 기본 케이스로, 신규 커밋에서 변경 없음. IT 클래스 구조, `@MockBean` 5개 (DcConfigClient / ProductClient / InventoryClient / SlipServiceClient / PartnerAuthClient) 모두 격리 — 외부 Eureka 미활성 환경에서 안전.

---

## 종합 결론

**CHANGES_REQUESTED**

| # | 항목 | 판정 |
|---|---|---|
| P1-1 | 멱등 재confirm IT | 미완 해소 — 2회 호출 없음, findByIdempotencyKey hit 경로 미실행 |
| P1-2 | revision revision_no=1 / type=CREATE IT | 해소 |
| P1-3 | history CONFIRMED IT | 해소 |
| N3 | 컨트롤러 Javadoc @ApiResponse 409 오기술 | Minor (신규 결함, 동작 무영향) |

**잔여 finding: 2건 (P1-1 미완 해소 1건, N3 Minor 1건)**

P1-1이 해소되지 않아 CHANGES_REQUESTED를 유지한다. P1-2, P1-3은 정확히 해소됐다.
