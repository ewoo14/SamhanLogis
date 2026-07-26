package com.samhanair.logis.slip.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 전표 라인 스냅샷의 VAT 포함 금액 캡처/legacy JSON 호환 테스트. */
class SlipSnapshotLineTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @Test
    @DisplayName("toSnapshot 은 라인의 VAT 포함 단가·부가세·공급가액을 캡처한다")
    void toSnapshotCapturesVatFields() {
        Slip slip = Slip.createOutbound("2026/06/30-1", LocalDate.of(2026, 6, 30), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "삼한물산",
                DeliveryTag.DAY, "memo", "user-1");
        slip.addLine(SlipLine.createFromVatInclusive(slip, UUID.randomUUID(), "펌프", "MX-100",
                "220V", 1, new BigDecimal("11000"), null, null));

        SlipSnapshot snap = slip.toSnapshot();
        SlipSnapshot.Line line = snap.lines().get(0);

        assertThat(line.unitPriceWithVat()).isEqualByComparingTo("11000");
        assertThat(line.vatAmount()).isEqualByComparingTo("1000");
        assertThat(line.supplyAmount()).isEqualByComparingTo("10000");
    }

    @Test
    @DisplayName("VAT 필드가 없는 과거 Line JSON 은 새 필드를 null 로 역직렬화한다")
    void legacyJsonWithoutVatFieldsDeserializesNull() throws Exception {
        String legacy = """
                {"productId":"%s","productName":"P","quantity":1,"unitPrice":10000,"lineTotal":10000}
                """.formatted(UUID.randomUUID());

        SlipSnapshot.Line line = objectMapper.readValue(legacy, SlipSnapshot.Line.class);

        assertThat(line.unitPriceWithVat()).isNull();
        assertThat(line.vatAmount()).isNull();
        assertThat(line.supplyAmount()).isNull();
        // 재수렴 6차(#937) — 도메인 키가 없는 구 JSONB 스냅샷은 null(legacy)로 안전히 떨어진다.
        assertThat(line.unitPriceDomain()).isNull();
    }

    @Test
    @DisplayName("재수렴 6차(#937) A안: toSnapshot 은 단가 권위 도메인을 캡처한다 "
            + "(버전이력·레드라인이 화면과 같은 정보를 읽으려면 스냅샷에도 실려야 한다)")
    void toSnapshotCapturesUnitPriceDomain() {
        Slip slip = Slip.createOutbound("2026/06/30-1", LocalDate.of(2026, 6, 30), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "삼한물산",
                DeliveryTag.DAY, "memo", "user-1");
        slip.addLine(SlipLine.createFromVatInclusive(slip, UUID.randomUUID(), "펌프", "MX-100",
                "220V", 1, new BigDecimal("11000"), null, null));
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "밸브", "VV-1",
                null, 1, new BigDecimal("10000"), null));

        SlipSnapshot snap = slip.toSnapshot();

        // RED(수정 전): 두 라인 모두 null — 스냅샷이 도메인을 담지 않아 감사 이력이
        // 화면과 다른 세금 도메인의 단가를 말했다(#937 ⑦).
        assertThat(snap.lines().get(0).unitPriceDomain()).isEqualTo("VAT_INCLUSIVE");
        assertThat(snap.lines().get(1).unitPriceDomain()).isEqualTo("SUPPLY");
    }

    @Test
    @DisplayName("재수렴 6차(#937): 단가 도메인은 JSON 왕복에서 보존되고 null 은 직렬화에서 생략된다")
    void unitPriceDomainSurvivesJsonRoundTrip() throws Exception {
        SlipSnapshot.Line withDomain = new SlipSnapshot.Line(UUID.randomUUID(), "P", null, null,
                2, new BigDecimal("100000"), new BigDecimal("200000"), null,
                new BigDecimal("100000"), new BigDecimal("20000"), new BigDecimal("200000"),
                null, null, "VAT_INCLUSIVE");

        String json = objectMapper.writeValueAsString(withDomain);
        assertThat(json).contains("\"unitPriceDomain\":\"VAT_INCLUSIVE\"");
        assertThat(objectMapper.readValue(json, SlipSnapshot.Line.class).unitPriceDomain())
                .isEqualTo("VAT_INCLUSIVE");

        SlipSnapshot.Line legacy = new SlipSnapshot.Line(UUID.randomUUID(), "P", null, null,
                1, new BigDecimal("1000"), new BigDecimal("1000"), null, null, null, null);
        assertThat(objectMapper.writeValueAsString(legacy)).doesNotContain("unitPriceDomain");
    }
}
