# BE 코드 리뷰 — 슬라이스 D1 (confirm 자동발행 폐지)
**리뷰어**: Claude BE  
**날짜**: 2026-05-31  
**대상 브랜치**: `feat/slice-d1-confirm-no-autopublish`  
**결론**: **CHANGES_REQUESTED**

---

## 1. 정합성 — `createFromConfirm`

### [PASS] DRAFT + NOT_REQUIRED + confirmedAt=null 정확
`PartnerOrder.java:177-180` — `createFromConfirm` 은 private 생성자를 통해 객체를 생성한 뒤 `status=DRAFT`, `slipPublishStatus=NOT_REQUIRED`, `confirmedAt=null` 을 명시적으로 재설정한다. private 생성자(L137-139)가 CONFIRMING + PENDING_RETRY + `confirmedAt=now()` 를 기본값으로 세팅하므로, 팩토리에서 이 세 필드를 덮어 쓰는 구조는 정확하다.

### [PASS] createFromEstimate 와 구조 일관
`createFromEstimate`(L190-204) 도 동일하게 private 생성자 → DRAFT + NOT_REQUIRED + `confirmedAt=null` 패턴을 따른다. `createFromConfirm` 은 `sourceEstimateId`/`dueDate`/`memo` 를 세팅하지 않는데, Javadoc에 "거래처 직접 주문이므로 sourceEstimateId 없음"이 명시되어 있고 스펙(§3.1)과 일치한다.

### [WARN-P2] 필드 직접 접근 — 규칙 허용 범위 내이나 주석 보강 필요
`createFromConfirm` 내부에서 `order.status = PartnerOrderStatus.DRAFT` 등 필드를 직접 설정한다. 프로젝트 컨벤션("도메인 메서드만 사용, reflection/setter 직접 호출 금지")의 취지는 외부에서의 직접 접근 금지이며, 동일 클래스 내 private 필드 접근은 Java 언어 수준에서 허용된다. `createFromEstimate` 도 동일 패턴이므로 일관성은 있으나, Javadoc 에 "동일 클래스 내 internal mutation — setter/reflection 금지 원칙과 무관" 한 줄을 명시하면 후속 리뷰어의 혼선을 방지할 수 있다.

---

## 2. slip 블록 제거 완전성

### [PASS] slip 발행 블록 전부 제거
`PartnerOrderConfirmService.java` diff 기준:
- `slipServiceClient.publishFromPartnerOrder` 호출 블록 제거 (확인)
- `markSlipPublished` 호출 + `SLIP_PUBLISHED` history 제거 (확인)
- `markSlipPendingRetry` 호출 + `outboxRepository.save` + `SLIP_RETRY_QUEUED` history 제거 (확인)
- `buildSlipPayload` / `serialize` private 메서드 제거 (확인)
- `slipServiceClient` / `outboxRepository` 필드 제거 (확인)
- `ObjectMapper` 의존 필드 제거 (확인)

### [PASS] history CONFIRMED(주문접수) + revision CREATE 캡처 유지
L155-157: `HistoryEventType.CONFIRMED` history INSERT 유지.  
L162-165: `revisionService.capture(order, PartnerOrderRevisionType.CREATE, ...)` 유지.  
두 항목 모두 spec §3.1 "history(CONFIRMED=주문접수) + revision CREATE 캡처 유지" 를 충족한다.

---

## 3. 회귀 / dormant

### [PASS] outbox 스케줄러 무변경
`SlipPublishOutboxScheduler.java` 는 이번 diff 에 포함되지 않았으며, `slipServiceClient` / `outboxRepository` / `markSlipPublished` / `markSlipFailedPermanent` 를 그대로 사용 중이다. 레거시 PENDING_RETRY 주문의 drain 경로는 안전히 보존된다.

