package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.SalesTaxType;
import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * VAT-inclusive 단가 → 공급가액 + 부가세 분리 (한국 회계 관례, RoundingMode.FLOOR).
 *
 * <p>출고/입고전표 단가는 VAT-inclusive. 매출/매입전표 line 변환 시 본 calculator 호출.
 *
 * <p>공식:
 * <ul>
 *   <li>TAXABLE: supply = floor(qty × unitPrice × 100 / 110), vat = lineTotal - supply</li>
 *   <li>ZERO_RATED / EXEMPT: supply = lineTotal, vat = 0</li>
 * </ul>
 */
public final class VatCalculator {

    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final BigDecimal ONE_TEN = new BigDecimal("110");

    private VatCalculator() {}

    public record Result(BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal lineTotal) {}

    public static Result split(BigDecimal qty, BigDecimal unitPrice, SalesTaxType taxType) {
        BigDecimal lineTotal = qty.multiply(unitPrice);
        return switch (taxType) {
            case TAXABLE -> {
                BigDecimal supply = lineTotal.multiply(HUNDRED)
                                             .divide(ONE_TEN, 0, RoundingMode.FLOOR);
                BigDecimal vat = lineTotal.subtract(supply);
                yield new Result(supply, vat, lineTotal);
            }
            case ZERO_RATED, EXEMPT -> new Result(lineTotal, BigDecimal.ZERO, lineTotal);
        };
    }
}
