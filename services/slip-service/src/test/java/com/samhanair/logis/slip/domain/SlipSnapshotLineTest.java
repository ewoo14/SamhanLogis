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
    }
}
