package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** 그룹웨어 결재 첨부용 영업수수료 정산서 검색 결과. */
public record AccountingSalesCommissionSettlementSearchResponse(
        String settlementNo,
        LocalDate settlementDate,
        String status,
        BigDecimal payoutAmount
) {
}
