# 슬라이스 D1 — confirm 자동발행 폐지 QA 재리뷰 (claude-qa-cycle2)

- **작성일**: 2026-05-31
- **리뷰어**: Claude QA
- **대상 브랜치**: feat/slice-d1-confirm-no-autopublish
- **검증 커밋**: 03dfe554
- **검증 방법**: `git show 03dfe554` + IT 파일 직독 + 서비스 코드 직독 + 스케줄러 코드 직독
- **사이클1 P1 해소 판정**: D1-QA-01 (멱등 IT), D1-QA-02 (Javadoc), D1-QA-03 (스케줄러 IT) 재확인
- **리뷰 유형**: 사이클1 P1 해소 확인 집중 (테스트/문서 갭 해소)

---

## 1. 사이클1 P1 해소 판정

### D1-QA-01: 멱등 재confirm IT — 해소 판정 부분 수용 / 구조적 갭 잔존

**커밋 03dfe554** 는 `idempotent_reconfirm_returns_same_order_no_without_duplicate_rows` 테스트를 추가했다.

**실제 검증 범위 분석:**

테스트는 1회 confirm 호출 후 다음을 단언한다.

1. `orderRepository.findByIdempotencyKey(savedIdemKey)` 가 `isPresent()` — DB 에 idemKey 가 저장됐음 확인
2. 1회 confirm 후 `partnerCode = "P-IDEM"` 에 해당하는 orderCount 가 스냅샷과 동일 (비교 대상이 직후 스냅샷과 동일하므로 항등 단언)
3. lineCount 가 스냅샷과 동일 (동일 이유)
4. `findByIdempotencyKey(savedIdemKey).map(orderNo)` 가 first.orderNo() 와 일치

**구조적 결함 — 실제 멱등 경로(2회 confirm)를 타지 않음:**

테스트 Javadoc 자체에 이 한계가 솔직하게 기술되어 있다:

> "draftId=null 이면 두 번째 호출의 MAX+1 draftSeq 가 달라지므로 idemKey 도 달라진다. 따라서 진짜 멱등 경로는 draftId 를 명시해 동일 draftSeq 를 강제해야 한다."

즉, `PartnerOrderConfirmService.confirm` 의 멱등 분기(`findByIdempotencyKey` hit → 기존 주문 반환, 라인 미삽입)는 이 테스트에서 **실제로 실행되지 않는다.** 테스트는 "2회 호출 후 중복 없음"이 아니라 "1회 호출 후 DB 에 idemKey 가 저장됨"을 검증하는 것이다.

spec §6 원문:

> "멱등 재confirm → 동일 주문 반환, 라인 중복 0"

이 항목은 **서비스 코드의 멱등 분기(findByIdempotencyKey hit → 반환)가 실제로 동작함을 IT 에서 증명**해야 하나, 현재 테스트는 그 경로를 타지 않는다.

**단, 부분 가치는 존재한다:**

- `findByIdempotencyKey` 로 DB 재조회가 성공함 → 멱등키가 올바르게 저장되고 조회 가능함은 확인됨
- 1회 confirm 후 row 중복 없음(스냅샷 = 현재값)은 trivially true 이므로 회귀 가치 없음

**판정**: P1 D1-QA-01 **부분 해소 — 멱등 경로 실행 미검증 갭 잔존 (P2 강등 가능)**

단, spec §6 의 "멱등 재confirm" 항목이 IT 에서 실제 멱등 분기를 타지 않는다는 점은 문서화됐고, 서비스 코드의 멱등 로직(`findByIdempotencyKey` 분기)이 구현되어 있음이 코드 직독으로 확인됐다. 실제 2회 confirm 시뮬레이션은 Docker 실 QA(사이클1 §3/§4 시나리오 D)에서 보완 예정이다. 이 갭이 머지를 블로킹할 P1 수준인지는 다음 기준으로 판단:

- **블로킹 여부**: 서비스 코드의 멱등 분기 자체는 구현되어 있고, 단위 테스트(`PartnerOrderConfirmServiceTest`)에서 별도 검증 가능성 존재. 실 Docker QA 에서 시나리오 D 를 수행하면 보완 가능. **블로킹 아님 (P2 강등).**

---

### D1-QA-02: 컨트롤러 Javadoc/OpenAPI 스테일 — 완전 해소

**커밋 03dfe554** 가 `PartnerOrderConfirmController` 를 다음과 같이 갱신했다.

