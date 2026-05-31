# 슬라이스 D1 — confirm 자동발행 폐지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 거래처 포털 confirm 을 slip 자동발행 없이 DRAFT(진행중) 주문 생성으로 변경하여 from-estimate 경로와 일원화한다.

**Architecture:** `PartnerOrderConfirmService.confirm` 에서 slip 발행 블록(publish + markSlipPublished/markSlipPendingRetry + outbox enqueue + SLIP_* history)을 제거하고, 주문을 신규 factory `PartnerOrder.createFromConfirm`(status=DRAFT, slipPublishStatus=NOT_REQUIRED)로 생성한다. 출고전표는 기존 명시적 convert 액션으로만 발행. outbox/scheduler 는 dormant 유지.

**Tech Stack:** Spring Boot 3.3 / Java 17 / JPA / Testcontainers — partner-order-service. (FE: 거래처 포털 confirm 응답 slipNo 비의존 확인.)

**Spec:** `docs/superpowers/specs/2026-05-31-confirm-no-autopublish-design.md`
**Branch:** `feat/slice-d1-confirm-no-autopublish` (진행 중)

---

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `services/partner-order-service/.../domain/PartnerOrder.java` | 주문 애그리거트 | Modify — `createFromConfirm` factory 추가, 레거시 메서드 deprecated 주석 |
| `services/partner-order-service/.../service/PartnerOrderConfirmService.java` | confirm 서비스 | Modify — slip 발행 블록 제거 + createFromConfirm 사용 + 미사용 의존 제거 |
| `services/partner-order-service/.../it/PartnerOrderConfirmServiceIT.java` | confirm IT | Modify — DRAFT/slipNo null/slip 미호출/outbox 0 단언으로 재작성 |
| `services/partner-order-service/.../service/PartnerOrderConfirmServiceTest.java` | confirm 단위테스트 | Modify(필요 시) — slip 단언 제거 |
| `docs/dev-reports/slice-d1-confirm-no-autopublish.md` | dev-report | Create |
| `migration/decisions/DECISIONS.md` | 결정 | Modify — D-CF-01~03 |
| `docs/handoff/CURRENT-WORK.md` | 핸드오프 | Modify — D1 완료 기록 |

---

## Task 1: confirm 자동발행 제거 + DRAFT 주문 생성

**Files:**
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java`
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java`
- Modify: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderConfirmServiceIT.java`

- [ ] **Step 1: confirm IT 재작성 (실패)**

`PartnerOrderConfirmServiceIT.java` 의 두 테스트 메서드를 아래로 교체(다른 부분 유지). import 에 `org.mockito.Mockito.verify`/`never` 사용 추가:

```java
    @Test
    void confirm_creates_draft_order_without_slip_publish() {
        UUID productId = UUID.randomUUID();
        Mockito.when(dcConfigClient.fetchDcConfig(Mockito.anyString()))
                .thenReturn(Map.of());
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "헬로멀티 5kW", "HM-5000", null,
                        new BigDecimal("1000000"), "ACTIVE")));

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 1, "remark-1")));
        ConfirmResponse response = confirmService.confirm(
                "P-DRAFT", "1234567890", "user-draft", null, null, request);

        // 주문만 생성 — slip 미발행, 진행중(DRAFT)
        assertThat(response.slipNo()).isNull();
        assertThat(response.status()).isEqualTo("DRAFT");
        assertThat(response.slipPublishStatus()).isEqualTo(SlipPublishStatus.NOT_REQUIRED.name());

        // slip-service 미호출
        Mockito.verify(slipServiceClient, Mockito.never())
                .publishFromPartnerOrder(Mockito.anyMap(), Mockito.anyString());
    }

    @Test
    void confirm_does_not_enqueue_outbox() {
        UUID productId = UUID.randomUUID();
        Mockito.when(dcConfigClient.fetchDcConfig(Mockito.anyString()))
                .thenReturn(Map.of());
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "헬로멀티 7kW", "HM-7000", null,
                        new BigDecimal("1500000"), "ACTIVE")));

        long before = outboxRepository.count();

        ConfirmRequest request = new ConfirmRequest(List.of(
                new ConfirmLineRequest(productId, "homemulti", 1, null)));
        ConfirmResponse response = confirmService.confirm(
                "P-NOOUTBOX", "9876543210", "user-nooutbox", null, null, request);

        assertThat(response.status()).isEqualTo("DRAFT");
        // confirm 은 더 이상 outbox 에 enqueue 하지 않는다
        assertThat(outboxRepository.count()).isEqualTo(before);
    }
