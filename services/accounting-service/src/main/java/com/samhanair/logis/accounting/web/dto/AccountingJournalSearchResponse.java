package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 결재 문서 참조용 분개장 검색 결과.
 *
 * @param journalNo 분개번호 ({@code yyyy/MM/dd-N})
 * @param journalDate 분개일자
 * @param description 적요
 * @param totalAmount 차변 합계 기준 분개 총액
 */
public record AccountingJournalSearchResponse(
        String journalNo,
        LocalDate journalDate,
        String description,
        BigDecimal totalAmount
) {
}
