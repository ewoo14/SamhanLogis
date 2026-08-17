package com.samhanair.logis.common.financial;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * VAT 포함 단가 기준의 일마감 금액 계약.
 *
 * <p>레거시 거래처 발송 주문서·종합견적서와 동일하게 VAT 포함 단가를 먼저 원 단위로
 * 정규화하고, 개당 공급가액을 {@code Math.round(unit / 1.1)}로 분리한 뒤 수량을 곱한다.
 * 공급가액과 VAT는 반드시 같은 단가축에서 파생한다.
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
        BigDecimal quantityValue = BigDecimal.valueOf(quantity);
        BigDecimal supplyPerUnit = unit.divide(new BigDecimal("1.1"), 0, RoundingMode.HALF_UP);
        BigDecimal vatPerUnit = unit.subtract(supplyPerUnit);
        BigDecimal supply = supplyPerUnit.multiply(quantityValue);
        BigDecimal vat = vatPerUnit.multiply(quantityValue);
        BigDecimal total = unit.multiply(quantityValue).setScale(0, RoundingMode.HALF_UP);
        return new Breakdown(unit, supplyPerUnit, vatPerUnit, supply, vat, total);
    }

    public record Breakdown(BigDecimal unitPriceWithVat, BigDecimal supplyPerUnit,
                            BigDecimal vatPerUnit, BigDecimal supplyAmount,
                            BigDecimal vatAmount, BigDecimal totalAmount) {
    }
}