```

> `inventoryClient` @MockBean 은 유지(confirm 미사용이지만 다른 bean 의존 격리). `SlipServiceClient` stub 은 제거(미호출이므로 불필요).

- [ ] **Step 2: IT 실패 확인**

Run: `./gradlew :services:partner-order-service:test --tests "com.samhanair.logis.partnerorder.it.PartnerOrderConfirmServiceIT"`
Expected: 컴파일은 되나 `confirm_creates_draft_order_without_slip_publish` FAIL (현재 status=CONFIRMED + slipNo 채워짐 + slip 호출됨).
> Docker 필요(Testcontainers). 미기동 시 skip — Docker 기동 후 재실행.

- [ ] **Step 3: PartnerOrder.createFromConfirm factory 추가**

`PartnerOrder.java` 의 `createFromEstimate` 메서드 아래에 추가(같은 패턴, sourceEstimateId 없음):

```java
    /**
     * 거래처 포털 confirm 흐름 — slip 미발행 DRAFT 주문 생성 (슬라이스 D1).
     *
     * <p>confirm 자동발행 폐지(D-CF-02). 주문은 진행중(DRAFT) + slipPublishStatus=NOT_REQUIRED 로
     * 생성되며, 출고전표는 이후 명시적 convert 액션으로만 발행된다. from-estimate 경로
     * ({@link #createFromEstimate})와 동형(주문생성 일원화). sourceEstimateId 는 없다(거래처 직접 주문).
     *
     * @param partnerCode 거래처 코드
     * @param bizCode 사업자번호
     * @param orderNo 사용자 표시용 주문번호
     * @param idempotencyKey 멱등 키 (PO-CONF-{partnerCode}-{draftSeq}) — 주문 중복생성 가드
     * @param totalAmount DC 적용 후 server-side 합계
     * @return DRAFT 상태의 신규 PartnerOrder (영속화 전)
     */
    public static PartnerOrder createFromConfirm(String partnerCode, String bizCode, String orderNo,
                                                 String idempotencyKey, BigDecimal totalAmount) {
        PartnerOrder order = new PartnerOrder(partnerCode, bizCode, orderNo, idempotencyKey, totalAmount);
        order.status = PartnerOrderStatus.DRAFT;
        order.slipPublishStatus = SlipPublishStatus.NOT_REQUIRED;
        order.confirmedAt = null;
        return order;
    }
```

기존 `create`/`markSlipPublished`/`markSlipPendingRetry` 메서드 Javadoc 에 한 줄 추가:
```java
     * <p><b>레거시(슬라이스 D1 이후)</b>: confirm 자동발행 폐지로 신규 흐름 미사용. 레거시 PENDING_RETRY
     * 주문 / outbox 스케줄러 호환을 위해 유지(코드 물리 제거는 후속).
```

- [ ] **Step 4: confirm 서비스 slip 블록 제거**

`PartnerOrderConfirmService.java`:

(a) `confirm` 메서드의 주문 생성부 — `PartnerOrder.create(...)` 를 `PartnerOrder.createFromConfirm(...)` 로 교체:
```java
        PartnerOrder order = PartnerOrder.createFromConfirm(
                partnerCode, bizCode, orderNo, idempotencyKey, BigDecimal.ZERO);
```

(b) step 6 의 slip 발행 블록 전체 삭제 — 다음을 제거:
```java
        // 6) slip-service 발행 — Sync REST (Idempotency-Key)
        Map<String, Object> slipPayload = buildSlipPayload(order);
        try {
            PublishResult result = slipServiceClient.publishFromPartnerOrder(
                    slipPayload, idempotencyKey);
            order.markSlipPublished(result.slipNo());
            historyRepository.save(PartnerOrderHistory.ofOrder(
                    order.getId(), partnerCode, HistoryEventType.SLIP_PUBLISHED,
                    actorUserId,
                    "{\"slipNo\":\"" + result.slipNo() + "\",\"duplicate\":" + result.duplicate() + "}"));
        } catch (BusinessException ex) {
            if (ex.getErrorCode() == ErrorCode.INTERNAL_ERROR) {
                order.markSlipPendingRetry();
                outboxRepository.save(SlipPublishOutbox.queue(
                        order.getId(), idempotencyKey, serialize(slipPayload)));
                historyRepository.save(PartnerOrderHistory.ofOrder(
                        order.getId(), partnerCode, HistoryEventType.SLIP_RETRY_QUEUED,
                        actorUserId, "{\"reason\":\"" + ex.getMessage() + "\"}"));
                log.warn("slip-service 5xx → outbox queued (orderNo={}, idemKey={})", orderNo, idempotencyKey);
            } else {
                throw ex;
            }
        }
