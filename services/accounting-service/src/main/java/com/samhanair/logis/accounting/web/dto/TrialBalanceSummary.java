package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;

/**
 * 시산표 요약 — 총 차변 / 총 대변 / 일치 여부.
 *
 * <p>P0-1 Slice A 보강: {@link TrialBalanceResponse} 의 {@code summary} 필드로 제공.
 * {@code balanced = true} 이면 복식부기 항등식이 성립함을 의미한다.
 *
 * @param totalDebit  총 차변 합계
 * @param totalCredit 총 대변 합계
 * @param balanced    차변 == 대변 여부
 */
public record TrialBalanceSummary(
        BigDecimal totalDebit,
        BigDecimal totalCredit,
        boolean balanced
) {}
