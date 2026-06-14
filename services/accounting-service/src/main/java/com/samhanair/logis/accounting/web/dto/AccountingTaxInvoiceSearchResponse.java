package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 결재 문서 참조용 세금계산서 검색 결과.
 *
 * @param taxInvoiceNo 세금계산서 번호
 * @param date 공급일자
 * @param partnerName 거래처명
 * @param amount 합계금액
 */
public record AccountingTaxInvoiceSearchResponse(
        String taxInvoiceNo,
        LocalDate date,
        String partnerName,
        BigDecimal amount
) {
}
