package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 전표 요약 응답 — 라인 미포함, 페이지/리스트 용.
 *
 * <p>{@code deliveryTag} 는 영문 enum 코드 (API 식별자), {@code deliveryTagLabel} 은
 * {@link DeliveryTag#getKoreanLabel()} 로 변환된 한국어 표시 라벨.
 * FE 는 두 값 모두 수신하므로 별도 매핑 없이 바로 렌더링 가능.
 */
public record SlipResponse(
        UUID id,
        SlipType slipType,
        String slipNo,
        LocalDate slipDate,
        int seqNo,
        SlipStatus status,
        UUID partnerId,
        String partnerName,
        UUID sourceWarehouseId,
        UUID destinationWarehouseId,
        DeliveryTag deliveryTag,
        String deliveryTagLabel,
        String requesterId,
        String acceptedBy,
        LocalDateTime acceptedAt,
        LocalDateTime completedAt,
        LocalDateTime confirmedAt,
        Long version) {

    public static SlipResponse from(Slip slip) {
        DeliveryTag tag = slip.getDeliveryTag();
        return new SlipResponse(
                slip.getId(),
                slip.getSlipType(),
                slip.getSlipNo(),
                slip.getSlipDate(),
                slip.getSeqNo(),
                slip.getStatus(),
                slip.getPartnerId(),
                slip.getPartnerName(),
                slip.getSourceWarehouseId(),
                slip.getDestinationWarehouseId(),
                tag,
                tag != null ? tag.getKoreanLabel() : null,
                slip.getRequesterId(),
                slip.getAcceptedBy(),
                slip.getAcceptedAt(),
                slip.getCompletedAt(),
                slip.getConfirmedAt(),
                slip.getVersion());
    }
}
