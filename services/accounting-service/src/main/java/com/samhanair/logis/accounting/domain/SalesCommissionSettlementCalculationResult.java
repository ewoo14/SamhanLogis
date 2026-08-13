package com.samhanair.logis.accounting.domain;

import java.math.BigDecimal;
import java.util.Objects;

/** 레거시 영업수수료 계산의 중간값·최종값 snapshot. */
public record SalesCommissionSettlementCalculationResult(
        BigDecimal card,
        BigDecimal sales,
        BigDecimal expenseRate,
        BigDecimal expense,
        BigDecimal withholding,
        BigDecimal install,
        BigDecimal safety,
        BigDecimal subtotal,
        BigDecimal payout,
        BigDecimal supply,
        BigDecimal vat) {

    /** 계산 결과의 모든 금액과 적용 제경비율이 존재하는지 확인한다. */
    public SalesCommissionSettlementCalculationResult {
        Objects.requireNonNull(card, "card 는 필수입니다");
        Objects.requireNonNull(sales, "sales 는 필수입니다");
        Objects.requireNonNull(expenseRate, "expenseRate 는 필수입니다");
        Objects.requireNonNull(expense, "expense 는 필수입니다");
        Objects.requireNonNull(withholding, "withholding 은 필수입니다");
        Objects.requireNonNull(install, "install 은 필수입니다");
        Objects.requireNonNull(safety, "safety 는 필수입니다");
        Objects.requireNonNull(subtotal, "subtotal 은 필수입니다");
        Objects.requireNonNull(payout, "payout 은 필수입니다");
        Objects.requireNonNull(supply, "supply 는 필수입니다");
        Objects.requireNonNull(vat, "vat 는 필수입니다");
    }
}
