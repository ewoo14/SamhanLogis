package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 월계표 일별 소계 행.
 *
 * @param journalDate  분개 일자
 * @param journalCount 해당 일자 분개 건수
 * @param debitTotal   해당 일자 차변 합계
 * @param creditTotal  해당 일자 대변 합계
 */
public record DailyBreakdownLine(
        LocalDate journalDate,
        long journalCount,
        BigDecimal debitTotal,
        BigDecimal creditTotal
) {}
