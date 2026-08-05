package com.samhanair.logis.slip.collab;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 협업 수정 알림 outbox 저장소. */
public interface SlipCollabNotificationOutboxRepository extends JpaRepository<SlipCollabNotificationOutbox, UUID> {
    Optional<SlipCollabNotificationOutbox> findByFingerprint(String fingerprint);
    List<SlipCollabNotificationOutbox> findTop100ByStatusInAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(
            List<SlipCollabNotificationOutbox.Status> statuses, LocalDateTime now);
}
