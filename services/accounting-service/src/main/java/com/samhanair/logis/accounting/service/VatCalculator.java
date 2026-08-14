package com.samhanair.logis.accounting.service;

import com.samhanair.logis.common.financial.VatAmountCalculator;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import java.math.BigDecimal;

/**
 * VAT-inclusive 단가 → 공급가액 + 부가세 분리 (공통 원 단위 절사 규칙).
 *
 * <p>출고/입고전표 단가는 VAT-inclusive. 매출/입고전표 line 변환 시 본 calculator 호출.
 *
 * <p>공식:
 * <ul>
 *   <li>TAXABLE: supply = 절사(qty × unitPrice ÷ 1.1), vat = lineTotal - supply</li>
 *   <li>ZERO_RATED / EXEMPT: supply = lineTotal, vat = 0</li>
 * </ul>
 */
public final class VatCalculator {

    private VatCalculator() {}

    public record Result(BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal lineTotal) {}

    public static Result split(BigDecimal qty, BigDecimal unitPrice, SalesTaxType taxType) {
        BigDecimal lineTotal = qty.multiply(unitPrice);
        return switch (taxType) {
            case TAXABLE -> {
                VatAmountCalculator.Split split = VatAmountCalculator.splitVatInclusive(lineTotal);
                yield new Result(split.supplyAmount(), split.vatAmount(), split.lineTotal());
            }
            case ZERO_RATED, EXEMPT -> new Result(lineTotal, BigDecimal.ZERO, lineTotal);
        };
    }
}
