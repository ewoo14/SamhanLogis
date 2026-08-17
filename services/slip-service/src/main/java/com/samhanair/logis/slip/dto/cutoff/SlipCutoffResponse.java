package com.samhanair.logis.slip.dto.cutoff;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.cutoff.SlipOutboundCutoff;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.UUID;

/**
 * 출고전표 마감시각 응답 DTO.
 *
 * @param id               내부 라우팅용 UUID (화면 식별자로 노출하지 않는다)
 * @param deliveryTag      배송 태그 enum 이름
 * @param deliveryTagLabel 배송 태그 한국어 라벨 ({@link DeliveryTag#getKoreanLabel()})
 * @param cutoffTime       마감 시각 (HH:mm 형식)
 * @param active           활성 여부
 * @param createdAt        생성 일시
 * @param modifiedAt       수정 일시
 */
public record SlipCutoffResponse(
        DeliveryTag deliveryTag,
        String deliveryTagLabel,
        @JsonFormat(pattern = "HH:mm") LocalTime cutoffTime,
        boolean active,
        LocalDateTime createdAt,
        LocalDateTime modifiedAt
) {

    /** {@link SlipOutboundCutoff} 엔티티를 응답 DTO 로 변환한다. */
    public static SlipCutoffResponse from(SlipOutboundCutoff cutoff) {
        return new SlipCutoffResponse(
                cutoff.getDeliveryTag(),
                cutoff.getDeliveryTag().getKoreanLabel(),
                cutoff.getCutoffTime(),
                cutoff.isActive(),
                cutoff.getCreatedAt(),
                cutoff.getModifiedAt());
    }
}
