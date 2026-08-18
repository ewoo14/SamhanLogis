package com.samhanair.logis.slip.web.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class DailyClosingRowResponseTest {
    @Test
    void 저장된_출고가와_소수_할인율을_원본_상품가격보다_우선해_왕복한다() {
        Slip slip = mock(Slip.class);
        SlipLine line = mock(SlipLine.class);
        when(line.getQuantity()).thenReturn(2);
        when(line.getUnitPriceWithVat()).thenReturn(new BigDecimal("105"));
        when(line.getSupplyAmount()).thenReturn(new BigDecimal("190"));
        when(line.getVatAmount()).thenReturn(new BigDecimal("20"));
        when(line.getDailyClosingReleasePrice()).thenReturn(new BigDecimal("200"));
        when(line.getDailyClosingDiscountRate()).thenReturn(new BigDecimal("0.475"));
        when(slip.getSlipDate()).thenReturn(java.time.LocalDate.of(2026, 8, 14));
        when(slip.getStatus()).thenReturn(com.samhanair.logis.slip.domain.SlipStatus.CONFIRMED);
        when(slip.getPartnerName()).thenReturn("거래처");
        when(slip.getPartnerCode()).thenReturn("P");

        DailyClosingRowResponse row = DailyClosingRowResponse.from(slip, line,
                new DailyClosingRowResponse.SourceValues(new BigDecimal("520300"), null, null, null));

        assertThat(row.productPrice()).isEqualByComparingTo("200");
        assertThat(row.discountRate()).isEqualByComparingTo("47.5");
    }

    @Test
    void 견적품목_원천값을_일마감_상세로_전달한다() {
        Slip slip = mock(Slip.class);
        SlipLine line = mock(SlipLine.class);
        when(line.getQuantity()).thenReturn(1);
        when(line.getUnitPriceWithVat()).thenReturn(new BigDecimal("286165"));
        when(line.getSupplyAmount()).thenReturn(new BigDecimal("260150"));
        when(line.getVatAmount()).thenReturn(new BigDecimal("26015"));
        when(slip.getSlipDate()).thenReturn(java.time.LocalDate.of(2026, 8, 14));

        DailyClosingRowResponse row = DailyClosingRowResponse.from(slip, line,
                new DailyClosingRowResponse.SourceValues(new BigDecimal("520300"), null, null, null,
                        "COMMERCIAL_MULTI", new BigDecimal("286165"), null));

        assertThat(row.categoryKey()).isEqualTo("COMMERCIAL_MULTI");
        assertThat(row.deliveryPrice()).isEqualByComparingTo("286165");
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "0.5", "-1920.9680934076493", "1.01", "0.123456789"})
    void 할인율_소수_퍼센트_경계가_저장조회_왕복에서_변하지_않는다(String storedRate) {
        Slip slip = mock(Slip.class);
        SlipLine line = mock(SlipLine.class);
        BigDecimal fraction = new BigDecimal(storedRate);
        when(line.getQuantity()).thenReturn(3);
        when(line.getUnitPriceWithVat()).thenReturn(new BigDecimal("999999999"));
        when(line.getSupplyAmount()).thenReturn(new BigDecimal("2727272725"));
        when(line.getVatAmount()).thenReturn(new BigDecimal("272727272"));
        when(line.getDailyClosingReleasePrice()).thenReturn(new BigDecimal("101"));
        when(line.getDailyClosingDiscountRate()).thenReturn(fraction);
        when(slip.getSlipDate()).thenReturn(java.time.LocalDate.of(2026, 8, 14));
        when(slip.getStatus()).thenReturn(com.samhanair.logis.slip.domain.SlipStatus.CONFIRMED);

        DailyClosingRowResponse row = DailyClosingRowResponse.from(slip, line,
                new DailyClosingRowResponse.SourceValues(new BigDecimal("520300"), null, null, null));

        assertThat(row.discountRate()).isEqualByComparingTo(fraction.movePointRight(2));
    }
}
