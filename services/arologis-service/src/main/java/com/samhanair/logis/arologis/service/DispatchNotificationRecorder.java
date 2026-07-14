package com.samhanair.logis.arologis.service;

import com.samhanair.logis.arologis.domain.ArologisNotifyChannel;
import com.samhanair.logis.arologis.domain.ArologisNotifyStatus;
import com.samhanair.logis.arologis.domain.DispatchNotification;
import com.samhanair.logis.arologis.repository.DispatchNotificationRepository;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배차 매칭 알림 이력 저장 전용 recorder.
 *
 * <p>자동 매칭 본 트랜잭션과 분리된 {@link Propagation#REQUIRES_NEW} 트랜잭션에서 저장한다.
 *
 * <p><b>fail-soft 계약은 호출자 책임이다.</b> {@link DispatchNotification} 은
 * {@code @UuidGenerator} (before-execution id 생성)를 사용하므로 {@code repository.save(...)} 는
 * 실제 INSERT 를 즉시 실행하지 않고 flush-at-COMMIT 시점까지 지연시킨다. 즉 본 메서드 내부에서
 * try/catch 로 저장 실패를 삼키더라도, 실제 제약조건 위반 등은 이 메서드가 반환되고 REQUIRES_NEW
 * 트랜잭션이 커밋되는 시점(스프링 {@code JpaTransactionManager.doCommit()})에 발생하므로 내부 catch
 * 로는 잡히지 않고 호출자에게 예외(또는 {@code UnexpectedRollbackException})로 전파된다.
 * 따라서 본 메서드는 저장 실패를 그대로 던지고, 호출자가 REQUIRES_NEW 로 격리된 이 트랜잭션만
 * 롤백시키면서 자신의 흐름(예: 자동 매칭 batch)은 계속 진행하도록 try/catch 를 감싸야 한다.
 */
@Service
@RequiredArgsConstructor
public class DispatchNotificationRecorder {

    private final DispatchNotificationRepository repository;

    /**
     * 배차 차량 알림 발송 이력을 독립 트랜잭션으로 저장한다.
     *
     * <p>저장 실패(제약조건 위반, DB 장애 등)는 삼키지 않고 그대로 던진다. 자동 매칭 batch 를
     * 보호하는 fail-soft 처리는 호출자(예: {@code DispatchService}) 가 수행해야 한다.
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
        repository.save(DispatchNotification.of(
                dispatchId,
                vehicleId,
                channel,
                status,
                sentAt,
                recipientPhone,
                errorCode));
    }
}
