package com.samhanair.logis.slip.dto.cutoff;

import com.samhanair.logis.slip.domain.DeliveryTag;
import jakarta.validation.constraints.NotNull;
import java.time.LocalTime;

/**
 * 출고전표 마감시각 등록 요청 DTO.
 *
 * @param deliveryTag OUTBOUND 방향 배송 태그 (필수)
 * @param cutoffTime  마감 시각(KST) (필수)
 * @param active      활성 여부 (null 이면 true 로 처리)
 */
public record CreateSlipCutoffRequest(
        @NotNull DeliveryTag deliveryTag,
        @NotNull LocalTime cutoffTime,
        Boolean active
) {
}