### [PASS] `markSlipPublished` / `markSlipPendingRetry` 레거시 잔존
두 메서드에 "레거시(슬라이스 D1 이후) … 후속 제거" Javadoc 이 추가되어 deprecated 표식이 되어 있다. 스케줄러 + 기존 outbox 행이 계속 참조하므로 삭제하지 않은 결정은 spec D-CF-03 과 정확히 일치한다.

### [PASS] convert 흐름 무영향
`PartnerOrderConvertService` 는 `slipServiceClient` / `inventoryClient` 를 독립 DI 로 사용하며, `PartnerOrderConfirmService` 의 변경과 의존 관계 없다.

### [PASS] from-estimate 무변경
`PartnerOrderFromEstimateService` 는 이번 diff 범위 외이며, 독립 팩토리(`createFromEstimate`)를 사용하므로 영향 없다.

---

## 4. 멱등

### [PASS] idempotencyKey 가드 유지
`ConfirmService.java:108-116` — `PO-CONF-{partnerCode}-{draftSeq}` + `findByIdempotencyKey` 가드가 그대로 유지된다.

---

## 5. 미사용 제거 부작용

### [PASS] 제거된 의존의 다른 참조 없음
- `SlipServiceClient`: ConfirmService 에서 삭제. ConvertService / 스케줄러에서 독립 사용 중 — 충돌 없음.
- `SlipPublishOutboxRepository`: ConfirmService 에서 삭제. 스케줄러에서 독립 사용 중 — 충돌 없음.
- `ObjectMapper`: ConfirmService 에서 삭제. `serialize` 메서드가 유일 사용처였으며 함께 삭제됨 — 충돌 없음.

### [PASS] 유지 대상 생존 확인
- `historyRepository` (L65): 유지. `HistoryEventType.CONFIRMED` 기록에 계속 사용.
- `revisionService` (L73): 유지. CREATE 캡처에 계속 사용.
- `entityManager` (L75): 유지. `nextOrderNo()` advisory lock 에 계속 사용.

---

## 6. 테스트 품질

### [PASS] IT 케이스 1: `confirm_creates_draft_order_without_slip_publish`
- `response.slipNo()` null 검증 (PASS)
- `response.status()` == "DRAFT" 검증 (PASS)
- `response.slipPublishStatus()` == "NOT_REQUIRED" 검증 (PASS)
- `Mockito.verify(slipServiceClient, never()).publishFromPartnerOrder(...)` (PASS) — slip-service 미호출 명시 검증

### [PASS] IT 케이스 2: `confirm_does_not_enqueue_outbox`
- `before = outboxRepository.count()` + 호출 후 `count() == before` 검증 — outbox 불변 확인 (PASS)
- `response.status()` == "DRAFT" 검증 (PASS)

### [PASS] 외부 client 전부 @MockBean
`InventoryClient`, `SlipServiceClient`, `PartnerAuthClient`, `DcConfigClient`, `ProductClient` 5종 모두 `@MockBean` — `feedback_it_mockbean_external_clients` 규칙 충족.

### [FAIL-P1] revision CREATE 캡처 IT 미검증
spec §6: "revision CREATE 캡처(revision_no=1)" 검증 필수. 두 IT 케이스 모두 `revisionRepository` Autowire 없음. `revisionService.capture()` 호출이 실제로 `partner_order_revisions` 에 row 를 INSERT 했는지 DB 수준에서 검증하지 않는다.  
→ `PartnerOrderRevisionRepository` Autowire 후 `findByPartnerOrderId...()` 로 size=1, type=CREATE 검증 추가 필요.

### [FAIL-P1] history CONFIRMED 이벤트 IT 미검증
spec §6 + 체크포인트 2에서 "revision CREATE 베이스라인 + history CONFIRMED 이벤트 유지" 를 명시. IT에서 `historyRepository` 를 Autowire 하여 `HistoryEventType.CONFIRMED` 행이 INSERT 되었는지 검증하는 assertion 이 없다.

