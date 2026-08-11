package com.samhanair.logis.accounting.domain;

import java.math.BigDecimal;
import java.util.Objects;

/** 레거시 영업수수료 계산기에 전달하는 입력 snapshot. 금액은 모두 BigDecimal이다. */
public record SalesCommissionSettlementCalculationInput(
        BigDecimal total,
        BigDecimal equipment,
        BigDecimal prepaid,
        BigDecimal install,
        BigDecimal safety,
        SalesCommissionPaymentMethod paymentMethod,
        boolean withholdingApplied,
        BigDecimal manualExpenseRate) {

    /** 계산 입력의 필수 금액과 결제방식을 검증한다. 수기 제경비율 null은 기본율 선택을 뜻한다. */
    public SalesCommissionSettlementCalculationInput {
        Objects.requireNonNull(total, "total 은 필수입니다");
        Objects.requireNonNull(equipment, "equipment 는 필수입니다");
        Objects.requireNonNull(prepaid, "prepaid 는 필수입니다");
        Objects.requireNonNull(install, "install 은 필수입니다");
        Objects.requireNonNull(safety, "safety 는 필수입니다");
        Objects.requireNonNull(paymentMethod, "paymentMethod 는 필수입니다");
    }
}
