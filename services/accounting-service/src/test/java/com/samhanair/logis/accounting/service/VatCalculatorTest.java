package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class VatCalculatorTest {

    @Test
    void taxable_단가_150000_qty_10_VAT포함_분리정확() {
        // qty * unitPrice = 1,500,000 (VAT-inclusive)
        // supply = floor(1,500,000 * 100 / 110) = 1,363,636
        // vat   = 1,500,000 - 1,363,636 = 136,364
        VatCalculator.Result r = VatCalculator.split(
                new BigDecimal("10"), new BigDecimal("150000"), SalesTaxType.TAXABLE);

        assertThat(r.supplyAmount()).isEqualByComparingTo("1363636");
        assertThat(r.vatAmount()).isEqualByComparingTo("136364");
        assertThat(r.lineTotal()).isEqualByComparingTo("1500000");
    }

    @Test
    void zero_rated_VAT_0_supply_전체() {
        VatCalculator.Result r = VatCalculator.split(
                new BigDecimal("5"), new BigDecimal("100000"), SalesTaxType.ZERO_RATED);

        assertThat(r.supplyAmount()).isEqualByComparingTo("500000");
        assertThat(r.vatAmount()).isEqualByComparingTo("0");
        assertThat(r.lineTotal()).isEqualByComparingTo("500000");
    }

    @Test
    void exempt_면세_VAT_0_supply_전체() {
        VatCalculator.Result r = VatCalculator.split(
                new BigDecimal("3"), new BigDecimal("200000"), SalesTaxType.EXEMPT);

        assertThat(r.supplyAmount()).isEqualByComparingTo("600000");
        assertThat(r.vatAmount()).isEqualByComparingTo("0");
        assertThat(r.lineTotal()).isEqualByComparingTo("600000");
    }

    @Test
    void floor_round_정확성_소수_단가() {
        // unit 1100 × qty 1 = 1100, supply = floor(1100 * 100 / 110) = 1000, vat = 100
        VatCalculator.Result r = VatCalculator.split(
                new BigDecimal("1"), new BigDecimal("1100"), SalesTaxType.TAXABLE);

        assertThat(r.supplyAmount()).isEqualByComparingTo("1000");
        assertThat(r.vatAmount()).isEqualByComparingTo("100");
    }

    @Test
    void roundTrip_slipLineSnapshot_VatCalculator_lineTotal_정확() {
        BigDecimal qty = new BigDecimal("10");
        BigDecimal unitPriceWithVat = new BigDecimal("150000");
        BigDecimal slipServiceLineTotal = qty.multiply(unitPriceWithVat);

        VatCalculator.Result r = VatCalculator.split(qty, unitPriceWithVat, SalesTaxType.TAXABLE);

        assertThat(r.lineTotal()).isEqualByComparingTo(slipServiceLineTotal);
        assertThat(r.supplyAmount().add(r.vatAmount())).isEqualByComparingTo(slipServiceLineTotal);
    }
}