### [FAIL-P1] 멱등 재confirm IT 미검증
spec §6: "멱등 재confirm → 동일 주문 반환, 라인 중복 0". 현재 두 IT 케이스 모두 재호출 시나리오가 없다. 동일 `idempotencyKey` 로 두 번 호출했을 때 주문이 중복 생성되지 않음을 실제 DB 조회로 검증해야 한다.

### [WARN-P2] 단위테스트 `PartnerOrderConfirmServiceTest` 에서 `PartnerOrder.create()` 사용
`PartnerOrderConfirmServiceTest.java:93` — `order(String orderNo)` 헬퍼가 `PartnerOrder.create(...)` 를 사용한다. `create()` 는 레거시 CONFIRMING + PENDING_RETRY 상태로 생성되는 팩토리인데, 단위테스트의 테스트 대상 fixture 로 사용하는 것이 혼란스럽다. 해당 헬퍼는 `orderRepository.findAllByOrderNoStartingWith()` stub 용 객체를 만드는 것이므로 동작상 문제는 없지만(`nextOrderNo` 만 테스트), `createFromConfirm` 으로 교체하면 레거시 `create()` 와의 명시적 의도 분리가 더 명확해진다.

### [INFO-P2] 두 번째 IT 케이스 중복 커버리지 약화
케이스 1(`confirm_creates_draft_order_without_slip_publish`)이 slipNo=null + status=DRAFT + NOT_REQUIRED + verify(never) 를 모두 검증하고 있어, 케이스 2(`confirm_does_not_enqueue_outbox`)는 outbox count 불변만 추가한다. 케이스 2 단독 실패 시 어떤 라인의 outbox 변경이 문제인지 추적하기 어렵다. 각 케이스에 `orderNo` 로 DB 직접 조회 후 `SlipPublishStatus` / `status` 검증을 추가하면 독립성이 높아진다.

---

## 요약 — Finding 목록

| 등급 | 위치 | 문제 | 제안 |
|---|---|---|---|
| P1 | `PartnerOrderConfirmServiceIT.java` (전체) | revision CREATE row IT 미검증 | `revisionRepository` Autowire + size=1, type=CREATE assert 추가 |
| P1 | `PartnerOrderConfirmServiceIT.java` (전체) | history CONFIRMED 이벤트 IT 미검증 | `historyRepository` Autowire + `CONFIRMED` history row assert 추가 |
| P1 | `PartnerOrderConfirmServiceIT.java` (전체) | 멱등 재confirm IT 케이스 없음 | 동일 idempotencyKey 재호출 → 동일 주문 반환 + 라인 중복 0 케이스 추가 |
| P2 | `PartnerOrder.java:175-181` | `createFromConfirm` Javadoc — 내부 필드 직접 설정 규칙 근거 미기재 | "동일 클래스 내 internal mutation" 주석 1줄 추가 |
| P2 | `PartnerOrderConfirmServiceTest.java:93` | `order()` 헬퍼가 레거시 `PartnerOrder.create()` 사용 | `createFromConfirm` 또는 fixture 목적 주석으로 혼선 제거 |
| P2 | `PartnerOrderConfirmServiceIT.java` (케이스 2) | 두 번째 IT 케이스의 status/slipPublishStatus 독립 검증 부재 | 케이스 2 에도 DB 직접 조회 assertions 추가 권장 |

**P1 Finding 3건 → CHANGES_REQUESTED**

P1 세 항목(revision CREATE IT 검증, history CONFIRMED IT 검증, 멱등 재confirm IT)은 spec §6 의 명시적 테스트 전략 요건이며, 이 중 하나라도 누락되면 슬라이스의 회귀 방어선이 구멍난다. 특히 revision CREATE 미검증은 spec 이 "revision CREATE 캡처(revision_no=1)" 를 명시적 검증 항목으로 지정했으므로 거짓 통과로 간주한다.

핵심 도메인 로직(createFromConfirm DRAFT+NOT_REQUIRED, slip 블록 제거, dormant 레거시 메서드 유지, idempotencyKey 가드, convert/스케줄러 무영향)은 모두 정확하고 spec 과 일치한다.
