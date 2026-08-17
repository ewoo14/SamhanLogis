package com.samhanair.logis.common.financial;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * VAT 포함 단가 기준의 일마감 금액 계약.
 *
 * <p>단가를 먼저 원 단위 HALF_UP 반올림하고, 그 단가에서 공급가액·부가세를
 * 분리한 뒤 수량을 곱한다. 라인 합계를 먼저 분리하면 수량 2 이상에서 화면과
 * 저장 후 재조회 값이 달라질 수 있으므로 이 클래스 외의 순서를 사용하지 않는다.
 */
public final class VatInclusiveUnitAmountCalculator {

    private static final BigDecimal VAT_DENOMINATOR = new BigDecimal("1.1");

    private VatInclusiveUnitAmountCalculator() {
    }

    public static Breakdown calculate(BigDecimal unitPriceWithVat, int quantity) {
        if (unitPriceWithVat == null || unitPriceWithVat.signum() < 0) {
            throw new IllegalArgumentException("VAT 포함 단가는 0 이상이어야 합니다");
        }
        if (quantity <= 0) {
            throw new IllegalArgumentException("수량은 양수여야 합니다");
        }
        BigDecimal unit = unitPriceWithVat.setScale(0, RoundingMode.HALF_UP);
        BigDecimal supplyPerUnit = unit.divide(VAT_DENOMINATOR, 0, RoundingMode.HALF_UP);
        BigDecimal vatPerUnit = unit.subtract(supplyPerUnit);
        return new Breakdown(unit, supplyPerUnit, vatPerUnit,
                supplyPerUnit.multiply(BigDecimal.valueOf(quantity)),
                vatPerUnit.multiply(BigDecimal.valueOf(quantity)),
                unit.multiply(BigDecimal.valueOf(quantity)));
    }

    public record Breakdown(BigDecimal unitPriceWithVat, BigDecimal supplyPerUnit,
                            BigDecimal vatPerUnit, BigDecimal supplyAmount,
                            BigDecimal vatAmount, BigDecimal totalAmount) {
    }
}