```
→ confirm 은 주문 INSERT(④⑤) + revision CREATE 캡처(기존 유지) 후 바로 `ConfirmResponse.from(order)` 반환.

(c) 미사용 멤버/메서드 제거(클래스 내 다른 참조 없음을 grep 확인 후):
- `private final SlipServiceClient slipServiceClient;`
- `private final SlipPublishOutboxRepository outboxRepository;`
- `private final ObjectMapper objectMapper;` (serialize 외 사용 없으면)
- `buildSlipPayload(...)`, `serialize(...)` private 메서드
- 미사용 import: `SlipServiceClient`, `SlipServiceClient.PublishResult`, `SlipPublishOutbox`, `SlipPublishOutboxRepository`, `ObjectMapper`, `JsonProcessingException`, `LinkedHashMap`, `ArrayList` 등(컴파일러/IDE 기준 정리).

> 주의: `historyRepository` 의 `CONFIRMED` 이벤트(주문 접수)는 유지. `revisionService.capture(... CREATE ...)` 유지.

- [ ] **Step 5: IT 통과 확인**

Run: `./gradlew :services:partner-order-service:test --tests "com.samhanair.logis.partnerorder.it.PartnerOrderConfirmServiceIT"`
Expected: 2 tests PASS.

- [ ] **Step 6: 단위테스트 + 전체 partner-order 테스트 회귀**

`PartnerOrderConfirmServiceTest.java` 를 Read — slip 발행/PENDING_RETRY 를 단언하거나 `slipServiceClient`/`outboxRepository` 를 stub 하는 부분이 있으면 D1 동작(DRAFT, slip 미호출)에 맞게 수정 또는 해당 단언 제거.
Run: `./gradlew :services:partner-order-service:test`
Expected: 전체 PASS (PartnerOrderConvertIT 등 회귀 포함, skipped=0). 실패 시 slip 의존 단언만 D1 정합으로 수정(범위 외 로직 변경 금지).

- [ ] **Step 7: 커밋**

```bash
git add services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java \
        services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java \
        services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderConfirmServiceIT.java \
        services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmServiceTest.java
