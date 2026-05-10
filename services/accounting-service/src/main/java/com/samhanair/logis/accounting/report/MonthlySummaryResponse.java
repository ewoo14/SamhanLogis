package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;

/**
 * 월계표 (Monthly Summary) 응답 DTO.
 *
 * <p>특정 월의 POSTED 분개 전체 집계. 일별 소계 breakdown 포함.
 *
 * @param period          집계 월 (yyyyMM 형식 레이블, 예: "2026-01")
 * @param yearMonth       집계 YearMonth
 * @param fromDate        집계 시작 일자 (월 1일)
 * @param toDate          집계 종료 일자 (월 말일)
 * @param journalCount    집계 분개 건수
 * @param totalDebit      차변 합계
 * @param totalCredit     대변 합계
 * @param balanced        차변 = 대변 여부
 * @param dailyBreakdown  일별 소계 행 목록 (일자 오름차순)
 * @param generatedAt     보고서 생성 시각
 */
public record MonthlySummaryResponse(
        String period,
        YearMonth yearMonth,
        LocalDate fromDate,
        LocalDate toDate,
        long journalCount,
        BigDecimal totalDebit,
        BigDecimal totalCredit,
        boolean balanced,
        List<DailyBreakdownLine> dailyBreakdown,
        LocalDateTime generatedAt
) {}
