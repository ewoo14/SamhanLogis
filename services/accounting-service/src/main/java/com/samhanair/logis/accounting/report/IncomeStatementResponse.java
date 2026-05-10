package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 손익계산서 (Income Statement / P&L) 응답 DTO.
 *
 * <p>집계 구조:
 * <pre>
 *   [매출 (400~)]          revenue
 *   [매출원가 (500~)]      costOfSales
 *   ──────────────────────────────────
 *   매출총이익              grossProfit  = revenue 소계 - costOfSales 소계
 *   [판매비와관리비 (800~)] sga
 *   ──────────────────────────────────
 *   영업이익                operatingProfit = grossProfit - sga 소계
 *   [영업외손익 (900~)]     nonOperating
 *   ──────────────────────────────────
 *   법인세차감전순이익       incomeBeforeTax = operatingProfit + nonOperating 소계
 *   [법인세비용 (991)]      incomeTax
 *   ──────────────────────────────────
 *   당기순이익              netIncome = incomeBeforeTax - incomeTax
 * </pre>
 *
 * @param period               표시 기간 문자열 ("2026-04" 또는 "2026-04 ~ 2026-05")
 * @param fromDate             집계 시작 일자
 * @param toDate               집계 종료 일자
 * @param revenue              매출 계정 행 목록 (400 그룹)
 * @param totalRevenue         매출 소계
 * @param costOfSales          매출원가 계정 행 목록 (500 그룹)
 * @param totalCostOfSales     매출원가 소계
 * @param grossProfit          매출총이익 = totalRevenue - totalCostOfSales
 * @param sga                  판관비 계정 행 목록 (800 그룹)
 * @param totalSga             판관비 소계
 * @param operatingProfit      영업이익 = grossProfit - totalSga
 * @param nonOperating         영업외손익 계정 행 목록 (900 그룹)
 * @param totalNonOperating    영업외손익 소계 (수익 양수, 비용 음수 합산)
 * @param incomeBeforeTax      법인세차감전순이익 = operatingProfit + totalNonOperating
 * @param incomeTax            법인세비용 (991)
 * @param netIncome            당기순이익 = incomeBeforeTax - incomeTax
 * @param generatedAt          보고서 생성 시각
 */
public record IncomeStatementResponse(
        String period,
        LocalDate fromDate,
        LocalDate toDate,
        List<IncomeStatementLine> revenue,
        BigDecimal totalRevenue,
        List<IncomeStatementLine> costOfSales,
        BigDecimal totalCostOfSales,
        BigDecimal grossProfit,
        List<IncomeStatementLine> sga,
        BigDecimal totalSga,
        BigDecimal operatingProfit,
        List<IncomeStatementLine> nonOperating,
        BigDecimal totalNonOperating,
        BigDecimal incomeBeforeTax,
        BigDecimal incomeTax,
        BigDecimal netIncome,
        LocalDateTime generatedAt
) {}
