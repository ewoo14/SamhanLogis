package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
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
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * #854 outbox processor 실 Postgres 통합 테스트.
 *
 * <p>성공/재시도/영구실패는 scheduler 진입점으로 실행하여 scheduler → processor 외부 bean 호출이
 * 실제로 transaction proxy 를 통과하는지 함께 검증한다. 검증용 조회는 processor transaction 종료 후
 * repository 로 다시 읽어 managed entity 재사용에 의존하지 않는다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
class SlipPublishOutboxProcessorIT extends AbstractPostgresIT {

    private static final String STUB_SLIP_NO = "2026/07/20-854";

    @Autowired
    private SlipPublishOutboxProcessor processor;

    @Autowired
    private SlipPublishOutboxScheduler scheduler;

    @Autowired
    private PartnerOrderRepository orderRepository;

    @Autowired
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
            assertThat(item.getEventType()).isEqualTo(HistoryEventType.SLIP_RETRY_QUEUED);
            assertThat(item.getDetailJson()).contains("\"event\":\"FAILED_PERMANENT\"");
        });
    }

    @Test
    @DisplayName("중복 발행 방지: COMMITTED row 재처리 시 slip-service를 다시 호출하지 않는다")
    void committedRow_isSkippedOnSecondProcess() {
        TestFixture fixture = seedReadyOutbox();
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenReturn(PublishResult.published(STUB_SLIP_NO));

        scheduler.retryPending();
        processor.processOne(fixture.outbox());

        verify(slipServiceClient, times(1)).publishFromPartnerOrder(anyMap(), anyString());
        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.COMMITTED);
    }

    @Test
    @DisplayName("동시성: 같은 row를 두 worker가 처리해도 비관 락으로 1회만 발행한다")
    void concurrentProcessing_publishesExactlyOnce() throws Exception {
        TestFixture fixture = seedReadyOutbox();
        CountDownLatch firstPublishEntered = new CountDownLatch(1);
        CountDownLatch releaseFirstPublish = new CountDownLatch(1);
        AtomicInteger publishCalls = new AtomicInteger();
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenAnswer(invocation -> {
                    if (publishCalls.incrementAndGet() == 1) {
                        firstPublishEntered.countDown();
                        if (!releaseFirstPublish.await(10, TimeUnit.SECONDS)) {
                            throw new IllegalStateException("첫 발행 mock release timeout");
                        }
                    }
                    return PublishResult.published(STUB_SLIP_NO);
                });

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = executor.submit(() -> processor.processOne(fixture.outbox()));
            assertThat(firstPublishEntered.await(10, TimeUnit.SECONDS)).isTrue();
            Future<?> second = executor.submit(() -> processor.processOne(fixture.outbox()));

            releaseFirstPublish.countDown();
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);

            assertThat(publishCalls).hasValue(1);
            verify(slipServiceClient, times(1)).publishFromPartnerOrder(anyMap(), anyString());
            assertThat(reloadOutbox(fixture.outboxId()).getStatus())
                    .isEqualTo(OutboxStatus.COMMITTED);
        } finally {
            shutdownAndAwaitTermination(executor);
        }
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
