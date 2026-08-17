package com.samhanair.logis.common.financial;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * VAT 포함 단가 기준의 일마감 금액 계약.
 *
 * <p>VAT 포함 단가와 수량으로 라인 VAT 포함 합계를 먼저 원 단위 HALF_UP 반올림한 뒤,
 * 레거시 {@link VatAmountCalculator} 규칙으로 공급가액·부가세를 분리한다. 개당 공급가액을
 * 먼저 소수 변환하고 수량을 곱하면 소수 금액이 수량만큼 증폭되므로 금지한다.
 */
public final class VatInclusiveUnitAmountCalculator {

    private VatInclusiveUnitAmountCalculator() {
    }

    public static Breakdown calculate(BigDecimal unitPriceWithVat, int quantity) {
        if (unitPriceWithVat == null || unitPriceWithVat.signum() < 0) {
            throw new IllegalArgumentException("VAT 포함 단가는 0 이상이어야 합니다");
        }
        if (quantity <= 0) {
            throw new IllegalArgumentException("수량은 양수여야 합니다");
        }
        BigDecimal unit = unitPriceWithVat.setScale(2, RoundingMode.HALF_UP);
        BigDecimal total = unit.multiply(BigDecimal.valueOf(quantity))
                .setScale(0, RoundingMode.HALF_UP);
        VatAmountCalculator.Split split = VatAmountCalculator.splitVatInclusive(total);
        return new Breakdown(unit, split.supplyAmount().divide(BigDecimal.valueOf(quantity), 2,
                        RoundingMode.HALF_UP),
                split.vatAmount().divide(BigDecimal.valueOf(quantity), 2, RoundingMode.HALF_UP),
                split.supplyAmount(), split.vatAmount(), split.lineTotal());
    }

    public record Breakdown(BigDecimal unitPriceWithVat, BigDecimal supplyPerUnit,
                            BigDecimal vatPerUnit, BigDecimal supplyAmount,
                            BigDecimal vatAmount, BigDecimal totalAmount) {
    }
}
