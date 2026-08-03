package com.samhanair.logis.slip.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("거래처별 원장 판매전표 응답")
class PartnerLedgerSalesResponseTest {

    @Test
    @DisplayName("전표 헤더·배송주소·품목 금액과 내부 partnerId를 매핑한다")
    void mapsLedgerFieldsWithInternalPartnerId() throws Exception {
        Slip slip = Slip.createOutbound(
                "2026/07/31-1001",
                LocalDate.of(2026, 7, 31),
                1001,
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "원장 거래처",
                null,
                null,
                "test-user");
        slip.setPartnerCode("P-1001");
        slip.withProjectInfo(null, "서울시 금천구 원장로 1", null, null, null, null);
        slip.save();
        slip.send();
        slip.accept("acceptor");
        slip.process();
        slip.complete();
        slip.inspect("inspector");

        SlipLine line = SlipLine.createFromVatInclusive(
                slip,
                UUID.randomUUID(),
                "원장 품목",
                "MODEL-1001",
                null,
                3,
                new BigDecimal("36668.6667"),
                null,
                null);
        slip.addLine(line);

        PartnerLedgerSalesResponse response = PartnerLedgerSalesResponse.from(slip);

        assertThat(response.slipNo()).isEqualTo("2026/07/31-1001");
        assertThat(response.slipDate()).isEqualTo(LocalDate.of(2026, 7, 31));
        assertThat(response.status()).isEqualTo("COMPLETED");
        assertThat(response.partnerCode()).isEqualTo("P-1001");
        assertThat(response.partnerName()).isEqualTo("원장 거래처");
        assertThat(response.deliveryAddress()).isEqualTo("서울시 금천구 원장로 1");
        assertThat(response.lines()).hasSize(1);
        assertThat(response.lines().get(0).productName()).isEqualTo("원장 품목");
        assertThat(response.lines().get(0).modelName()).isEqualTo("MODEL-1001");
        assertThat(response.lines().get(0).quantity()).isEqualTo(3);
        assertThat(response.lines().get(0).unitPriceWithVat()).isEqualByComparingTo("36668.67");
        assertThat(response.lines().get(0).lineAmount()).isEqualByComparingTo("110006");

        String json = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .writeValueAsString(response);
        assertThat(json).doesNotContain("slipId", "lineId");
        assertThat(response.partnerId()).isEqualTo(slip.getPartnerId());
    }
}
