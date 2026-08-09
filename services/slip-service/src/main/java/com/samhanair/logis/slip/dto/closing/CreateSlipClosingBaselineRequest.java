package com.samhanair.logis.slip.dto.closing;

import com.samhanair.logis.slip.domain.SlipType;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

/** 전표 종류별 마감 기준선 등록 요청. */
public record CreateSlipClosingBaselineRequest(
        @NotNull SlipType slipType,
        @NotNull LocalDate baselineDate
) {
}
