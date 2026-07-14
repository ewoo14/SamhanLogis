package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.DispatchNotification;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 배차 알림 발송이력 repository.
 */
public interface DispatchNotificationRepository extends JpaRepository<DispatchNotification, UUID> {

    List<DispatchNotification> findAllByDispatchIdOrderBySentAtAsc(UUID dispatchId);
}
