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
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

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

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private MeterRegistry meterRegistry;

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
        double committedBefore = terminalMetricCount("committed");
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
        assertThat(terminalMetricCount("committed")).isEqualTo(committedBefore + 1);
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
    @DisplayName("FAILED_PERMANENT(claim 가드 C-1 경로): 만료 row 는 claim 직후 HTTP 이전에 종결되어 slip-service 를 호출하지 않는다")
    void expiredRetry_persistsFailedPermanentStateAndHistory() {
        // #854 R5 HIGH-2: R4 의 claim 시점 가드(expireIfExhausted)가 만료 row 를 HTTP 이전에 종결시키므로
        // 이 테스트는 handleRetry 내부의 만료 분기가 아니라 claim 가드 경로(exhaustedRequeuedRow_...
        // 와 동일 경로)만 통과한다. 과거에 남아있던 slipServiceClient thenThrow 스텁은 이 경로에서
        // 절대 호출되지 않는 죽은 스텁이었다 — 제거하고 times(0) 로 명시한다.
        TestFixture fixture = seedReadyOutbox();
        double exhaustedBefore = terminalMetricCount("max_retry_exhausted");
        LocalDateTime expiredAt = LocalDateTime.now()
                .minusHours(outboxProperties.getMaxRetryHours())
                .minusMinutes(1);
        jdbcTemplate.update("UPDATE slip_publish_outbox SET first_attempted_at = ? WHERE id = ?",
                expiredAt, fixture.outboxId());

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
        assertThat(terminalMetricCount("max_retry_exhausted")).isEqualTo(exhaustedBefore + 1);
        verify(slipServiceClient, times(0)).publishFromPartnerOrder(anyMap(), anyString());
    }

    @Test
    @DisplayName("HIGH-2: handleRetry 자체의 만료 분기 — claim 가드를 우회해 직접 호출해도 max-retry 초과 시 FAILED_PERMANENT 로 종결한다")
    void handleRetry_terminatesWhenElapsedExceedsMaxRetryHoursEvenWithoutPermanentErrorCode() {
        // #854 R5 HIGH-2: R4 가 claim 직후 expireIfExhausted 를 추가하면서 handleRetry 내부의
        // `|| elapsed.toHours() >= outboxProperties.getMaxRetryHours()` 분기는 scheduler 경유 시
        // 더 이상 도달하지 못하게 됐다(claim 가드가 항상 먼저 가로챈다). 이 조건을 지워도 위
        // expiredRetry_persistsFailedPermanentStateAndHistory·exhaustedRequeuedRow_... 는 모두
        // claim 가드만으로 GREEN 을 유지해 회귀를 잡지 못한다 — resultWriter.handleRetry 를 claim
        // 가드 없이 직접 호출해 이 조건 자체를 가드한다. errorCode 는 의도적으로 INTERNAL_ERROR
        // (재시도 대상)를 사용해 permanentError(최소시도) 분기가 아닌 elapsed 분기만 단독으로 검증한다.
        TestFixture fixture = seedProcessingOutbox();
        jdbcTemplate.update("UPDATE slip_publish_outbox SET first_attempted_at = ? WHERE id = ?",
                expiredFirstAttemptedAt(), fixture.outboxId());

        resultWriter.handleRetry(fixture.outboxId(), ErrorCode.INTERNAL_ERROR,
                "일시적 5xx (만료 전이라면 재시도 대상인 오류코드)");

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
    @DisplayName("INVALID_INPUT 첫 시도(#854 R4 HIGH-B): 400이어도 최소 시도 미만이면 종결하지 않고 재시도한다")
    void invalidInput_firstAttempt_retriesInsteadOfPermanentFailure() {
        TestFixture fixture = seedReadyOutbox();   // attemptCount = 1 < permanent-error-min-attempts(2)
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.INVALID_INPUT, "거래처 확인 불가"));

        scheduler.retryPending();

        // 다운스트림 검증 불가가 4xx 로 새어 들어와도 1회 시도 만에 영구 실패로 확정되면 안 된다.
        // 최소 시도 가드를 제거하면 FAILED/FAILED_PERMANENT 가 되어 RED.
        SlipPublishOutbox reloaded = reloadOutbox(fixture.outboxId());
        assertThat(reloaded.getStatus()).isEqualTo(OutboxStatus.PENDING);
        assertThat(reloaded.getAttemptCount()).isEqualTo(2);
        assertThat(reloadOrder(fixture.orderId()).getSlipPublishStatus())
                .isEqualTo(SlipPublishStatus.PENDING_RETRY);
        assertThat(reloadHistory(fixture.orderId())).isEmpty();
    }

    @Test
    @DisplayName("INVALID_INPUT 최소 시도 도달: 400은 max-retry를 기다리지 않고 FAILED_PERMANENT로 종결된다")
    void invalidInput_afterMinAttempts_failsPermanently() {
        TestFixture fixture = seedAtPermanentErrorThreshold();
        double invalidInputBefore = terminalMetricCount("invalid_input");
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.INVALID_INPUT, "필수 거래처 누락"));

        scheduler.retryPending();

        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.FAILED);
        assertThat(reloadOrder(fixture.orderId()).getSlipPublishStatus())
                .isEqualTo(SlipPublishStatus.FAILED_PERMANENT);
        assertThat(reloadHistory(fixture.orderId())).anySatisfy(item ->
                assertThat(item.getEventType()).isEqualTo(HistoryEventType.SLIP_FAILED_PERMANENT));
        assertThat(terminalMetricCount("invalid_input")).isEqualTo(invalidInputBefore + 1);
    }

    @Test
    @DisplayName("CONFLICT 첫 시도(#854 R4 HIGH-B): 409도 최소 시도 미만이면 종결하지 않고 재시도한다")
    void conflict_firstAttempt_retriesInsteadOfPermanentFailure() {
        TestFixture fixture = seedReadyOutbox();
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.CONFLICT, "동일 키 다른 본문"));

        scheduler.retryPending();

        SlipPublishOutbox reloaded = reloadOutbox(fixture.outboxId());
        assertThat(reloaded.getStatus()).isEqualTo(OutboxStatus.PENDING);
        assertThat(reloaded.getAttemptCount()).isEqualTo(2);
        assertThat(reloadHistory(fixture.orderId())).isEmpty();
    }

    @Test
    @DisplayName("CONFLICT 최소 시도 도달: 409는 max-retry를 기다리지 않고 FAILED_PERMANENT로 종결된다")
    void conflict_afterMinAttempts_failsPermanently() {
        TestFixture fixture = seedAtPermanentErrorThreshold();
        // #854 R5 LOW: CONFLICT→"conflict" 태그 분기가 무가드였다(계열 sweep — invalid_input/
        // max_retry_exhausted 는 이미 delta 단언이 있었다).
        double conflictBefore = terminalMetricCount("conflict");
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.CONFLICT, "동일 키 다른 본문"));

        scheduler.retryPending();

        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.FAILED);
        assertThat(reloadOrder(fixture.orderId()).getSlipPublishStatus())
                .isEqualTo(SlipPublishStatus.FAILED_PERMANENT);
        assertThat(reloadHistory(fixture.orderId())).anySatisfy(item ->
                assertThat(item.getEventType()).isEqualTo(HistoryEventType.SLIP_FAILED_PERMANENT));
        assertThat(terminalMetricCount("conflict")).isEqualTo(conflictBefore + 1);
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
    @DisplayName("CLAIM_SQL 7-audit: native UPDATE claim 후 modified_at/modified_by 가 채워진다")
    void claimReadyBatch_stampsModifiedAuditColumns() {
        // #854 R5 LOW — CLAIM_SQL 은 JPA @PreUpdate auditing listener 를 우회하는 네이티브
        // UPDATE 라 modified_at/modified_by 를 SQL 문 안에서 직접 SET 한다(BaseEntity 7-audit).
        // 두 컬럼 모두 지금까지 무가드였다 — SET 절을 지워도 컴파일/기존 테스트는 전부 GREEN 이었다.
        //
        // seed 시점 modified_at 은 JPA @LastModifiedDate auditing 이 "테스트 JVM" 벽시계로 찍고,
        // CLAIM_SQL 의 modified_at 은 네이티브 SQL 의 "Postgres 서버" now() 로 찍힌다 — 이 둘을 직접
        // 비교하면 컨테이너/호스트 clock skew(실측 수십 ms)로 간헐적 false-RED 가 난다(1차 시도에서
        // 실제로 걸림: 22:23:56.854642 actual vs 22:23:56.881258 seed 시각, container 가 27ms 늦음).
        // seed 직후 modified_at 을 Postgres 자신의 interval 산술로 1시간 전 과거로 강제해 두 비교값을
        // 전부 Postgres 클록 하나로 통일하고, 실 clock skew(ms~수백ms) 를 압도하는 여유(1시간)를 둔다.
        TestFixture fixture = seedReadyOutbox();
        jdbcTemplate.update(
                "UPDATE slip_publish_outbox SET modified_at = now() - interval '1 hour' WHERE id = ?",
                fixture.outboxId());
        LocalDateTime staleModifiedAt = reloadOutbox(fixture.outboxId()).getModifiedAt();

        List<SlipPublishOutbox> claimed = outboxRepository.claimReadyBatch(
                1, outboxProperties.getLeaseSeconds());

        assertThat(claimed).extracting(SlipPublishOutbox::getId).containsExactly(fixture.outboxId());
        SlipPublishOutbox reloaded = reloadOutbox(fixture.outboxId());
        assertThat(reloaded.getModifiedAt())
                .as("claim 이 modified_at 을 갱신해야 한다(1시간 전 과거 값 그대로면 SET 절 누락)")
                .isAfter(staleModifiedAt);
        assertThat(reloaded.getModifiedBy()).as("claim 이 modified_by 를 채워야 한다").isEqualTo("system");
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

    @Test
    @DisplayName("원자 소유권 가드(결정적): 선행 tx 가 COMMITTED 로 종결하면 뒤늦은 handleRetry 는 clobber 하지 못한다")
    void resultWriter_doesNotClobberTransitionCommittedByLockHolder() throws Exception {
        // #854 R4 HIGH-A. 종전 가드(commitSuccess/handleRetry 동시 실행 ×30 clobber 단언)는 무락 findById
        // 로 되돌려도 90/90 GREEN 이었다 — "commitSuccess 가 나중에 커밋" 인터리빙이 락 있을 때의 정상
        // 결과와 관측적으로 동일해 판별 불가이고, commitSuccess 가 write 를 더 많이 해 그쪽으로 편향된다.
        //
        // 여기서는 선후 관계를 테스트가 통제한다. holder 가 락을 쥔 채 COMMITTED 로 바꾸고 커밋을 보류하는
        // 동안 handleRetry 를 투입하면,
        //   - FOR UPDATE(현행): handleRetry 의 SELECT 가 락을 기다렸다가 COMMITTED 를 읽고 skip → COMMITTED 유지
        //   - 무락 findById(회귀): SELECT 가 기다리지 않고 stale PROCESSING 을 읽어 진행 → UPDATE 가 뒤늦게
        //     적용되어 COMMITTED 를 PENDING 으로 덮음 → RED
        // 대기 진입은 pg_locks 로 관측해 배리어를 세우므로 스케줄 운에 의존하지 않는다.
        TestFixture fixture = seedProcessingOutbox();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch holderReady = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try {
            Future<?> holder = executor.submit(() ->
                    new TransactionTemplate(transactionManager).execute(status -> {
                        SlipPublishOutbox row = outboxRepository.findWithLockById(fixture.outboxId())
                                .orElseThrow();
                        row.markCommitted();
                        outboxRepository.saveAndFlush(row);   // UPDATE 즉시 발행 → 행 락 확실 보유
                        holderReady.countDown();
                        try {
                            release.await(10, TimeUnit.SECONDS);
                        } catch (InterruptedException ex) {
                            Thread.currentThread().interrupt();
                        }
                        return null;
                    }));
            assertThat(holderReady.await(10, TimeUnit.SECONDS))
                    .as("holder tx 가 행 락을 쥔 채 COMMITTED 로 전이해야 한다").isTrue();

            Future<?> late = executor.submit(() -> {
                resultWriter.handleRetry(fixture.outboxId(), ErrorCode.INTERNAL_ERROR, "뒤늦은 실패 전이");
                return null;
            });

            // 뒤늦은 전이가 (SELECT 또는 UPDATE 에서) 행 락 대기에 진입할 때까지 관측 배리어.
            awaitRowLockWait();
            release.countDown();
            late.get(10, TimeUnit.SECONDS);
            holder.get(10, TimeUnit.SECONDS);

            SlipPublishOutbox reloaded = reloadOutbox(fixture.outboxId());
            assertThat(reloaded.getStatus())
                    .as("먼저 종결한 COMMITTED 가 뒤늦은 재시도 전이로 덮이면 안 된다")
                    .isEqualTo(OutboxStatus.COMMITTED);
            assertThat(reloaded.getAttemptCount())
                    .as("skip 된 전이는 attemptCount 도 건드리지 않아야 한다")
                    .isEqualTo(1);
        } finally {
            release.countDown();
            shutdownAndAwaitTermination(executor);
        }
    }

    /**
     * 다른 세션이 행 락 대기에 진입할 때까지의 관측 배리어 — 고정 sleep 추정이 아닌 실제 상태 폴링.
     *
     * <p>#854 R5 LOW — 전역 {@code WHERE NOT granted} 는 이 IT 클래스가 공유하는 단일 Postgres
     * 컨테이너에서 <em>다른</em> 테스트/세션이 우연히 만든 무관한 대기까지 배리어를 조기 통과시킬 수
     * 있었다({@code feedback_parallel_agent_gradle_shared_tree_contention}). {@code locktype} 을
     * 행 락 대기 부류로 좁힌다 — {@code relation} 컬럼으로 {@code slip_publish_outbox} 테이블에
     * 직접 스코프하지 <b>않는</b> 이유: PostgreSQL 의 {@code SELECT ... FOR UPDATE} 행 락 경합은
     * 대개 {@code locktype='transactionid'}(잠근 tx 의 XID 해제 대기)로 관측되며 이 locktype 은
     * {@code relation} 이 NULL 이라 relation 스코프가 오히려 실 대기를 걸러내 배리어를 영구히
     * 통과시키지 못하는 false-negative 를 유발한다.
     */
    private void awaitRowLockWait() throws InterruptedException {
        long deadlineNanos = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadlineNanos) {
            Integer waiting = jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM pg_locks WHERE NOT granted"
                            + " AND locktype IN ('tuple', 'transactionid')", Integer.class);
            if (waiting != null && waiting > 0) {
                return;
            }
            TimeUnit.MILLISECONDS.sleep(20);
        }
        fail("다른 세션이 행 락 대기 상태로 진입하지 않았다 — 배리어 전제 실패");
    }

    @Test
    @DisplayName("SKIP LOCKED(결정적): 잠긴 row 는 대기 없이 건너뛰고 다음 후보를 claim 한다")
    void claimReadyBatch_skipsLockedRowWithoutBlocking() throws Exception {
        // #854 R4 MED. 종전 concurrentClaim_returnsDisjointRows 는 1회 실행이라 두 claim 이 시간적으로
        // 겹치지 않으면 SKIP LOCKED 유무와 무관하게 GREEN — 사실상 미가드였다.
        TestFixture lockedRow = seedReadyOutbox();
        TestFixture freeRow = seedReadyOutbox();
        // ORDER BY next_attempt_at 상 잠긴 row 가 먼저 오도록 고정 → SKIP LOCKED 제거 시 결정적으로 블록.
        jdbcTemplate.update("UPDATE slip_publish_outbox SET next_attempt_at = ? WHERE id = ?",
                LocalDateTime.now().minusSeconds(30), lockedRow.outboxId());

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try {
            executor.submit(() -> new TransactionTemplate(transactionManager).execute(status -> {
                outboxRepository.findWithLockById(lockedRow.outboxId());
                locked.countDown();
                try {
                    release.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                }
                return null;
            }));
            assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();

            Future<List<SlipPublishOutbox>> claim = executor.submit(() ->
                    outboxRepository.claimReadyBatch(1, outboxProperties.getLeaseSeconds()));

            // SKIP LOCKED 를 제거하면 잠긴 선행 row 를 기다려 2초 내 반환하지 못하고 RED.
            List<SlipPublishOutbox> claimed = claim.get(2, TimeUnit.SECONDS);
            assertThat(claimed).extracting(SlipPublishOutbox::getId)
                    .as("잠긴 row 를 건너뛰고 다음 후보를 점유해야 한다")
                    .containsExactly(freeRow.outboxId());
        } finally {
            release.countDown();
            shutdownAndAwaitTermination(executor);
        }
    }

    @Test
    @DisplayName("FAILED_PERMANENT 원자성: history 저장 실패 시 outbox·주문 전이가 함께 롤백된다")
    void failedPermanent_isAtomicAcrossOutboxOrderAndHistory() {
        // #854 R4 MED. R1 은 commitSuccess 에만 실패주입 롤백 테스트를 만들었고 영구실패 경로는 세 write 가
        // 모두 성공한 상태만 단언해 tx 경계가 미가드였다(명시 save 는 tx 없이도 각자 영속되므로).
        TestFixture fixture = seedAtPermanentErrorThreshold();
        doThrow(new IllegalStateException("history save injected failure"))
                .when(historyRepository).save(any(PartnerOrderHistory.class));
        when(slipServiceClient.publishFromPartnerOrder(anyMap(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.INVALID_INPUT, "복구 불가 입력"));

        scheduler.retryPending();

        // @Transactional 을 제거하면 outbox=FAILED / order=FAILED_PERMANENT 가 각각 커밋되어 RED.
        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.PROCESSING);
        assertThat(reloadOrder(fixture.orderId()).getSlipPublishStatus())
                .isEqualTo(SlipPublishStatus.PENDING_RETRY);
        assertThat(reloadHistory(fixture.orderId())).isEmpty();
    }

    @Test
    @DisplayName("REQUIRES_NEW: 결과 복구 재큐잉은 바깥 tx 롤백과 무관하게 독립 커밋된다")
    void requeueAfterResultFailure_commitsIndependentlyOfOuterTransaction() {
        // #854 R4 MED. 종전 테스트는 모두 외부 tx 없이 호출해 REQUIRED 로 바꿔도 동작이 동일했다.
        TestFixture fixture = seedProcessingOutbox();

        new TransactionTemplate(transactionManager).execute(status -> {
            resultWriter.requeueAfterResultFailure(fixture.outboxId(), "outer rollback 검증");
            status.setRollbackOnly();
            return null;
        });

        // REQUIRED 로 되돌리면 바깥 롤백에 함께 말려 PROCESSING 이 잔류하고 RED.
        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.PENDING);
    }

    @Test
    @DisplayName("종결 가드 C-1: requeue 로 attemptCount 가 늘지 않아도 max-retry 초과 row 는 재발행 없이 종결된다")
    void exhaustedRequeuedRow_isTerminatedAtClaimWithoutRepublish() {
        // #854 R4 HIGH-C. 종전에는 종결 판정이 handleRetry 안에만 있어, 결과 tx 가 결정적으로 실패하는 row 는
        // markRequeue(attemptCount 불변)로 5분마다 무한 재발행되고 24h 상한이 영원히 평가되지 않았다.
        TestFixture fixture = seedReadyOutbox();
        jdbcTemplate.update(
                "UPDATE slip_publish_outbox SET first_attempted_at = ?, attempt_count = 1 WHERE id = ?",
                expiredFirstAttemptedAt(), fixture.outboxId());

        scheduler.retryPending();

        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.FAILED);
        assertThat(reloadOrder(fixture.orderId()).getSlipPublishStatus())
                .isEqualTo(SlipPublishStatus.FAILED_PERMANENT);
        // 종결 가드는 HTTP 앞에서 걸러야 한다 — 가드를 제거하면 재발행이 일어나 RED.
        verify(slipServiceClient, times(0)).publishFromPartnerOrder(anyMap(), anyString());
    }

    @Test
    @DisplayName("종결 가드 C-2: lease 재점유로만 순환하던 PROCESSING row 도 max-retry 초과 시 종결된다")
    void exhaustedStaleProcessingRow_isTerminatedOnReclaim() {
        // #854 R4 HIGH-C. claim 은 attemptCount 를 증가시키지 않으므로, 결과 writer 에 도달하지 못하고
        // lease 재점유만 반복하는 row 는 24h 가 지나도 FAILED 로 전이하지 않고 주문이 PENDING_RETRY 에 고착됐다.
        TestFixture fixture = seedReadyOutbox();
        jdbcTemplate.update("UPDATE slip_publish_outbox SET status = 'PROCESSING',"
                        + " last_attempted_at = ?, first_attempted_at = ?, attempt_count = 1 WHERE id = ?",
                LocalDateTime.now().minusSeconds(outboxProperties.getLeaseSeconds() + 1L),
                expiredFirstAttemptedAt(), fixture.outboxId());

        scheduler.retryPending();

        assertThat(reloadOutbox(fixture.outboxId()).getStatus()).isEqualTo(OutboxStatus.FAILED);
        assertThat(reloadOrder(fixture.orderId()).getSlipPublishStatus())
                .isEqualTo(SlipPublishStatus.FAILED_PERMANENT);
        verify(slipServiceClient, times(0)).publishFromPartnerOrder(anyMap(), anyString());
    }

    /** max-retry-hours 를 넘긴 최초 시도 시각. */
    private LocalDateTime expiredFirstAttemptedAt() {
        return LocalDateTime.now().minusHours(outboxProperties.getMaxRetryHours()).minusMinutes(1);
    }

    /** 복구 불가 오류가 terminal 로 확정되는 최소 시도 횟수에 도달한 ready row. */
    private TestFixture seedAtPermanentErrorThreshold() {
        TestFixture fixture = seedReadyOutbox();
        jdbcTemplate.update("UPDATE slip_publish_outbox SET attempt_count = ? WHERE id = ?",
                outboxProperties.getPermanentErrorMinAttempts(), fixture.outboxId());
        return fixture;
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

    private double terminalMetricCount(String reason) {
        return meterRegistry.counter(
                "partner_order_slip_publish_terminal", "reason", reason).count();
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
