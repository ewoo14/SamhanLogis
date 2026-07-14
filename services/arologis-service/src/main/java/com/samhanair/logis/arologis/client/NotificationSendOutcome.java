package com.samhanair.logis.arologis.client;

import com.samhanair.logis.arologis.domain.ArologisNotifyStatus;

/**
 * 배차 매칭 알림 발송 시도 결과.
 *
 * @param attempted 실제 notification-service 호출 또는 호출 가능한 실패까지 도달했는지 여부
 * @param status 아로로지스 화면에 노출할 발송 상태. 미시도이면 null
 * @param errorCode 실패 사유 코드. 성공 또는 지연이면 null
 */
public record NotificationSendOutcome(
        boolean attempted,
        ArologisNotifyStatus status,
        String errorCode
) {
}
