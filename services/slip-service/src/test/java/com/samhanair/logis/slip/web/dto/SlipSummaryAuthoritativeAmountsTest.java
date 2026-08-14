package com.samhanair.logis.slip.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("전표 요약의 권위 합계")
class SlipSummaryAuthoritativeAmountsTest {

    @Test
    @DisplayName("파생 단가×수량 drift가 아닌 저장된 공급가액+부가세를 사용한다")
    void usesStoredLineAmounts() {
        Slip slip = Slip.createOutbound("2026/07/22-1", LocalDate.of(2026, 7, 22), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "거래처",
                DeliveryTag.SALE, null, "test-user");
        slip.addLine(SlipLine.createFromVatInclusive(slip, UUID.randomUUID(), "품목", "모델", null,
                3, new BigDecimal("36668.6667"), null, null));

        SlipSummary summary = SlipSummary.of(slip);

        assertThat(summary.lines().get(0).lineTotal()).isEqualByComparingTo("110006");
    }
}
