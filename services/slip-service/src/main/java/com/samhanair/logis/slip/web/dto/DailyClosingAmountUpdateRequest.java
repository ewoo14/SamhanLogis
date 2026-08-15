package com.samhanair.logis.slip.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** 일마감에서 금액 세 열만 수정하는 요청. 품목·수량·거래처·창고 필드는 계약상 존재하지 않는다. */
public record DailyClosingAmountUpdateRequest(
        @NotNull LocalDateTime updatedAt,
        @Valid @NotEmpty List<Line> lines) {

    /** 저장 결과와 그 계산 근거를 함께 받는다. releasePrice 는 조회 기준값이며 저장하지 않는다. */
    public record Line(
            @NotNull UUID lineId,
            @NotNull @DecimalMin("0") BigDecimal unitPriceWithVat,
            @NotNull @DecimalMin("0") BigDecimal releasePrice,
            @NotNull BigDecimal discountRate) {
    }
}
