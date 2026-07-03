package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 일계표 (Daily Summary) 응답 DTO (REPORTS-C-DESIGN.md §9 Props spec 일치).
 *
 * <p>특정 일자의 POSTED+REVERSED(보상쌍 상쇄) 분개 전체 집계. 계정과목별 차변/대변/잔액 합계 포함.
 *
 * @param date            집계 일자 (spec 필드명: date)
 * @param journalCount    집계 분개 건수
 * @param totalDebit      차변 합계
 * @param totalCredit     대변 합계
 * @param balanced        차변 = 대변 여부 (|totalDebit - totalCredit| &lt; 0.01)
 * @param accountSummary  계정별 차/대/잔액 합계 행 목록 (spec 필드명: accountSummary)
 * @param generatedAt     보고서 생성 시각
 */
public record DailySummaryResponse(
        LocalDate date,
        long journalCount,
        BigDecimal totalDebit,
        BigDecimal totalCredit,
        boolean balanced,
        List<DailyAccountLine> accountSummary,
        LocalDateTime generatedAt
) {}
