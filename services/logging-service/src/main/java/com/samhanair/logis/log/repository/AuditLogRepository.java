package com.samhanair.logis.log.repository;

import java.time.Instant;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;

import com.samhanair.logis.log.domain.AuditLog;

/**
 * Spring Data Elasticsearch repository for {@link AuditLog}.
 */
public interface AuditLogRepository
        extends ElasticsearchRepository<AuditLog, String>, AuditLogActivityRepository {

    Page<AuditLog> findByServiceName(String serviceName, Pageable pageable);

    Page<AuditLog> findByUserId(String userId, Pageable pageable);

    Page<AuditLog> findByActionAndOccurredAtBetween(
            String action, Instant from, Instant to, Pageable pageable);
}