git commit -m "feat(partner-order): confirm 자동발행 폐지 — DRAFT 주문 생성 (슬라이스 D1)"
```

---

## Task 2: FE — 거래처 포털 confirm 응답 slipNo 비의존 확인

**Files:**
- (확인 후 필요 시) 거래처 포털 confirm 호출 클라이언트

- [ ] **Step 1: confirm 호출처 식별**

Grep 으로 confirm API(`/api/v1/partner-orders.../confirm` 또는 partner 포털 confirm) 호출처를 찾는다:
```
clients 전반에서 "confirm" + "partner-order" / "/confirm" 호출 코드 검색
```
대상 후보: `clients/web/order-app`, `clients/mobile`, `clients/desktop`. 실제 호출 파일 식별.

- [ ] **Step 2: slipNo 의존 여부 점검**

confirm 성공 핸들러가 응답의 `slipNo`/`slipPublishStatus` 를 화면에 표시하거나 분기하는지 확인.
- **비의존(orderNo 만 사용)**: 변경 없음 — "주문이 접수/확정되었습니다" 메시지 유지. Task 종료.
- **의존(slipNo 표시/분기)**: slipNo=null 안전 처리 + 메시지를 slip 비의존("주문이 접수되었습니다")으로 조정. 표시하던 slipNo 제거(어차피 내부 식별자, UUID 비공개 원칙상 노출 부적절).

- [ ] **Step 3: (변경 시) 타입체크/린트 + 커밋**

변경이 있었을 때만:
```bash
cd clients/<해당 client>; npm run typecheck; npm run lint
```
Expected: 0 err.
```bash
git add clients/<해당 client>/...
git commit -m "fix(fe): 거래처 포털 confirm 성공 처리 slipNo 비의존화 (슬라이스 D1)"
```
변경이 없으면 "FE 무변경 — confirm 응답 slipNo 비의존 확인" 으로 보고하고 커밋 생략.

---

## Task 3: 문서 동기화 (dev-report + DECISIONS + 핸드오프)

> [[feedback_continuous_docs_sync]] — 본 슬라이스 PR 에 포함.

**Files:**
- Create: `docs/dev-reports/slice-d1-confirm-no-autopublish.md`
- Modify: `migration/decisions/DECISIONS.md`
- Modify: `docs/handoff/CURRENT-WORK.md`

- [ ] **Step 1: dev-report 작성**

`docs/dev-reports/slice-d1-confirm-no-autopublish.md` — 섹션: 목표/배경(confirm 자동발행 강결합 → 폐지), 변경 요약(slip 블록 제거 + createFromConfirm + outbox dormant), 함수 단위 문서(`createFromConfirm` 한국어 Javadoc 인용 + confirm 흐름 변경 지점), 테스트(IT 2케이스 + 회귀), 운영 영향(confirm 무 회계전표 → 명시 convert 필요), 후속(D2 병합 / outbox 물리 제거).

- [ ] **Step 2: DECISIONS 추가**

`migration/decisions/DECISIONS.md` 끝에 D-CF 섹션 추가(spec §2 표 인용): D-CF-01(2.6b 분할) / D-CF-02(confirm=DRAFT slip 미발행) / D-CF-03(outbox dormant). 산출/커밋 SHA/spec·plan·dev-report 경로 기재.

- [ ] **Step 3: 핸드오프 갱신**

`docs/handoff/CURRENT-WORK.md` 상단 — D1 완료 블록 추가(브랜치/커밋/테스트/배포 단독). 다음 슬라이스 = **D2(다중주문 병합) → B(2.6d 재고조회 모달) → A(시리얼)**.

- [ ] **Step 4: 커밋**

```bash
git add docs/dev-reports/slice-d1-confirm-no-autopublish.md migration/decisions/DECISIONS.md docs/handoff/CURRENT-WORK.md
git commit -m "docs(slice-d1): dev-report + DECISIONS D-CF-01~03 + 핸드오프 갱신"
```

---

## 통합 검증 (PR 전)

- [ ] **컴파일**: `./gradlew :services:partner-order-service:assemble` BUILD SUCCESSFUL.
- [ ] **BE 테스트**: `./gradlew :services:partner-order-service:test` 전체 PASS (Testcontainers, skipped=0 — Docker 기동 필수). confirm IT 2 + convert IT 10 + 회귀.
- [ ] **Docker 실 QA** ([[feedback_no_fake_data_ever]] 실 캡처만): 실 API confirm → partner_order_db `status=DRAFT` + `slip_no IS NULL` + slip_db 신규 PARTNER_ORDER slip **0건**(psql) → 본사 desktop 진행중 표시 실 화면 → convert → slip 발행(SENT). slip-service 다운 상태에서도 confirm 200 성공(가용성 개선) 확인.
- [ ] **5-team 리뷰 사이클 N=2** + CI green(skipped=0) → PM 승인 → 개발책임자 머지.

---

## Self-Review (작성자 점검 완료)

- **Spec coverage**: §3.1→Task1, §3.2(FE)→Task2, §6 테스트→Task1 IT + 통합 검증, §7 배포→통합 검증/dev-report, §8 후속→Task3 dev-report. 누락 없음.
- **Placeholder scan**: 코드 step 에 실제 코드 포함. Task2 는 "확인 후 조건부 변경" 으로 구체화(grep → 분기). Step6 단위테스트는 Read 후 조건부 수정 명시.
- **Type consistency**: `createFromConfirm(String,String,String,String,BigDecimal)` (Task1 정의 ↔ Task1 confirm 호출), `ConfirmResponse.status()`/`slipNo()`/`slipPublishStatus()` (기존 DTO, IT 단언 정합), `SlipPublishStatus.NOT_REQUIRED` 일관.
