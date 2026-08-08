package com.samhanair.logis.slip.dto.closing;

import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.service.closing.SlipClosingBaseline;
import java.time.LocalDate;
import java.util.UUID;

/** 전표 종류별 마감 기준선 응답. */
public record SlipClosingBaselineResponse(
        UUID id,
        SlipType slipType,
        String slipTypeName,
        LocalDate baselineDate,
        boolean enabled
) {
    public static SlipClosingBaselineResponse from(SlipClosingBaseline baseline) {
        return new SlipClosingBaselineResponse(
                baseline.getId(), baseline.getSlipType(), baseline.getSlipType().getDisplayName(),
                baseline.getBaselineDate(), baseline.isEnabled());
    }
}