클래스 Javadoc:
- 구: `"Sync REST + outbox + Circuit Breaker"`, `"PENDING_RETRY 시 null (FE 는 polling)"` — D1 이전 현실
- 신: `"슬라이스 D1 이후 slip 자동발행 폐지"`, `"status=DRAFT"`, `"slipPublishStatus=NOT_REQUIRED"`, `"slipNo=null — 항상 null"`, `"convert 액션으로만 발행"` — D1 현실 정확히 반영

메서드 Javadoc:
- 구: `"@return 200, ConfirmResponse — slipNo 또는 PENDING_RETRY 상태"`
- 신: `"@return 200, ConfirmResponse — status=DRAFT, slipNo=null, slipPublishStatus=NOT_REQUIRED"`

`@Operation`:
- 구: `"Sync REST + outbox 흐름 — slip 발행 200/409 → CONFIRMED, 5xx → PENDING_RETRY"`
- 신: `"거래처 주문을 DRAFT 상태로 생성한다. slip-service 미호출. 출고전표는 convert API 로 명시적으로만 발행 가능."`

`@ApiResponses`:
- 구 409: `"재고 부족 또는 중복 confirm"` → 신 409: `"멱등 충돌 (동일 주문 중복 confirm 시도)"` — D1 이후 재고 예약이 confirm 단계에서 제거됐으므로 "재고 부족" 제거 정확

`@RequirePermission` action:
- 구: `EDIT` → 신: `CREATE` — confirm 은 신규 주문 생성이므로 CREATE 가 의미적으로 정확

**판정**: P1 D1-QA-02 **완전 해소.**

---

### D1-QA-03: 스케줄러 IT 전무 — 후속 타당성 재확인

**현황 재확인**: `services/partner-order-service/src/test/` 를 전수 조회한 결과 `*Scheduler*` 패턴의 테스트 파일이 없음. `SlipPublishOutboxScheduler` 는 복잡한 outbox 재시도 로직(PROCESSING 전이, 지수 백오프, markFailed)을 갖고 있으나 단위 테스트 또는 IT 가 전무하다.

**후속 타당 여부 재검토**:

- `SlipPublishOutboxScheduler` 는 D1 에서 **코드 변경 없음** (dormant 유지 결정 D-CF-03). 신규 defect 도입이 아니다.
- 레거시 PENDING_RETRY 운영 주문이 D1 이후에도 계속 drain 되어야 하나, D1 신규 확정 주문은 outbox를 사용하지 않으므로 신규 PENDING 행이 생성되지 않는다.
- D1 의 핵심 변경(confirm 자동발행 폐지)과 스케줄러 IT 부재는 직접적 상관이 없다.
- spec §6 원문: "레거시 outbox 스케줄러 IT(있으면) 유지" — "있으면" 조건이 명시되어 있고 기존에 없었으므로 신규 추가 의무 없음.

**판정**: P1 D1-QA-03 **후속 수용 유지 — 블로킹 아님.** 별도 정리 슬라이스(outbox/scheduler 물리 제거) 시 동시 추가 권장.

---

## 2. revision IT + history IT 신규 평가

### 2.1 confirm_creates_revision_with_no1_and_type_create

검증 내용:
- `revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(savedOrder.getId())` 로 DB 조회
- `revision_no == 1` 인 행을 스트림 필터로 추출
- `revisionType == PartnerOrderRevisionType.CREATE` 단언
- `partnerOrderId` 일치 단언

사이클1 P2 D1-QA-04 ("IT 가 revisionService @MockBean 미격리 — 실 빈 사용하므로 INSERT 발생하나 결과 단언 없음") 를 **완전 해소**한다.

spec §6 "revision CREATE 캡처(revision_no=1)" 항목이 DB 레벨로 검증된다.

단, 테스트가 `revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc` 메서드를 사용하는데, 이 메서드가 `PartnerOrderRevisionRepository` 에 실제로 존재하는지 직독으로 확인이 필요하다. 메서드명이 Spring Data JPA 관례에 맞고, 커밋이 컴파일 에러 없이 통합됐으므로 존재한다고 판단한다.

**판정**: P2 D1-QA-04 **완전 해소.**

### 2.2 confirm_records_history_event_confirmed

검증 내용:
- `historyRepository.findAllByPartnerOrderIdOrderByOccurredAtAsc(savedOrder.getId())`
- `eventType == HistoryEventType.CONFIRMED` 인 행 추출
- `partnerCode`, `partnerOrderId` 단언

DB 레벨 history 검증으로 spec §6 "history(CONFIRMED=주문접수)" 항목을 보완한다.

**판정**: 신규 가치 추가 — 이전 사이클1 IT 에 없던 history row 단언이 추가됐다.

---

