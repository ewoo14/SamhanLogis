package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.SalesCommissionPaymentMethod;
import com.samhanair.logis.accounting.domain.SalesCommissionRateContract;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementCalculationInput;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementCalculationResult;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;
import org.springframework.stereotype.Service;

/** 레거시 {@code getValues} 순서를 BigDecimal로 보존하는 영업수수료 계산기. */
@Service
public class SalesCommissionSettlementCalculator {

    private static final BigDecimal VAT_DIVISOR = new BigDecimal("1.1");

    /** 계약 버전과 입력 snapshot으로 영업수수료 중간값·최종값을 계산한다. */
    public SalesCommissionSettlementCalculationResult calculate(
            SalesCommissionSettlementCalculationInput input,
            SalesCommissionRateContract contract) {
        Objects.requireNonNull(input, "input 은 필수입니다");
        Objects.requireNonNull(contract, "contract 는 필수입니다");

        BigDecimal card = input.paymentMethod() == SalesCommissionPaymentMethod.CARD
                ? xround(input.total().negate().multiply(contract.getCardRate()))
                : BigDecimal.ZERO;
        BigDecimal sales = input.total().subtract(input.equipment()).add(card);
        BigDecimal expenseRate = input.manualExpenseRate() == null
                ? contract.getExpenseRate()
                : input.manualExpenseRate();
        BigDecimal expense = xround(sales.multiply(expenseRate.negate()));
        BigDecimal withholding = input.withholdingApplied()
                ? xround(sales.multiply(contract.getWithholdingRate().negate()))
                : BigDecimal.ZERO;
        BigDecimal install = xround(input.install().multiply(contract.getInstallRate().negate()));
        BigDecimal safety = input.safety().negate();
        BigDecimal subtotal = sales.add(expense).add(withholding).add(install).add(safety);
        BigDecimal payout = subtotal.subtract(input.prepaid());
        BigDecimal supply = xround(subtotal.divide(VAT_DIVISOR, 20, RoundingMode.HALF_UP));
        BigDecimal vat = subtotal.subtract(supply);

        return new SalesCommissionSettlementCalculationResult(
                card, sales, expenseRate, expense, withholding, install, safety,
                subtotal, payout, supply, vat);
    }

    /** 원문 xround: 소수 0자리에서 절대값을 HALF_UP한 뒤 부호를 보존한다. */
    private static BigDecimal xround(BigDecimal value) {
        return value.setScale(0, RoundingMode.HALF_UP);
    }
}
