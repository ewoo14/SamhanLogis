package com.samhanair.logis.arologis.dto;

import com.samhanair.logis.arologis.domain.ArologisNotifyStatus;
import com.samhanair.logis.arologis.domain.DispatchNotification;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

/**
 * 배차 상세 차량별 알림 발송 결과.
 *
 * @param channel FE wire 채널 값 (insung-talk / aligo)
 * @param status 발송 상태
 * @param sentAt 발송 시각
 * @param recipientPhone 수신자 전화번호
 * @param errorCode 실패 코드. 성공 시 null
 */
@Schema(description = "아로로지스 배차 알림 발송 결과")
public record NotifyResult(
        @Schema(description = "발송 채널 wire 값 (insung-talk / aligo)")
        String channel,
        @Schema(description = "발송 상태 (SUCCESS / FAILED / DELAYED)")
        ArologisNotifyStatus status,
        @Schema(description = "발송 시각")
        LocalDateTime sentAt,
        @Schema(description = "수신자 전화번호")
        String recipientPhone,
        @Schema(description = "실패 코드. 성공 시 null")
        String errorCode
) {

    /** 알림 발송이력 entity 를 배차 상세 DTO 로 변환한다. */
    public static NotifyResult from(DispatchNotification notification) {
        return new NotifyResult(
                notification.getChannel().getWireValue(),
                notification.getStatus(),
                notification.getSentAt(),
                notification.getRecipientPhone(),
                notification.getErrorCode());
    }
}
