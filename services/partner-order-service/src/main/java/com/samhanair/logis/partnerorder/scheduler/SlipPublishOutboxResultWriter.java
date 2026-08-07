package com.samhanair.logis.partnerorder.scheduler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.SlipServiceClient.PublishResult;
import com.samhanair.logis.partnerorder.config.OutboxProperties;
import com.samhanair.logis.partnerorder.domain.HistoryEventType;
import com.samhanair.logis.partnerorder.domain.PartnerOrderHistory;
import com.samhanair.logis.partnerorder.outbox.OutboxStatus;
import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import com.samhanair.logis.partnerorder.repository.PartnerOrderHistoryRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderAuthorityEventPublisher;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Outbox HTTP 결과를 짧은 독립 트랜잭션으로 영속화한다.
 *
 * <p>각 메서드는 현재 row를 비관적 쓰기 락({@code SELECT ... FOR UPDATE})으로 잠근 뒤 PROCESSING일
 * 때만 상태를 변경한다. lease 만료로 동일 row 를 두 worker 가 겹쳐 처리해도 per-row 직렬화로 먼저
 * 락을 획득한 전이만 적용되고, 뒤늦은 전이는 non-PROCESSING 을 보고 skip 되어 COMMITTED 가 PENDING
 * 으로 덮이는 clobber 가 발생하지 않는다. 락은 결과 tx 종료까지만 유지되고 HTTP 발행은 tx 밖
 * (processor)에서 수행하므로 락을 물지 않는다.
 *
 * <p><b>terminal 계측 설계 (#854 R5 HIGH-1a/MED)</b>:
 * <ul>
 *   <li>4개 reason({@code committed}/{@code invalid_input}/{@code conflict}/
 *       {@code max_retry_exhausted}) counter 를 생성자에서 값 0으로 <b>사전 등록</b>한다.
 *       {@code recordTerminal} 호출 시점에 처음 {@code register()} 하면 시계열이 첫 이벤트에서
 *       값 1로 탄생해 Prometheus {@code increase()} 가 0→1 탄생 점프를 계상하지 못하고 첫/단발
 *       실패를 영원히 놓친다(slip-service {@code CompensationMetrics} 와
 *       {@code PartnerProductPriceMemoryService} 의 eager 등록 전례를 따른다).</li>
 *   <li>counter 증가와 {@link #markFailedPermanent} 의 CloudWatch 경보 원천 로그는 결과 tx 의
 *       <b>commit 확정 후</b>(afterCommit)에만 실행한다. {@code save()} 는 flush 지연이 있어 호출
 *       시점에는 아직 실제 commit 여부가 확정되지 않는다 — 이후 flush 가 실패(유니크/낙관락 충돌 등)
 *       하면 row 는 PROCESSING 에 잔류하는데 즉시 실행하면 일어나지 않은 전이를 계측/경보하게 된다.
 *       활성 트랜잭션 동기화가 없는 호출(직접 단위 테스트 등)은 기존처럼 즉시 실행한다.</li>
 * </ul>
 */
@Component
public class SlipPublishOutboxResultWriter {

    private static final Logger log = LoggerFactory.getLogger(SlipPublishOutboxResultWriter.class);
    private static final String TERMINAL_METRIC_NAME = "partner_order_slip_publish_terminal";

    /** commit 성공 종결 reason. */
    private static final String REASON_COMMITTED = "committed";
    /** 복구 불가 입력값(400)으로 종결 reason. */
    private static final String REASON_INVALID_INPUT = "invalid_input";
    /** 동일 idempotency-key 다른 본문 충돌(409)로 종결 reason. */
    private static final String REASON_CONFLICT = "conflict";
    /** max-retry-hours 소진으로 종결 reason. */
    private static final String REASON_MAX_RETRY_EXHAUSTED = "max_retry_exhausted";

    /** {@code recordTerminal} 이 사용하는 고정 reason 전체 집합 — 생성자 eager 등록의 단일 진실원. */
    private static final List<String> TERMINAL_REASONS = List.of(
            REASON_COMMITTED, REASON_INVALID_INPUT, REASON_CONFLICT, REASON_MAX_RETRY_EXHAUSTED);

    private final SlipPublishOutboxRepository outboxRepository;
    private final PartnerOrderRepository orderRepository;
    private final PartnerOrderHistoryRepository historyRepository;
    private final OutboxProperties outboxProperties;
    private final ObjectMapper objectMapper;
    private final PartnerOrderAuthorityEventPublisher authorityEventPublisher;
    private final Map<String, Counter> terminalCounters;

    /**
     * 결과 tx 상한(초) — 소유권 가드의 {@code SELECT ... FOR UPDATE} 무한 대기를 차단한다 (#854 R4 MED).
     *
     * <p>⚠️ {@code jakarta.persistence.lock.timeout} 은 <b>PostgreSQL 에서 무음 no-op</b> 이다
     * (Hibernate {@code PostgreSQLDialect.supportsWait() == false} — 양수 timeout 은 {@code for update}
     * 문자열을 변경 없이 반환). 라이브 실측 {@code SHOW lock_timeout} 도 {@code 0}(무한). 따라서 락 대기
     * 상한은 Spring tx timeout(→ JDBC statement timeout → pgjdbc cancel request)으로만 실효화된다.
     */
    private static final int RESULT_TX_TIMEOUT_SECONDS = 10;

    /**
     * @param outboxRepository outbox row 조회/저장
     * @param orderRepository 주문 조회/저장
     * @param historyRepository 주문 이력 저장
     * @param outboxProperties max-retry-hours 등 outbox 튜닝값
     * @param objectMapper history detailJson 직렬화
     * @param meterRegistry terminal 전이 counter 등록 대상 — 생성자에서 4개 reason 을 값 0으로
     *                      전부 사전 등록한다(HIGH-1a). 등록 실패는 부팅 실패로 이어지는 것이
     *                      의도된 동작이다(설정 오류를 조기에 드러냄) — 런타임 계측 실패만
     *                      {@link #recordTerminal} 이 방어한다.
     */
    public SlipPublishOutboxResultWriter(
            SlipPublishOutboxRepository outboxRepository,
            PartnerOrderRepository orderRepository,
            PartnerOrderHistoryRepository historyRepository,
            OutboxProperties outboxProperties,
            ObjectMapper objectMapper,
            MeterRegistry meterRegistry) {
        this(outboxRepository, orderRepository, historyRepository, outboxProperties, objectMapper,
                meterRegistry, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public SlipPublishOutboxResultWriter(
            SlipPublishOutboxRepository outboxRepository,
            PartnerOrderRepository orderRepository,
            PartnerOrderHistoryRepository historyRepository,
            OutboxProperties outboxProperties,
            ObjectMapper objectMapper,
            MeterRegistry meterRegistry,
            PartnerOrderAuthorityEventPublisher authorityEventPublisher) {
        this.outboxRepository = outboxRepository;
        this.orderRepository = orderRepository;
        this.historyRepository = historyRepository;
        this.outboxProperties = outboxProperties;
        this.objectMapper = objectMapper;
        this.authorityEventPublisher = authorityEventPublisher;
        Map<String, Counter> counters = new LinkedHashMap<>();
        for (String reason : TERMINAL_REASONS) {
            counters.put(reason, Counter.builder(TERMINAL_METRIC_NAME)
                    .description("partner-order 전표 발행 outbox terminal 전이 수")
                    .tag("reason", reason)
                    .register(meterRegistry));
        }
        this.terminalCounters = Map.copyOf(counters);
    }

    /** 성공 결과를 PROCESSING row에만 반영한다. */
    @Transactional(timeout = RESULT_TX_TIMEOUT_SECONDS)
    public void commitSuccess(UUID outboxId, PublishResult result) {
        SlipPublishOutbox row = processingRow(outboxId);
        if (row == null) {
            return;
        }
        row.markCommitted();
        outboxRepository.save(row);

        orderRepository.findById(row.getPartnerOrderId()).ifPresentOrElse(order -> {
            order.markSlipPublished(result.slipNo());
            orderRepository.save(order);
            historyRepository.save(PartnerOrderHistory.ofOrder(
                    order.getId(), order.getPartnerCode(), HistoryEventType.SLIP_PUBLISHED,
                    "system",
                    writeDetailJson(Map.of(
                            "slipNo", result.slipNo(),
                            "viaOutbox", true,
                            "attempts", row.getAttemptCount()))));
            if (authorityEventPublisher != null) {
                authorityEventPublisher.publish(order.getId(), "OUTBOX_COMMITTED", null);
            }
            log.info("Outbox COMMITTED: orderId={}, slipNo={}, attempts={}",
                    row.getPartnerOrderId(), result.slipNo(), row.getAttemptCount());
        // 주문 부재(soft-delete/정합 사고) 시 outbox 만 COMMITTED 되고 주문·이력은 미갱신 — 무음 발산
        // 방지를 위해 성공 로그 대신 error 로 남긴다 (#854 R4 MED). 전표는 이미 발행된 상태다.
        }, () -> log.error("Outbox COMMITTED but order missing — 주문 미갱신: outboxId={}, orderId={},"
                        + " slipNo={} (수동 정합 확인 필요)",
                row.getId(), row.getPartnerOrderId(), result.slipNo()));
        recordTerminal(REASON_COMMITTED);
    }

    /**
     * 외부 발행/파싱 실패를 현재 PROCESSING row에만 반영한다.
     *
     * <p>복구 불가 오류(INVALID_INPUT·CONFLICT)는 max-retry-hours 를 기다리지 않고 종결하되,
     * {@code permanent-error-min-attempts}(기본 2) 미만이면 한 번은 재시도한다 (#854 R4 HIGH-B).
     * 다운스트림 검증 불가가 4xx 로 새어 들어오는 경우 1회 시도 만에 영구 실패로 확정되어 <em>일시적</em>
     * 인프라 장애가 수동 복구 대상이 되는 것을 막는다.
     */
    @Transactional(timeout = RESULT_TX_TIMEOUT_SECONDS)
    public void handleRetry(UUID outboxId, ErrorCode errorCode, String error) {
        SlipPublishOutbox row = processingRow(outboxId);
        if (row == null) {
            return;
        }
        boolean unrecoverableError = errorCode == ErrorCode.INVALID_INPUT
                || errorCode == ErrorCode.CONFLICT;
        boolean permanentError = unrecoverableError
                && row.getAttemptCount() >= outboxProperties.getPermanentErrorMinAttempts();
        Duration elapsed = Duration.between(row.getFirstAttemptedAt(), LocalDateTime.now());
        if (permanentError || elapsed.toHours() >= outboxProperties.getMaxRetryHours()) {
            markFailedPermanent(row, errorCode, error);
            return;
        }

        long delayMin = Math.min(60L, 5L * (1L << Math.min(row.getAttemptCount(), 4)));
        LocalDateTime nextAttemptAt = LocalDateTime.now().plusMinutes(delayMin);
        row.markRetry(error, nextAttemptAt);
        outboxRepository.save(row);
        log.warn("Outbox retry: orderId={}, attempt={}, nextAttemptAt={}, error={}",
                row.getPartnerOrderId(), row.getAttemptCount(), nextAttemptAt, error);
    }

    /**
     * HTTP 성공 후 결과 tx가 실패한 경우, 실패한 result tx와 분리하여 PROCESSING을 PENDING으로
     * 되돌린다. 주문/이력 변경은 실패 tx가 롤백하므로 미변경이며 다음 claim은 동일
     * idempotency-key로 at-least-once replay를 수행한다.
     *
     * <p>발행 자체는 성공했으므로 {@code markRetry}(attemptCount++)가 아닌 {@code markRequeue}로
     * 재큐잉한다. 결과 저장 실패는 재시도 횟수를 부풀려선 안 되며(max-retry-hours 판정 왜곡 방지),
     * 순수 결과 영속화 재시도로만 취급한다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, timeout = RESULT_TX_TIMEOUT_SECONDS)
    public void requeueAfterResultFailure(UUID outboxId, String error) {
        SlipPublishOutbox row = processingRow(outboxId);
        if (row == null) {
            return;
        }
        LocalDateTime nextAttemptAt = LocalDateTime.now().plusMinutes(5);
        row.markRequeue(error, nextAttemptAt);
        outboxRepository.save(row);
        log.error("Outbox result persistence rolled back; requeued: outboxId={}, error={}",
                outboxId, error);
    }

    /**
     * claim 시점 종결 가드 — {@code handleRetry} 도달 여부와 <b>무관하게</b> max-retry-hours 를 보장한다
     * (#854 R4 HIGH-C).
     *
     * <p>종전에는 종결 판정(max-retry-hours → FAILED_PERMANENT)이 오직 {@code handleRetry} 안에만 있어,
     * 결과 writer 에 도달하지 못하는 실패 양상이 <b>영원히 종결되지 않았다</b>:
     * <ol>
     *   <li><b>결과 tx 실패 루프</b> — HTTP 성공 후 {@code commitSuccess} 가 결정적으로 실패하면
     *       {@code requeueAfterResultFailure} → {@code markRequeue}(attemptCount 불변) → 재claim →
     *       동일 실패가 5분 주기로 무한 반복. {@code handleRetry} 는 한 번도 호출되지 않는다.</li>
     *   <li><b>lease 재점유 루프</b> — claim 직후 프로세스가 죽으면 lease 만료 → 재claim 이 반복되는데,
     *       claim 은 attemptCount 를 증가시키지 않으므로 24h 가 지나도 FAILED 로 전이하지 않고 주문은
     *       PENDING_RETRY 에 고착된다.</li>
     * </ol>
     *
     * <p>두 경로 모두 <b>claim 을 거친다</b>는 공통점을 이용해, 스케줄러가 claim 직후 이 가드를 먼저
     * 호출하여 소진된 row 를 HTTP 재발행 없이 종결시킨다. 벽시계({@code firstAttemptedAt}) 기준이라
     * attemptCount 증가 여부와 무관하게 상한이 보장된다.
     *
     * @param outboxId claim 된 outbox row PK
     * @return 종결시켰으면 true (호출자는 이 row 의 발행을 건너뛴다)
     */
    @Transactional(timeout = RESULT_TX_TIMEOUT_SECONDS)
    public boolean expireIfExhausted(UUID outboxId) {
        SlipPublishOutbox row = processingRow(outboxId);
        if (row == null) {
            return false;
        }
        Duration elapsed = Duration.between(row.getFirstAttemptedAt(), LocalDateTime.now());
        if (elapsed.toHours() < outboxProperties.getMaxRetryHours()) {
            return false;
        }
        markFailedPermanent(row, null,
                "max-retry-hours(" + outboxProperties.getMaxRetryHours()
                        + "h) 초과 — claim 시점 종결 가드");
        return true;
    }

    /**
     * 결과 writer의 원자 소유권 가드 — row 를 비관적 쓰기 락으로 잠근 뒤 PROCESSING 인지 재검한다.
     *
     * <p>{@code findWithLockById}(FOR UPDATE)는 호출 tx 안에서 row 를 직렬화한다. 겹친 다른 worker/reaper
     * 의 결과 tx 는 이 락을 기다렸다가 최신 상태를 읽으므로, 먼저 종결한 전이(COMMITTED/PENDING)를 보고
     * skip 한다(무락 findById 로는 stale PROCESSING 을 읽어 무조건 덮어써 clobber 가 발생).
     */
    private SlipPublishOutbox processingRow(UUID outboxId) {
        SlipPublishOutbox row = outboxRepository.findWithLockById(outboxId).orElse(null);
        return row != null && row.getStatus() == OutboxStatus.PROCESSING ? row : null;
    }

    private void markFailedPermanent(SlipPublishOutbox row, ErrorCode errorCode, String error) {
        row.markFailed(error);
        outboxRepository.save(row);
        // CloudWatch 경보 원천 로그와 counter callback은 결과 tx가 commit된 뒤에만
        // 실행되도록 여기서 먼저 등록한다. history 저장/flush 실패로 tx가 rollback되면 이
        // callback도 폐기되어 FAILED_PERMANENT를 관측했다고 거짓말하지 않는다.
        UUID orderId = row.getPartnerOrderId();
        int attempts = row.getAttemptCount();
        String errorCodeLabel = errorCode == null ? "MAX_RETRY_EXHAUSTED" : errorCode.name();
        runAfterCommit(() -> log.error(
                "Outbox FAILED_PERMANENT: orderId={}, attempts={}, errorCode={}, error={}",
                orderId, attempts, errorCodeLabel, error));
        recordTerminal(terminalFailureReason(errorCode));

        orderRepository.findById(row.getPartnerOrderId()).ifPresentOrElse(order -> {
            order.markSlipFailedPermanent();
            orderRepository.save(order);
            historyRepository.save(PartnerOrderHistory.ofOrder(
                    order.getId(), order.getPartnerCode(), HistoryEventType.SLIP_FAILED_PERMANENT,
                    "system",
                    writeDetailJson(Map.of(
                            "event", "FAILED_PERMANENT",
                            "errorCode", errorCode == null ? "" : errorCode.name(),
                            "attempts", row.getAttemptCount(),
                            "error", error == null ? "" : error))));
            if (authorityEventPublisher != null) {
                authorityEventPublisher.publish(order.getId(), "OUTBOX_FAILED_PERMANENT", null);
            }
        }, () -> log.error("Outbox FAILED_PERMANENT but order missing — 주문 미갱신: outboxId={},"
                + " orderId={} (수동 정합 확인 필요)", row.getId(), row.getPartnerOrderId()));
    }

    /**
     * 고정된 사유 집합으로 terminal 전이를 관측한다.
     *
     * <p>increment 자체는 {@link #runAfterCommit} 으로 commit 확정 후에만 실행되며, 계측 장애(예:
     * 예외를 던지는 {@link MeterRegistry} 구현)는 결과 transaction 을 깨뜨리지 않는다.
     */
    private void recordTerminal(String reason) {
        runAfterCommit(() -> {
            try {
                Counter counter = terminalCounters.get(reason);
                if (counter != null) {
                    counter.increment();
                }
            } catch (RuntimeException ex) {
                log.warn("Outbox terminal metric 기록 실패: reason={}", reason, ex);
            }
        });
    }

    /**
     * 결과 tx 의 commit 이 실제로 확정된 뒤에만 {@code action} 을 실행한다 (#854 R5 MED).
     *
     * <p>활성 트랜잭션 동기화가 있으면 {@code afterCommit} 으로 등록해 미루고, 없으면(직접 단위 테스트,
     * 트랜잭션 밖 호출 등) 기존과 동일하게 즉시 실행한다 — {@code PartnerProductPriceMemoryService
     * .rememberBatchAfterCommit} 과 동일한 fallback 계약이다.
     */
    private void runAfterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
            return;
        }
        action.run();
    }

    private String terminalFailureReason(ErrorCode errorCode) {
        if (errorCode == ErrorCode.INVALID_INPUT) {
            return REASON_INVALID_INPUT;
        }
        if (errorCode == ErrorCode.CONFLICT) {
            return REASON_CONFLICT;
        }
        return REASON_MAX_RETRY_EXHAUSTED;
    }

    private String writeDetailJson(Map<String, Object> detail) {
        try {
            return objectMapper.writeValueAsString(detail);
        } catch (JsonProcessingException ex) {
            log.warn("Outbox detailJson 직렬화 실패: {}", ex.getMessage());
            return "{}";
        }
    }
}