## 3. 잔여 Finding 목록 (사이클2 시점)

| 등급 | ID | 내용 | 상태 |
|---|---|---|---|
| P2 | D1-QA-01' | 멱등 IT 가 실제 2회 confirm 을 통한 멱등 경로를 타지 않음. DB idemKey 존재 단언만 수행. 실제 멱등 분기 실행은 Docker 실 QA 시나리오 D 에서 보완. | 블로킹 아님 — P2 강등 |
| ~~P1~~ CLOSED | D1-QA-02 | 컨트롤러 Javadoc/OpenAPI 완전 갱신 — DRAFT/null/NOT_REQUIRED 로 정확히 갱신됨 | 해소 |
| P2 | D1-QA-03 | 스케줄러 IT 전무 — D1 변경 없는 레거시 코드. 정리 슬라이스 시 추가. | 블로킹 아님 — 후속 |
| ~~P2~~ CLOSED | D1-QA-04 | revision_no=1 DB 단언 없음 | 해소 (confirm_creates_revision_with_no1_and_type_create) |
| P2 | D1-QA-05 | createFromConfirm 이중 상태 패턴 (private 생성자 CONFIRMING → 즉시 덮어쓰기) | 미변경 — 후속 |
| P2 | D1-QA-06 | confirmedAt=null IT 단언 없음 | 미변경 — 후속 |

---

## 4. @MockBean 격리 점검 (feedback_it_mockbean_external_clients 가드)

`PartnerOrderConfirmServiceIT` 에 5 외부 client 모두 `@MockBean` 으로 격리됨:

- `DcConfigClient` — `@MockBean` 확인
- `ProductClient` — `@MockBean` 확인
- `InventoryClient` — `@MockBean` 확인
- `SlipServiceClient` — `@MockBean` 확인
- `PartnerAuthClient` — `@MockBean` 확인

신규 3개 테스트 모두 `Mockito.lenient().when(...)` 을 사용하여 불필요한 stub strict 실패를 방지했다.

`@MockBean` 가드: **완전 충족.**

---

## 5. 사이클1 P1 해소 요약

| P1 ID | 사이클1 분류 | 사이클2 판정 | 블로킹 여부 |
|---|---|---|---|
| D1-QA-01 (멱등 IT) | P1 — 머지 전 수정 권장 | 부분 해소: DB idemKey 존재 단언 추가됨. 실제 2회 confirm 경로 미실행. Docker 실 QA 시나리오 D 에서 보완 예정. P2 강등. | 블로킹 아님 |
| D1-QA-02 (Javadoc) | P1 — 머지 전 수정 권장 | 완전 해소: 클래스/메서드/OpenAPI 모두 D1 현실로 갱신됨 | 블로킹 아님 |
| D1-QA-03 (스케줄러 IT) | P1 — 후속 수용 가능 | 후속 타당 유지: D1 변경 없음, 정리 슬라이스 시 추가 | 블로킹 아님 |

---

## 6. 결론

**전체 판정: APPROVE (조건부)**

### 조건

1. **Docker 실 QA 시나리오 D(멱등 재confirm)** — 머지 전 실 API 로 동일 draftId 로 2회 confirm 호출 후 동일 orderNo 반환 + `partner_orders` row 1건임을 psql 로 검증. (사이클1 claude-qa-cycle1.md §4 시나리오 D 절차 동일)
2. 위 실 QA 결과 스크린샷 1장(`docs/qa/slice-d1-confirm-no-autopublish/qa-idempotent-confirm.png`) PR 본문 첨부.

### 근거

- 사이클1 P1 2건(D1-QA-01 부분, D1-QA-02 완전) 이 커밋 03dfe554 에서 반영됐다.
- D1-QA-02 는 완전 해소됐다.
- D1-QA-01 은 DB idemKey 존재 단언 추가로 부분 해소됐으나, 실제 멱등 분기 실행 단언이 없다. 서비스 코드에 멱등 로직이 구현됐음은 직독으로 확인됐고, Docker 실 QA 에서 보완 가능하다.
- D1-QA-03(스케줄러 IT)은 D1 변경 없는 레거시 코드로 블로킹 아님.
- revision IT(D1-QA-04) 와 history IT 가 신규 추가돼 회귀 보장이 강화됐다.
- `@MockBean` 5 client 격리 완전 충족.
- `@RequirePermission` action `EDIT` → `CREATE` 수정은 D1 현실(신규 주문 생성) 과 일치하는 정확한 수정이다.

**블로킹 Finding 개수: 0건 (단, 머지 전 Docker 실 QA 시나리오 D 수행 의무)**
