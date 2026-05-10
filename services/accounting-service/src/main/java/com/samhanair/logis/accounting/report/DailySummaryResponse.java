package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 일계표 (Daily Summary) 응답 DTO.
 *
 * <p>특정 일자의 POSTED 분개 전체 집계. 계정과목 대분류별 차변/대변 합계 포함.
 *
 * @param summaryDate     집계 일자
 * @param journalCount    집계 분개 건수
 * @param totalDebit      차변 합계
 * @param totalCredit     대변 합계
 * @param balanced        차변 = 대변 여부 (|totalDebit - totalCredit| &lt; 0.01)
 * @param accountTotals   계정별 차/대 합계 행 목록
 * @param generatedAt     보고서 생성 시각
 */
public record DailySummaryResponse(
        LocalDate summaryDate,
        long journalCount,
        BigDecimal totalDebit,
        BigDecimal totalCredit,
        boolean balanced,
        List<AccountSummaryLine> accountTotals,
        LocalDateTime generatedAt
) {}
