package com.samhanair.logis.common.financial;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * VAT 포함 단가 기준의 일마감 금액 계약.
 *
 * <p>레거시 거래처 발송 주문서·종합견적서와 동일하게 VAT 포함 단가를 먼저 원 단위로
 * 정규화한 총액을 먼저 수량만큼 합산한다. 그 총액에서 공급가액을
 * {@code Math.round(total / 1.1)}로 분리하고, VAT는 총액과 공급가액의 차액으로 얻는다.
 * 레거시 거래처 발송 주문서·종합견적서와 동일한 총액축 반올림 계약이다.
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
        BigDecimal total = unit.multiply(quantityValue).setScale(0, RoundingMode.HALF_UP);
        BigDecimal supply = total.divide(new BigDecimal("1.1"), 0, RoundingMode.HALF_UP);
        BigDecimal vat = total.subtract(supply);
        BigDecimal supplyPerUnit = supply.divide(quantityValue, 2, RoundingMode.HALF_UP);
        BigDecimal vatPerUnit = vat.divide(quantityValue, 2, RoundingMode.HALF_UP);
        return new Breakdown(unit, supplyPerUnit, vatPerUnit, supply, vat, total);
    }

    public record Breakdown(BigDecimal unitPriceWithVat, BigDecimal supplyPerUnit,
                            BigDecimal vatPerUnit, BigDecimal supplyAmount,
                            BigDecimal vatAmount, BigDecimal totalAmount) {
    }
}
