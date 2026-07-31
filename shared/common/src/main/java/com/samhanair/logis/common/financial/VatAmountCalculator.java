package com.samhanair.logis.common.financial;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 공급가액 기준 부가가치세 계산의 단일 규칙.
 *
 * <p>부가가치세법 제29조의 과세표준과 국세청 유권해석의 공급가액 10% 원칙을
 * 공통화한다. 공급가액에서 부가세를 파생하는 {@link #fromSupply(BigDecimal)}는 기존
 * 단수조정 정책인 0 방향 절사(DOWN)를 보존하고, VAT 포함 합계에서 공급가액을 역산하는
 * {@link #splitVatInclusive(BigDecimal)}는 견적 원천과 같은 원 단위 반올림(HALF_UP)을 사용한다.
 * 법령이 특정 반올림 모드를 의무화한다고 해석하지 않으며, 발행 완료 자료를 다시 계산하지 않는다.
 */
public final class VatAmountCalculator {

    /** 부가가치세율 10%. */
    public static final BigDecimal VAT_RATE = new BigDecimal("0.10");
    private static final BigDecimal VAT_DENOMINATOR = new BigDecimal("1.10");

    private VatAmountCalculator() {
    }

    /** 공급가액의 10%를 원 단위로 0 방향 절사한다. */
    public static BigDecimal fromSupply(BigDecimal supplyAmount) {
        if (supplyAmount == null) {
            throw new IllegalArgumentException("공급가액은 필수입니다");
        }
        return supplyAmount.multiply(VAT_RATE).setScale(0, RoundingMode.DOWN);
    }

    /**
     * VAT 포함 합계에서 공급가액과 부가세를 원 단위 반올림으로 분리한다.
     * 견적 원천의 {@code Math.round(합계 / 1.1)}와 발행 전표의 구성 금액을 일치시킨다.
     */
    public static Split splitVatInclusive(BigDecimal lineTotal) {
        if (lineTotal == null || lineTotal.signum() < 0) {
            throw new IllegalArgumentException("VAT 포함 합계는 0 이상 필수입니다");
        }
        BigDecimal supply = lineTotal.divide(VAT_DENOMINATOR, 0, RoundingMode.HALF_UP);
        return new Split(supply, lineTotal.subtract(supply), lineTotal);
    }

    /** 공급가액·부가세·VAT 포함 합계. */
    public record Split(BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal lineTotal) {
    }
}
