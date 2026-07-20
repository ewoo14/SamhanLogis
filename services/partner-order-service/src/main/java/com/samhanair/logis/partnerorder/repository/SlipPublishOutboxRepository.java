package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.outbox.OutboxStatus;
import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Outbox row 조회 + scheduler picks. PENDING + nextAttemptAt &le; now() 가 candidates.
 */
@Repository
public interface SlipPublishOutboxRepository extends JpaRepository<SlipPublishOutbox, UUID> {

    /** scheduler picks 후보 — PENDING + nextAttemptAt 도래 + size 제한 (caller paging). */
    List<SlipPublishOutbox> findAllByStatusAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAsc(
            OutboxStatus status, LocalDateTime now);

    /** 단건 처리 시 다른 worker 의 pick 을 막는 비관적 쓰기 락 조회. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from SlipPublishOutbox o where o.id = :id")
    Optional<SlipPublishOutbox> findWithLockById(@Param("id") UUID id);

    /** 동일 PartnerOrder 의 outbox row (재발행 시 conflict 방지). */
    boolean existsByPartnerOrderId(UUID partnerOrderId);
}
