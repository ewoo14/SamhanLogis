package com.samhanair.logis.slip.web.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class SlipSalesQueryResponseTest {

    @Test
    void salesQueryPreservesFirstLineValuesAndPartnerEmail() {
        Slip slip = mock(Slip.class);
        SlipLine line = mock(SlipLine.class);
        when(slip.getLines()).thenReturn(List.of(line));
        when(line.getProductName()).thenReturn("에어컨");
        when(line.getModelName()).thenReturn("0000098");
        when(line.getSpecification()).thenReturn(null);
        when(line.getQuantity()).thenReturn(1);
        when(line.getUnitPrice()).thenReturn(new BigDecimal("949"));
        when(line.getNote()).thenReturn("현장 납품");
        when(line.getSupplyAmount()).thenReturn(new BigDecimal("949"));
        when(line.getVatAmount()).thenReturn(new BigDecimal("94"));
        when(line.getLineTotal()).thenReturn(new BigDecimal("949"));

        SlipSalesQueryResponse row = SlipSalesQueryResponse.from(slip, "buyer@test.com");

        assertThat(row.email()).isEqualTo("buyer@test.com");
        assertThat(row.itemSpec()).isEqualTo("0000098");
        assertThat(row.itemQty()).isEqualByComparingTo("1");
        assertThat(row.itemPrice()).isEqualByComparingTo("949");
        assertThat(row.itemRemark()).isEqualTo("현장 납품");
    }
}
