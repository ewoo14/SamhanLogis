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
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

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
    @DisplayName("tx 경계: 발행 시점에 실제 트랜잭션이 활성이어야 한다 (processOne @Transactional 제거 시 RED)")
    void publish_runsInsideActiveTransaction() {
        TestFixture fixture = seedReadyOutbox();
        AtomicBoolean txActiveAtPublish = new AtomicBoolean(false);
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenAnswer(invocation -> {
                    txActiveAtPublish.set(
                            TransactionSynchronizationManager.isActualTransactionActive());
                    return PublishResult.published(STUB_SLIP_NO);
                });

        scheduler.retryPending();

        // 명시 save 는 tx 없이도 각자 영속하므로 상태 단언만으로는 processOne @Transactional 삭제를
        // 잡지 못한다(QA HIGH-1). 발행 시점의 실제 tx 활성 여부를 직접 캡처해 genuine 가드로 삼는다.
        assertThat(txActiveAtPublish)
                .as("processOne @Transactional 이 발행을 감싸야 한다 — 제거 시 false")
                .isTrue();
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
    @DisplayName("F1 재검: nextAttemptAt 미래인 PENDING row는 락 재검에서 스킵된다 (double-fire 차단)")
    void futureNextAttempt_isSkippedByLockRecheck() {
        TestFixture fixture = seedReadyOutbox();
        // 다른 worker 가 markRetry 로 미래 nextAttemptAt 을 부여해 PENDING 복귀시킨 상황을 모사.
        jdbcTemplate.update("UPDATE slip_publish_outbox SET next_attempt_at = ? WHERE id = ?",
                LocalDateTime.now().plusMinutes(30), fixture.outboxId());
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenReturn(PublishResult.published(STUB_SLIP_NO));

        // 이미 pick 된 후보를 락 획득 후 재검하는 경로(processor 직접 호출).
        processor.processOne(fixture.outbox());

        // 재검이 nextAttemptAt.isAfter(now) 로 스킵 → 발행/전이 없음. 가드 제거 시 발행되어 RED.
        verify(slipServiceClient, times(0)).publishFromPartnerOrder(anyMap(), anyString());
        SlipPublishOutbox reloaded = reloadOutbox(fixture.outboxId());
        assertThat(reloaded.getStatus()).isEqualTo(OutboxStatus.PENDING);
        assertThat(reloaded.getAttemptCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("동시성 barrier: worker2가 비관 락 대기에 진입한 것을 pg_locks로 확정한 뒤 1회만 발행한다")
    void concurrentProcessing_barrierOnLockWaitPublishesExactlyOnce() throws Exception {
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
            // worker1 이 발행 진입(비관 락 보유 + mock park) 할 때까지 대기.
            Future<?> first = executor.submit(() -> processor.processOne(fixture.outbox()));
            assertThat(firstPublishEntered.await(10, TimeUnit.SECONDS)).isTrue();

            // worker2 를 투입하고, worker2 가 같은 row 의 FOR UPDATE 락 대기(granted=false)에
            // 결정적으로 진입할 때까지 폴링한다. 락이 제거되면 worker2 는 대기 없이 PENDING 을 읽어
            // 이중발행하므로 이 barrier + 아래 단언이 함께 결정적 RED 가 된다.
            Future<?> second = executor.submit(() -> processor.processOne(fixture.outbox()));
            boolean worker2Blocked = awaitLockWait(10_000L);

            releaseFirstPublish.countDown();
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);

            assertThat(worker2Blocked)
                    .as("worker2 는 비관 락으로 대기해야 한다 — 락 제거 시 PENDING 을 읽어 이중발행")
                    .isTrue();
            assertThat(publishCalls).hasValue(1);
            verify(slipServiceClient, times(1)).publishFromPartnerOrder(anyMap(), anyString());
            assertThat(reloadOutbox(fixture.outboxId()).getStatus())
                    .isEqualTo(OutboxStatus.COMMITTED);
        } finally {
            shutdownAndAwaitTermination(executor);
        }
    }

    /**
     * 어떤 백엔드가 lock 대기(granted=false)에 진입할 때까지 폴링한다. Testcontainers 컨테이너에
     * 직결한 별도 JDBC 커넥션을 쓴다 — HikariCP maximum-pool-size=3(worker1·worker2 가 2개 점유)
     * 환경에서 풀의 마지막 커넥션을 빌려 경합/고갈을 일으키지 않기 위함이다.
     *
     * @param timeoutMillis 최대 대기(ms)
     * @return 대기 락을 관찰하면 true, 타임아웃이면 false
     */
    private boolean awaitLockWait(long timeoutMillis) throws Exception {
        long deadline = System.currentTimeMillis() + timeoutMillis;
        try (Connection conn = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())) {
            while (System.currentTimeMillis() < deadline) {
                try (Statement st = conn.createStatement();
                     ResultSet rs = st.executeQuery(
                             "SELECT count(*) FROM pg_locks WHERE NOT granted")) {
                    if (rs.next() && rs.getInt(1) >= 1) {
                        return true;
                    }
                }
                Thread.sleep(100L);
            }
        }
        return false;
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
