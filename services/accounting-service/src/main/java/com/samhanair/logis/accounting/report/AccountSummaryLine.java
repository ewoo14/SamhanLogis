package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;

/**
 * 일계표 / 월계표 계정별 차/대 합계 행.
 *
 * @param accountCode  계정 코드
 * @param accountName  계정명
 * @param debitTotal   차변 합계
 * @param creditTotal  대변 합계
 */
public record AccountSummaryLine(
        String accountCode,
        String accountName,
        BigDecimal debitTotal,
        BigDecimal creditTotal
) {}
