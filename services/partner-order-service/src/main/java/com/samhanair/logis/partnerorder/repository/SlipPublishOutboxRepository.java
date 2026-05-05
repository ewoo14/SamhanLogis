package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.outbox.OutboxStatus;
import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Outbox row 조회 + scheduler picks. PENDING + nextAttemptAt &le; now() 가 candidates.
 */
@Repository
public interface SlipPublishOutboxRepository extends JpaRepository<SlipPublishOutbox, UUID> {

    /** scheduler picks 후보 — PENDING + nextAttemptAt 도래 + size 제한 (caller paging). */
    List<SlipPublishOutbox> findAllByStatusAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAsc(
            OutboxStatus status, LocalDateTime now);

    /** 동일 PartnerOrder 의 outbox row (재발행 시 conflict 방지). */
    boolean existsByPartnerOrderId(UUID partnerOrderId);
}
