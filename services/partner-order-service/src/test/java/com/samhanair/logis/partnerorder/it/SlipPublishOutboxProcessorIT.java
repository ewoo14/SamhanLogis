package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient.PublishResult;
import com.samhanair.logis.partnerorder.config.OutboxProperties;
import com.samhanair.logis.partnerorder.domain.HistoryEventType;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderHistory;
import com.samhanair.logis.partnerorder.domain.SlipPublishStatus;
import com.samhanair.logis.partnerorder.outbox.OutboxStatus;
import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import com.samhanair.logis.partnerorder.repository.PartnerOrderHistoryRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.scheduler.SlipPublishOutboxProcessor;
import com.samhanair.logis.partnerorder.scheduler.SlipPublishOutboxResultWriter;
import com.samhanair.logis.partnerorder.scheduler.SlipPublishOutboxScheduler;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * #854 outbox processor 실 Postgres 통합 테스트.
 *
 * <p>성공/재시도/영구실패는 scheduler 진입점으로 실행하여 claim → HTTP → 결과 writer 경계를
 * 함께 검증한다. 검증용 조회는 결과 transaction 종료 후
 * repository 로 다시 읽어 managed entity 재사용에 의존하지 않는다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
class SlipPublishOutboxProcessorIT extends AbstractPostgresIT {

    private static final String STUB_SLIP_NO = "2026/07/20-854";

    /** 동시성 원자 가드 반복 횟수 — 무락 findById 회귀 시 clobber 조합을 재현할 만큼 충분히 크게. */
    private static final int GUARD_ITERATIONS = 30;

    @Autowired
    private SlipPublishOutboxProcessor processor;

    @Autowired
    private SlipPublishOutboxResultWriter resultWriter;

    @Autowired
    private SlipPublishOutboxScheduler scheduler;

    @Autowired
    private PartnerOrderRepository orderRepository;

    @SpyBean
    private PartnerOrderHistoryRepository historyRepository;

    @Autowired
    private SlipPublishOutboxRepository outboxRepository;

    @Autowired
    private OutboxProperties outboxProperties;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** 외부 slip-service 는 반드시 mock 하여 Eureka 5xx 를 차단한다. */
    @MockBean
    private SlipServiceClient slipServiceClient;

    @BeforeEach
    void cleanDatabaseAndMock() {
        reset(slipServiceClient);
        reset(historyRepository);
        historyRepository.deleteAll();
        outboxRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM partner_order_lines");
        orderRepository.deleteAll();
    }

    @Test
    @DisplayName("성공: scheduler 외부 processor 호출 후 outbox·order·history가 DB에 영속된다")
    void success_persistsCommittedOrderAndHistory() {
        TestFixture fixture = seedReadyOutbox();
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenReturn(PublishResult.published(STUB_SLIP_NO));

        scheduler.retryPending();

        SlipPublishOutbox reloadedOutbox = reloadOutbox(fixture.outboxId());
        PartnerOrder reloadedOrder = reloadOrder(fixture.orderId());
        List<PartnerOrderHistory> history = reloadHistory(fixture.orderId());

        assertThat(reloadedOutbox.getStatus()).isEqualTo(OutboxStatus.COMMITTED);
        assertThat(reloadedOrder.getSlipPublishStatus()).isEqualTo(SlipPublishStatus.PUBLISHED);
        assertThat(reloadedOrder.getSlipNo()).isEqualTo(STUB_SLIP_NO);
        assertThat(history).anySatisfy(item ->
                assertThat(item.getEventType()).isEqualTo(HistoryEventType.SLIP_PUBLISHED));
    }

