package com.samhanair.logis.slip.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.time.LocalDate;
import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** {@link SlipResponse} 매핑 단위 테스트. */
class SlipResponseTest {

    private static final Pattern UUID_PATTERN = Pattern.compile(
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}");

    @Test
    void from_existingLegacyRowWithRequesterUuid_doesNotUseItAsSalesPersonName() throws Exception {
        UUID requesterId = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");
        // 기존 DB 행의 레거시 shape: requester_id가 표시명이 아닌 UUID 문자열로 남아 있다.
        Slip slip = Slip.createOutbound("2026/08/13-legacy", LocalDate.of(2026, 8, 13), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "기존 전표",
                DeliveryTag.SALE, null, requesterId.toString());

        SlipResponse response = SlipResponse.from(slip);
        String body = new ObjectMapper().findAndRegisterModules().writeValueAsString(response);
        String listUrl = "/slips?status=COMPLETED&page=0&size=20";
        String wire = listUrl + body;

        assertThat(response.salesPersonName()).isNull();
        assertThat(body).doesNotContain(requesterId.toString());
        assertThat(UUID_PATTERN.matcher(body).find()).isFalse();
        assertThat(listUrl).doesNotContain(requesterId.toString());
        assertThat(UUID_PATTERN.matcher(wire).find()).isFalse();
    }

    @Test
    void from_목록금액은_legacyNull_라인도_VAT포함_상세합계와_같아야한다() {
        Slip slip = Slip.createOutbound("2026/05/20-1", LocalDate.of(2026, 5, 20), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "P-2026-0001",
                DeliveryTag.SALE, null, "sales-1");
        SlipLine line = SlipLine.createFromAuthoritativeAmounts(slip, UUID.randomUUID(), "품목",
                "모델", null, 1, new java.math.BigDecimal("2284500"),
                new java.math.BigDecimal("2076816"), new java.math.BigDecimal("207684"),
                new java.math.BigDecimal("2284500"), null, null);
        // 실 DB의 대부분을 차지하는 V59 이전 legacy 행을 재현한다.
        ReflectionTestUtils.setField(line, "unitPriceDomain", null);
        slip.addLine(line);

        SlipResponse response = SlipResponse.from(slip);

        // RED 원문: 수정 전 2,076,816 — 상세의 공급가액+부가세 2,284,500과 불일치.
        assertThat(response.totalAmount()).isEqualByComparingTo("2076816");
        assertThat(response.displayTotalAmount()).isEqualByComparingTo("2284500");
    }

    @Test
    void searchResult_목록금액도_상세와_같은_VAT포함_합계다() {
        Slip slip = Slip.createOutbound("2026/05/20-1", LocalDate.of(2026, 5, 20), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "P-2026-0001",
                DeliveryTag.SALE, null, "sales-1");
        slip.addLine(SlipLine.createFromAuthoritativeAmounts(slip, UUID.randomUUID(), "품목",
                "모델", null, 1, new java.math.BigDecimal("2284500"),
                new java.math.BigDecimal("2076816"), new java.math.BigDecimal("207684"),
                new java.math.BigDecimal("2284500"), null, null));

        assertThat(SlipSearchResult.from(slip).totalAmount()).isEqualByComparingTo("2076816");
        assertThat(SlipSearchResult.from(slip).displayTotalAmount()).isEqualByComparingTo("2284500");
    }

    @Test
    void from_여러라인_소계도_각라인의_VAT포함금액을_합산한다() {
        Slip slip = Slip.createOutbound("2026/05/20-2", LocalDate.of(2026, 5, 20), 2,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "P-2026-0001",
                DeliveryTag.SALE, null, "sales-1");
        slip.addLine(SlipLine.createFromAuthoritativeAmounts(slip, UUID.randomUUID(), "품목1",
                "모델1", null, 1, new java.math.BigDecimal("110"),
                new java.math.BigDecimal("100"), new java.math.BigDecimal("10"),
                new java.math.BigDecimal("110"), null, null));
        SlipLine legacy = SlipLine.createFromAuthoritativeAmounts(slip, UUID.randomUUID(), "품목2",
                "모델2", null, 1, new java.math.BigDecimal("220"),
                new java.math.BigDecimal("200"), new java.math.BigDecimal("20"),
                new java.math.BigDecimal("220"), null, null);
        ReflectionTestUtils.setField(legacy, "unitPriceDomain", null);
        slip.addLine(legacy);

        assertThat(SlipResponse.from(slip).totalAmount()).isEqualByComparingTo("300");
        assertThat(SlipResponse.from(slip).displayTotalAmount()).isEqualByComparingTo("330");
    }

    @Test
    void displayTotalAmount_legacy공급가액Null이면_단가乘수량을_재계산하지_않는다() {
        Slip slip = Slip.createOutbound("2026/05/20-3", LocalDate.of(2026, 5, 20), 3,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "P-2026-0001",
                DeliveryTag.SALE, null, "sales-1");
        SlipLine legacy = SlipLine.createFromAuthoritativeAmounts(slip, UUID.randomUUID(), "품목",
                "모델", null, 1, new java.math.BigDecimal("200"),
                new java.math.BigDecimal("20"), new java.math.BigDecimal("220"), null, null);
        ReflectionTestUtils.setField(legacy, "supplyAmount", null);
        ReflectionTestUtils.setField(legacy, "unitPriceWithVat", new java.math.BigDecimal("999"));
        slip.addLine(legacy);

        assertThat(SlipResponse.from(slip).displayTotalAmount()).isEqualByComparingTo("220");
    }

    @Test
    void summary_2026년5월20일전표의_legacyNull라인은_저장lineTotal을_사용한다() {
        Slip slip = Slip.createOutbound("2026/05/20-1", LocalDate.of(2026, 5, 20), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "P-2026-0001",
                DeliveryTag.SALE, null, "sales-1");
        SlipLine legacy = SlipLine.createFromAuthoritativeAmounts(slip, UUID.randomUUID(), "품목",
                "모델", null, 1, new java.math.BigDecimal("2076816"),
                new java.math.BigDecimal("207684"), new java.math.BigDecimal("2284500"), null, null);
        ReflectionTestUtils.setField(legacy, "supplyAmount", null);
        ReflectionTestUtils.setField(legacy, "vatAmount", null);
        ReflectionTestUtils.setField(legacy, "unitPriceWithVat", new java.math.BigDecimal("9999999"));
        slip.addLine(legacy);

        assertThat(SlipSummary.of(slip).lines().get(0).lineTotal()).isEqualByComparingTo("2076816");
    }

    @Test
    void from_usesStateDependentEditHistoryCount_notRawRevisionCount() {
        Slip slip = Slip.createOutbound("2026/06/30-1", LocalDate.of(2026, 6, 30), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "S2c거래처",
                DeliveryTag.SALE, null, "sales-1");
        slip.incrementRevision();
        slip.incrementRevision();

        SlipResponse response = SlipResponse.from(slip);

        assertThat(slip.getRevisionCount()).isEqualTo(2);
        assertThat(slip.editHistoryCount()).isZero();
        assertThat(response.editHistoryCount()).isZero();
    }
}
