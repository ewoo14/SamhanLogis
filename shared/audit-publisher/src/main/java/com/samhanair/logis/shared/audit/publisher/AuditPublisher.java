package com.samhanair.logis.shared.audit.publisher;

import static com.samhanair.logis.shared.audit.contract.AuditEnums.AuditAction;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.samhanair.logis.shared.audit.contract.AuditEventV2;
import com.samhanair.logis.shared.audit.contract.AuditEventValidator;
import com.samhanair.logis.shared.audit.contract.AuditTopology;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class AuditPublisher implements AutoCloseable {
    private final RabbitTemplate rabbitTemplate;
    private final ArrayBlockingQueue<AuditEventV2> priorityLane;
    private final ArrayBlockingQueue<AuditEventV2> readLane;
    private final ExecutorService workers;
    private final Counter dropped;
    private final boolean enabled;

    public AuditPublisher(RabbitTemplate rabbitTemplate, MeterRegistry meters) {
        this(rabbitTemplate, meters, true);
    }

    public AuditPublisher(RabbitTemplate rabbitTemplate, MeterRegistry meters, boolean enabled) {
        this.rabbitTemplate = rabbitTemplate;
        this.enabled = enabled;
        this.priorityLane = new ArrayBlockingQueue<>(128);
        this.readLane = new ArrayBlockingQueue<>(128);
        this.workers = Executors.newFixedThreadPool(2, runnable -> {
            Thread thread = new Thread(runnable, "audit-publisher");
            thread.setDaemon(true);
            return thread;
        });
        this.dropped = Counter.builder("audit.publisher.drop.total").tag("reason", "queue_full").register(meters);
        if (!enabled) {
            log.warn("[AUDIT_DISABLED] 중앙 감사 publisher는 등록되었지만 samhan.audit.publisher.enabled=false 입니다");
        }
        workers.execute(() -> drain(priorityLane));
        workers.execute(() -> drain(readLane));
    }

    public void publish(AuditEventV2 event) {
        if (!enabled) {
            log.warn("[AUDIT_DISABLED] 감사 이벤트를 발행하지 않았습니다 id={}", safe(event));
            return;
        }
        try {
            AuditEventValidator.validate(event);
            boolean accepted = event.action() == AuditAction.C_READ ? readLane.offer(event) : priorityLane.offer(event);
            if (!accepted) dropped.increment();
        } catch (RuntimeException ex) {
            log.warn("audit publisher rejected event id={} reason={}", safe(event), ex.getClass().getSimpleName());
        }
    }

    /** 트랜잭션이 있으면 commit 이후에만 bounded lane에 넣고, 없으면 즉시 non-blocking enqueue한다. */
    public void publishAfterCommit(AuditEventV2 event) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { publish(event); }
            });
            return;
        }
        publish(event);
    }

    private void drain(ArrayBlockingQueue<AuditEventV2> lane) {
        while (!Thread.currentThread().isInterrupted()) {
            try {
                AuditEventV2 event = lane.take();
                if (rabbitTemplate == null) {
                    log.warn("[AUDIT_DISABLED] Rabbit ConnectionFactory가 없어 이벤트를 발행하지 않았습니다 id={}", safe(event));
                    continue;
                }
                rabbitTemplate.convertAndSend(AuditTopology.EXCHANGE, event.routingKey(), event);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            } catch (RuntimeException ex) {
                log.warn("audit publisher failed id={} reason={}", "internal", ex.getClass().getSimpleName());
            }
        }
    }

    private static String safe(AuditEventV2 event) { return event == null ? "null" : event.id(); }

    @Override public void close() {
        workers.shutdownNow();
        try { workers.awaitTermination(1, TimeUnit.SECONDS); } catch (InterruptedException ex) { Thread.currentThread().interrupt(); }
    }
}
