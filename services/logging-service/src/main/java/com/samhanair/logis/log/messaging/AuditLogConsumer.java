package com.samhanair.logis.log.messaging;

import java.time.Instant;
import java.util.UUID;
import com.samhanair.logis.shared.audit.contract.AuditEnums;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import com.samhanair.logis.log.domain.AuditLog;
import com.samhanair.logis.log.repository.AuditLogRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Consumes audit log events from RabbitMQ and persists them to Elasticsearch.
 *
 * Failures are rethrown so the broker can route to the configured DLQ
 * ({@code samhan.audit.dlq} via DLX {@code samhan.audit.dlx}). This avoids
 * a poison message stalling the queue while preserving the message for
 * later inspection.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AuditLogConsumer {

    private final AuditLogRepository repository;

    @RabbitListener(queues = {RabbitConfig.QUEUE, RabbitConfig.FAILURE_QUEUE, RabbitConfig.READ_QUEUE})
    public void consume(AuditLogEvent event) {
        try {
            AuditLog entry = AuditLog.builder()
                    .id(event.schemaVersion() == null ? blankToUuid(event.id()) : event.id())
                    .serviceName(event.serviceName())
                    .schemaVersion(event.schemaVersion())
                    .retentionClass(event.retentionClass())
                    .eventKind(event.eventKind())
                    .outcome(event.outcome())
                    .auditAction(event.auditAction())
                    .requestId(event.requestId())
                    .traceId(event.traceId())
                    .parentService(event.parentService())
                    .httpMethod(event.httpMethod())
                    .routeTemplate(event.routeTemplate())
                    .durationMs(event.durationMs())
                    .userId(event.userId())
                    .userRole(event.userRole())
                    .actorDisplayName(event.actorDisplayName())
                    .action(event.action())
                    .resourceType(event.resourceType())
                    .resourceId(event.resourceId())
                    .internalResourceId(event.internalResourceId())
                    .description(event.description())
                    .beforeData(event.beforeData())
                    .afterData(event.afterData())
                    .ipAddress(event.ipAddress())
                    .userAgent(event.userAgent())
                    .httpStatus(event.httpStatus())
                    .errorCode(event.errorCode())
                    .errorSummary(event.errorSummary())
                    .occurredAt(event.occurredAt() != null ? event.occurredAt() : Instant.now())
                    .ingestedAt(Instant.now())
                    .build();

            repository.persistByRetentionClass(entry);
            log.debug("audit log persisted: id={} service={} action={}",
                    entry.getId(), entry.getServiceName(), entry.getAction());
        } catch (RuntimeException ex) {
            log.error("failed to persist audit log event (will be routed to DLQ): {}", event, ex);
            throw ex;
        }
    }

    private static String blankToUuid(String id) {
        return (id == null || id.isBlank()) ? UUID.randomUUID().toString() : id;
    }
}
