package com.samhanair.logis.slip.collab;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

/** 협업 수정 알림 outbox 저장소. */
public interface SlipCollabNotificationOutboxRepository extends JpaRepository<SlipCollabNotificationOutbox, UUID> {
    Optional<SlipCollabNotificationOutbox> findByFingerprint(String fingerprint);
    @Modifying
    @Transactional
    @Query("""
            update SlipCollabNotificationOutbox o
               set o.status = 'SENDING',
                   o.nextAttemptAt = :leaseUntil
             where o.id = :id
               and o.status in ('PENDING', 'SENDING')
               and o.nextAttemptAt <= :now
            """)
    int claim(UUID id, LocalDateTime now, LocalDateTime leaseUntil);
    List<SlipCollabNotificationOutbox> findTop100ByStatusInAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(
            List<SlipCollabNotificationOutbox.Status> statuses, LocalDateTime now);
}
