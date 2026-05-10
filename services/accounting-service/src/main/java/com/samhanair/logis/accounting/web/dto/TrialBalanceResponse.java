package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

/**
 * 시산표 응답 — period (yyyyMM) + 7-그룹 행 + 합계 + summary.
 *
 * <p>P0-1 Slice A 보강: {@code summary} 필드로 총 차변/대변/일치 여부를 명시적으로 제공.
 * 기존 {@code totalDebit} / {@code totalCredit} 필드는 하위 호환 유지.
 */
public record TrialBalanceResponse(
        YearMonth period,
        BigDecimal totalDebit,
        BigDecimal totalCredit,
        List<TrialBalanceRowResponse> rows,
        TrialBalanceSummary summary
) {

    /**
     * 하위 호환 생성자 — P0-1 이전 호출자 코드 호환.
     * summary 는 totalDebit / totalCredit 으로부터 자동 계산.
     *
     * @param period      회계 월
     * @param totalDebit  총 차변 합계
     * @param totalCredit 총 대변 합계
     * @param rows        행 목록
     */
    public TrialBalanceResponse(YearMonth period, BigDecimal totalDebit,
                                BigDecimal totalCredit, List<TrialBalanceRowResponse> rows) {
        this(period, totalDebit, totalCredit, rows,
                new TrialBalanceSummary(totalDebit, totalCredit,
                        totalDebit.compareTo(totalCredit) == 0));
    }
}
