package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 자본변동표 (Statement of Changes in Equity) 응답 DTO.
 *
 * <p>한국 일반기업회계기준 기준 자본변동표. REPORTS-C-DESIGN.md §9 Props spec 기준 flat 구조.
 *
 * <p>구성:
 * <ul>
 *   <li>자본금 (capitalStock): 기초 / 증가(유상증자) / 감소(감자) / 기말</li>
 *   <li>이익잉여금 (retainedEarnings): 기초 / 당기순이익 / 배당 / 기말</li>
 *   <li>자본 총계 (totalEquity): 기초 / 기말 / 변동</li>
 * </ul>
 *
 * @param period                  조회 기간 레이블 (예: "2027-01-01 ~ 2027-01-31")
 * @param fromDate                집계 시작 일자
 * @param toDate                  집계 종료 일자
 * @param beginningCapitalStock   기초 자본금
 * @param capitalStockIncrease    기간 중 자본금 증가 (유상증자)
 * @param capitalStockDecrease    기간 중 자본금 감소 (감자, 음수)
 * @param endingCapitalStock      기말 자본금
 * @param beginningRetainedEarnings 기초 이익잉여금
 * @param netIncome               당기순이익
 * @param dividends               배당금 지급 (음수)
 * @param endingRetainedEarnings  기말 이익잉여금
 * @param beginningTotalEquity    기초 자본 총계
 * @param endingTotalEquity       기말 자본 총계
 * @param totalChange             기간 중 자본 변동 합계 (endingTotalEquity - beginningTotalEquity)
 * @param generatedAt             보고서 생성 시각
 */
public record EquityChangesResponse(
        String period,
        LocalDate fromDate,
        LocalDate toDate,
        BigDecimal beginningCapitalStock,
        BigDecimal capitalStockIncrease,
        BigDecimal capitalStockDecrease,
        BigDecimal endingCapitalStock,
        BigDecimal beginningRetainedEarnings,
        BigDecimal netIncome,
        BigDecimal dividends,
        BigDecimal endingRetainedEarnings,
        BigDecimal beginningTotalEquity,
        BigDecimal endingTotalEquity,
        BigDecimal totalChange,
        LocalDateTime generatedAt
) {}
