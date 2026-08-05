package com.samhanair.logis.notification.repository;

import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.NotificationRequest;
import com.samhanair.logis.notification.domain.NotificationStatus;
import java.util.UUID;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import jakarta.persistence.LockModeType;

/** 발송 요청 저장소 — 채널 / 상태 필터 + 수신자 별 inbox 검색. */
@Repository
public interface NotificationRequestRepository extends JpaRepository<NotificationRequest, UUID> {

    java.util.Optional<NotificationRequest> findByIdempotencyKey(String idempotencyKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select n from NotificationRequest n where n.idempotencyKey = :idempotencyKey")
    java.util.Optional<NotificationRequest> findByIdempotencyKeyForUpdate(
            @Param("idempotencyKey") String idempotencyKey);

    List<NotificationRequest> findTop100ByStatusAndCreatedAtBeforeOrderByCreatedAtAsc(
            NotificationStatus status, LocalDateTime cutoff);

    Page<NotificationRequest> findAllByChannel(NotificationChannel channel, Pageable pageable);

    Page<NotificationRequest> findAllByStatus(NotificationStatus status, Pageable pageable);

    Page<NotificationRequest> findAllByChannelAndStatus(NotificationChannel channel,
                                                       NotificationStatus status,
                                                       Pageable pageable);
}
