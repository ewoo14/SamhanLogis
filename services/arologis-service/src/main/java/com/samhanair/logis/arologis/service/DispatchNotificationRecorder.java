package com.samhanair.logis.arologis.service;

import com.samhanair.logis.arologis.domain.ArologisNotifyChannel;
import com.samhanair.logis.arologis.domain.ArologisNotifyStatus;
import com.samhanair.logis.arologis.domain.DispatchNotification;
import com.samhanair.logis.arologis.repository.DispatchNotificationRepository;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배차 매칭 알림 이력 저장 전용 recorder.
 *
 * <p>자동 매칭 본 트랜잭션과 분리된 {@link Propagation#REQUIRES_NEW} 트랜잭션에서 저장하고,
 * 저장 실패는 fail-soft로 삼켜 배차 매칭 batch를 롤백시키지 않는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DispatchNotificationRecorder {

    private final DispatchNotificationRepository repository;

    /**
     * 배차 차량 알림 발송 이력을 독립 트랜잭션으로 저장한다.
     *
     * @param dispatchId 배차 UUID
     * @param vehicleId 차량 UUID
     * @param channel 아로로지스 알림 채널
     * @param status 발송 상태
     * @param sentAt 발송 시각
     * @param recipientPhone 수신 전화번호
     * @param errorCode 실패 코드. 성공 또는 지연이면 null
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID dispatchId, UUID vehicleId, ArologisNotifyChannel channel,
                       ArologisNotifyStatus status, LocalDateTime sentAt,
                       String recipientPhone, String errorCode) {
        try {
            repository.save(DispatchNotification.of(
                    dispatchId,
                    vehicleId,
                    channel,
                    status,
                    sentAt,
                    recipientPhone,
                    errorCode));
        } catch (RuntimeException ex) {
            log.warn("배차 매칭 알림 이력 기록 실패 (fail-soft) - dispatchId={} vehicleId={} msg={}",
                    dispatchId, vehicleId, ex.getMessage());
        }
    }
}