    @Test
    @DisplayName("재시도: 5xx 후 새 조회에서 attemptCount·nextAttemptAt·lastError가 영속된다")
    void retry_persistsAttemptCountNextAttemptAndError() {
        TestFixture fixture = seedReadyOutbox();
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.INTERNAL_ERROR, "slip-service 5xx"));

        scheduler.retryPending();

        SlipPublishOutbox reloaded = reloadOutbox(fixture.outboxId());
        assertThat(reloaded.getStatus()).isEqualTo(OutboxStatus.PENDING);
        assertThat(reloaded.getAttemptCount()).isEqualTo(2);
        assertThat(reloaded.getNextAttemptAt()).isAfter(LocalDateTime.now());
        assertThat(reloaded.getLastError()).contains("slip-service 5xx");
    }

    @Test
    @DisplayName("FAILED_PERMANENT: max retry 시간 초과 후 outbox·order·history가 DB에 영속된다")
    void expiredRetry_persistsFailedPermanentStateAndHistory() {
        TestFixture fixture = seedReadyOutbox();
        LocalDateTime expiredAt = LocalDateTime.now()
                .minusHours(outboxProperties.getMaxRetryHours())
                .minusMinutes(1);
        jdbcTemplate.update("UPDATE slip_publish_outbox SET first_attempted_at = ? WHERE id = ?",
                expiredAt, fixture.outboxId());
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenThrow(new RuntimeException("slip-service 5xx runtime"));

        scheduler.retryPending();

        SlipPublishOutbox reloadedOutbox = reloadOutbox(fixture.outboxId());
        PartnerOrder reloadedOrder = reloadOrder(fixture.orderId());
        List<PartnerOrderHistory> history = reloadHistory(fixture.orderId());

        assertThat(reloadedOutbox.getStatus()).isEqualTo(OutboxStatus.FAILED);
        assertThat(reloadedOrder.getSlipPublishStatus()).isEqualTo(SlipPublishStatus.FAILED_PERMANENT);
        assertThat(history).anySatisfy(item -> {
            assertThat(item.getEventType()).isEqualTo(HistoryEventType.SLIP_FAILED_PERMANENT);
            assertThat(item.getDetailJson()).contains("\"event\":\"FAILED_PERMANENT\"");
        });
    }

    @Test
    @DisplayName("INVALID_INPUT: 400은 max-retry를 기다리지 않고 즉시 FAILED_PERMANENT로 종결된다")
    void invalidInput_failsImmediatelyWithPermanentHistory() {
        TestFixture fixture = seedReadyOutbox();
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.INVALID_INPUT, "필수 거래처 누락"));

        scheduler.retryPending();

        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.FAILED);
        assertThat(reloadOrder(fixture.orderId()).getSlipPublishStatus())
                .isEqualTo(SlipPublishStatus.FAILED_PERMANENT);
        assertThat(reloadHistory(fixture.orderId())).anySatisfy(item ->
                assertThat(item.getEventType()).isEqualTo(HistoryEventType.SLIP_FAILED_PERMANENT));
    }

    @Test
    @DisplayName("CONFLICT: 409는 max-retry를 기다리지 않고 즉시 FAILED_PERMANENT로 종결된다")
    void conflict_failsImmediatelyWithPermanentHistory() {
        TestFixture fixture = seedReadyOutbox();
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.CONFLICT, "동일 키 다른 본문"));

        scheduler.retryPending();

        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.FAILED);
        assertThat(reloadOrder(fixture.orderId()).getSlipPublishStatus())
                .isEqualTo(SlipPublishStatus.FAILED_PERMANENT);
        assertThat(reloadHistory(fixture.orderId())).anySatisfy(item ->
                assertThat(item.getEventType()).isEqualTo(HistoryEventType.SLIP_FAILED_PERMANENT));
    }

    @Test
    @DisplayName("중복 발행 방지: COMMITTED row 재처리 시 slip-service를 다시 호출하지 않는다")
    void committedRow_isSkippedOnSecondProcess() {
        TestFixture fixture = seedReadyOutbox();
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenReturn(PublishResult.published(STUB_SLIP_NO));

        scheduler.retryPending();
        scheduler.retryPending();

        verify(slipServiceClient, times(1)).publishFromPartnerOrder(anyMap(), anyString());
        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.COMMITTED);
    }

    @Test
    @DisplayName("tx 경계: HTTP 발행 시점에는 DB 트랜잭션이 없어야 한다 (lock-across-IO 방지)")
    void publish_runsOutsideDatabaseTransaction() {
        TestFixture fixture = seedReadyOutbox();
        AtomicBoolean txActiveAtPublish = new AtomicBoolean(true);
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenAnswer(invocation -> {
                    txActiveAtPublish.set(
                            TransactionSynchronizationManager.isActualTransactionActive());
                    return PublishResult.published(STUB_SLIP_NO);
                });

        scheduler.retryPending();

        // claim/result tx와 HTTP가 분리되어야 한다. HTTP를 DB tx 안으로 되돌리면 이 단언이 RED다.
        assertThat(txActiveAtPublish)
                .as("HTTP 발행은 DB 락/트랜잭션 밖이어야 한다")
                .isFalse();
        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.COMMITTED);
    }

    @Test
    @DisplayName("파싱 실패: 불량 payload는 handleRetry 경유로 PENDING+attemptCount 증가 (즉시 재pick storm 아님)")
    void malformedPayload_goesThroughRetryNotStorm() {
        TestFixture fixture = seedReadyOutbox();
        // parsePayload 가 try 안에서 실패하도록 불량 JSON 을 주입한다.
        jdbcTemplate.update("UPDATE slip_publish_outbox SET request_payload = ? WHERE id = ?",
                "{not-valid-json", fixture.outboxId());

        scheduler.retryPending();

        SlipPublishOutbox reloaded = reloadOutbox(fixture.outboxId());
        // handleRetry 경유 → PENDING + attemptCount 2 + 미래 nextAttemptAt(백오프). 파싱이 try 밖이면
        // 예외가 전파돼 tx 롤백 → attemptCount 1·과거 nextAttemptAt(즉시 재pick storm) 로 RED.
        assertThat(reloaded.getStatus()).isEqualTo(OutboxStatus.PENDING);
        assertThat(reloaded.getAttemptCount()).isEqualTo(2);
        assertThat(reloaded.getNextAttemptAt()).isAfter(LocalDateTime.now());
        // 파싱 실패 시 slip-service 는 호출되지 않는다.
        verify(slipServiceClient, times(0)).publishFromPartnerOrder(anyMap(), anyString());
    }

    @Test
    @DisplayName("경계: max-retry 직전은 FAILED 아닌 PENDING(retry), 첫 재시도 nextAttemptAt≈now+10분")
    void nearMaxRetryBoundary_retriesWithTenMinuteBackoff() {
        TestFixture fixture = seedReadyOutbox();
        // firstAttemptedAt = now - maxRetryHours + 5분 → 아직 만료 전(경계 직전).
        LocalDateTime notYetExpired = LocalDateTime.now()
                .minusHours(outboxProperties.getMaxRetryHours())
                .plusMinutes(5);
        jdbcTemplate.update("UPDATE slip_publish_outbox SET first_attempted_at = ? WHERE id = ?",
                notYetExpired, fixture.outboxId());
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.INTERNAL_ERROR, "slip-service 5xx"));

        LocalDateTime before = LocalDateTime.now();
        scheduler.retryPending();
        LocalDateTime after = LocalDateTime.now();

        SlipPublishOutbox reloaded = reloadOutbox(fixture.outboxId());
        assertThat(reloaded.getStatus()).isEqualTo(OutboxStatus.PENDING);   // FAILED 아님
        assertThat(reloaded.getAttemptCount()).isEqualTo(2);
        // 첫 재시도 백오프 = min(60, 5 * 2^min(1,4)) = 10분 (±허용).
        assertThat(reloaded.getNextAttemptAt())
                .isAfterOrEqualTo(before.plusMinutes(10).minusSeconds(2))
                .isBeforeOrEqualTo(after.plusMinutes(10).plusSeconds(2));
    }

    @Test
    @DisplayName("결과 tx 상태 재검: PROCESSING이 아닌 row의 성공 결과는 적용하지 않는다")
    void resultTransaction_skipsRowNotOwnedAsProcessing() {
        TestFixture fixture = seedReadyOutbox();
        resultWriter.commitSuccess(fixture.outboxId(), PublishResult.published(STUB_SLIP_NO));

        SlipPublishOutbox reloaded = reloadOutbox(fixture.outboxId());
        assertThat(reloaded.getStatus()).isEqualTo(OutboxStatus.PENDING);
        assertThat(reloaded.getAttemptCount()).isEqualTo(1);
        assertThat(reloadOrder(fixture.orderId()).getSlipPublishStatus())
                .isEqualTo(SlipPublishStatus.PENDING_RETRY);
        assertThat(reloadHistory(fixture.orderId())).isEmpty();
    }

    @Test
    @DisplayName("claim disjoint: 두 worker의 동시 claim은 서로 다른 row를 점유한다")
    void concurrentClaim_returnsDisjointRows() throws Exception {
        seedReadyOutbox();
        seedReadyOutbox();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch start = new CountDownLatch(1);
            Future<List<SlipPublishOutbox>> first = executor.submit(() -> {
                start.await(10, TimeUnit.SECONDS);
                return outboxRepository.claimReadyBatch(1, outboxProperties.getLeaseSeconds());
            });
            Future<List<SlipPublishOutbox>> second = executor.submit(() -> {
                start.await(10, TimeUnit.SECONDS);
                return outboxRepository.claimReadyBatch(1, outboxProperties.getLeaseSeconds());
            });
            start.countDown();
            List<SlipPublishOutbox> firstClaim = first.get(10, TimeUnit.SECONDS);
            List<SlipPublishOutbox> secondClaim = second.get(10, TimeUnit.SECONDS);

            assertThat(firstClaim).hasSize(1);
            assertThat(secondClaim).hasSize(1);
            assertThat(firstClaim.get(0).getId()).isNotEqualTo(secondClaim.get(0).getId());
        } finally {
            shutdownAndAwaitTermination(executor);
        }
    }

    @Test
    @DisplayName("reaper reclaim: lease가 만료된 PROCESSING row를 재점유해 종결한다")
    void staleProcessing_isReclaimedAndCommitted() {
        TestFixture fixture = seedReadyOutbox();
        jdbcTemplate.update("UPDATE slip_publish_outbox SET status = 'PROCESSING', last_attempted_at = ? WHERE id = ?",
                LocalDateTime.now().minusSeconds(outboxProperties.getLeaseSeconds() + 1), fixture.outboxId());
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenReturn(PublishResult.published(STUB_SLIP_NO));

        List<SlipPublishOutbox> claimed = outboxRepository.claimReadyBatch(
                1, outboxProperties.getLeaseSeconds());
        assertThat(claimed).extracting(SlipPublishOutbox::getId).containsExactly(fixture.outboxId());

        processor.processOne(claimed.get(0));

        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.COMMITTED);
    }

    @Test
    @DisplayName("F2 롤백: 결과 저장 실패는 PENDING으로 복구되고 다음 동일 키 replay를 허용한다")
    void resultPersistenceFailure_requeuesAndReplaysSameIdempotencyKey() {
        TestFixture fixture = seedReadyOutbox();
        doThrow(new IllegalStateException("history save injected failure"))
                .when(historyRepository).save(any(PartnerOrderHistory.class));
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenReturn(PublishResult.published(STUB_SLIP_NO));

        scheduler.retryPending();

        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.PENDING);
        assertThat(reloadOrder(fixture.orderId()).getSlipPublishStatus())
                .isEqualTo(SlipPublishStatus.PENDING_RETRY);
        assertThat(reloadHistory(fixture.orderId())).isEmpty();
        verify(slipServiceClient).publishFromPartnerOrder(anyMap(), eq(fixture.outbox().getIdempotencyKey()));

        jdbcTemplate.update("UPDATE slip_publish_outbox SET next_attempt_at = ? WHERE id = ?",
                LocalDateTime.now().minusSeconds(1), fixture.outboxId());
        scheduler.retryPending();

        verify(slipServiceClient, times(2))
                .publishFromPartnerOrder(anyMap(), eq(fixture.outbox().getIdempotencyKey()));
        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.PENDING);
    }

    @Test
    @DisplayName("원자 소유권 가드: 동일 PROCESSING row 에 commitSuccess/handleRetry 동시 실행 시 clobber 없이 결정적 종결")
    void concurrentCommitAndRetry_atomicOwnershipGuard_noClobber() throws Exception {
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenReturn(PublishResult.published(STUB_SLIP_NO));

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            for (int i = 0; i < GUARD_ITERATIONS; i++) {
                TestFixture fixture = seedProcessingOutbox();
                UUID outboxId = fixture.outboxId();
                UUID orderId = fixture.orderId();
                // 실 slip 번호는 주문마다 고유(ux_partner_orders_slip_no_active) → 반복별 고유 slipNo 사용.
                String iterationSlipNo = STUB_SLIP_NO + "-" + i;

                // 두 결과 tx 를 최대한 동시에 시작시켜 lease overlap(A=성공, B=stale 실패)을 재현한다.
                CountDownLatch start = new CountDownLatch(1);
                Future<?> commit = executor.submit(() -> {
                    start.await(10, TimeUnit.SECONDS);
                    resultWriter.commitSuccess(outboxId, PublishResult.published(iterationSlipNo));
                    return null;
                });
                Future<?> retry = executor.submit(() -> {
                    start.await(10, TimeUnit.SECONDS);
                    resultWriter.handleRetry(outboxId, ErrorCode.INTERNAL_ERROR, "동시성 retry");
                    return null;
                });
                start.countDown();
                commit.get(10, TimeUnit.SECONDS);
                retry.get(10, TimeUnit.SECONDS);

                SlipPublishOutbox outbox = reloadOutbox(outboxId);
                PartnerOrder order = reloadOrder(orderId);
                boolean publishedHistory = reloadHistory(orderId).stream()
                        .anyMatch(item -> item.getEventType() == HistoryEventType.SLIP_PUBLISHED);

                // 먼저 비관 락을 획득한 한쪽 전이만 적용 → 최종 status 는 COMMITTED 또는 PENDING 으로 결정적.
                assertThat(outbox.getStatus())
                        .as("iteration %s 최종 status", i)
                        .isIn(OutboxStatus.COMMITTED, OutboxStatus.PENDING);

                if (outbox.getStatus() == OutboxStatus.COMMITTED) {
                    // commitSuccess 승리 → handleRetry 는 COMMITTED 를 보고 skip (발행 부작용 유지·attempt 불변).
                    assertThat(order.getSlipPublishStatus()).isEqualTo(SlipPublishStatus.PUBLISHED);
                    assertThat(publishedHistory).isTrue();
                    assertThat(outbox.getAttemptCount()).isEqualTo(1);
                } else {
                    // handleRetry 승리 → commitSuccess 는 PENDING 을 보고 skip (발행 부작용 미기록·attempt++).
                    assertThat(order.getSlipPublishStatus()).isNotEqualTo(SlipPublishStatus.PUBLISHED);
                    assertThat(publishedHistory).isFalse();
                    assertThat(outbox.getAttemptCount()).isEqualTo(2);
                }

                // 핵심 clobber 불변식: 발행 성공 부작용이 남아있는데 outbox 가 PENDING(재발행 예약)이면 안 된다.
                // findWithLockById 를 무락 findById 로 되돌리면 두 tx 가 stale PROCESSING 을 읽어
                // (order PUBLISHED + outbox PENDING) 조합이 발생 → 이 단언이 RED.
                assertThat(publishedHistory && outbox.getStatus() == OutboxStatus.PENDING)
                        .as("iteration %s: COMMITTED 결과가 PENDING 으로 뒤집히는 clobber 여부", i)
                        .isFalse();
            }
        } finally {
            shutdownAndAwaitTermination(executor);
        }
    }

    @Test
    @DisplayName("requeue attemptCount 불변: 발행 성공 후 결과 tx 실패 requeue 는 attemptCount 를 증가시키지 않는다")
    void requeueAfterResultFailure_doesNotInflateAttemptCount() {
        TestFixture fixture = seedProcessingOutbox();   // PROCESSING, attemptCount=1

        resultWriter.requeueAfterResultFailure(fixture.outboxId(), "history save injected failure");

        SlipPublishOutbox reloaded = reloadOutbox(fixture.outboxId());
        assertThat(reloaded.getStatus()).isEqualTo(OutboxStatus.PENDING);
        // markRequeue → attemptCount 불변(=1). markRetry 를 쓰면 2 로 증가하여 RED.
        assertThat(reloaded.getAttemptCount()).isEqualTo(1);
        assertThat(reloaded.getNextAttemptAt()).isAfter(LocalDateTime.now());
        assertThat(reloaded.getLastError()).contains("history save injected failure");
    }

    private TestFixture seedReadyOutbox() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        PartnerOrder order = orderRepository.save(PartnerOrder.create(
                "P-854-" + suffix,
                "BIZ-" + suffix,
                "2026/07/20-" + suffix,
                "PO-854-" + suffix,
                BigDecimal.ZERO));
        SlipPublishOutbox outbox = outboxRepository.save(SlipPublishOutbox.queue(
                order.getId(), order.getIdempotencyKey(),
                "{\"partnerCode\":\"P-854-" + suffix + "\"}"));

        // scheduler 후보가 되도록 queue 기본 +5분을 현재 시각 이전으로 조정한다.
        jdbcTemplate.update("UPDATE slip_publish_outbox SET next_attempt_at = ? WHERE id = ?",
                LocalDateTime.now().minusSeconds(1), outbox.getId());
        return new TestFixture(order.getId(), outbox.getId(), outbox);
    }

    /** PROCESSING 상태로 seed — 결과 writer 소유권/동시성 가드 테스트용 (attemptCount=1 유지). */
    private TestFixture seedProcessingOutbox() {
        TestFixture fixture = seedReadyOutbox();
        jdbcTemplate.update("UPDATE slip_publish_outbox SET status = 'PROCESSING' WHERE id = ?",
                fixture.outboxId());
        return fixture;
    }

    private SlipPublishOutbox reloadOutbox(UUID id) {
        return outboxRepository.findById(id).orElseThrow();
    }

    private PartnerOrder reloadOrder(UUID id) {
        return orderRepository.findById(id).orElseThrow();
    }

    private List<PartnerOrderHistory> reloadHistory(UUID orderId) {
        return historyRepository.findAllByPartnerOrderIdOrderByOccurredAtAsc(orderId);
    }

    private static void shutdownAndAwaitTermination(ExecutorService executor) throws InterruptedException {
        executor.shutdown();
        if (executor.awaitTermination(10, TimeUnit.SECONDS)) {
            return;
        }
        executor.shutdownNow();
        fail("outbox concurrency workers did not terminate within 10 seconds");
    }

    private record TestFixture(UUID orderId, UUID outboxId, SlipPublishOutbox outbox) {
    }
}
