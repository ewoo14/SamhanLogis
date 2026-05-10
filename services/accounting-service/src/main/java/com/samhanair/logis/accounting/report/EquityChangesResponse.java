package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 자본변동표 (Statement of Changes in Equity) 응답 DTO.
 *
 * <p>한국 일반기업회계기준 기준 자본변동표. 자본금 / 자본잉여금 / 이익잉여금 변동 내역 포함.
 *
 * <p>변동 유형:
 * <ul>
 *   <li>CAPITAL_INCREASE — 유상증자 (자본금 + 주식발행초과금 증가)</li>
 *   <li>DIVIDEND         — 배당금 지급 (이익잉여금 감소)</li>
 *   <li>NET_INCOME       — 당기순이익 (이익잉여금 증가)</li>
 * </ul>
 *
 * @param period          조회 기간 레이블 (예: "2026-01 ~ 2026-04")
 * @param fromDate        집계 시작 일자
 * @param toDate          집계 종료 일자
 * @param lines           자본변동 명세 행 목록
 * @param beginningEquity 기초 자본 총계
 * @param totalChange     기간 중 자본 변동 합계
 * @param endingEquity    기말 자본 총계 (beginningEquity + totalChange)
 * @param generatedAt     보고서 생성 시각
 */
public record EquityChangesResponse(
        String period,
        LocalDate fromDate,
        LocalDate toDate,
        List<EquityChangeLine> lines,
        BigDecimal beginningEquity,
        BigDecimal totalChange,
        BigDecimal endingEquity,
        LocalDateTime generatedAt
) {}
