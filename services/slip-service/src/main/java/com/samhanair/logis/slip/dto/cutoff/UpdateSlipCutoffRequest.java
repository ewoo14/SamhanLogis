package com.samhanair.logis.slip.dto.cutoff;

import java.time.LocalTime;

/**
 * 출고전표 마감시각 수정 요청 DTO (PATCH 시맨틱).
 *
 * <p>{@code null} 인 필드는 미변경으로 처리한다.
 *
 * @param cutoffTime 새 마감 시각 (null 이면 미변경)
 * @param active     활성 여부 (null 이면 미변경)
 */
public record UpdateSlipCutoffRequest(
        LocalTime cutoffTime,
        Boolean active
) {
}
