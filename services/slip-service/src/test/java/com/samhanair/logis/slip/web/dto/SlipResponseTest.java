package com.samhanair.logis.slip.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** {@link SlipResponse} 매핑 단위 테스트. */
class SlipResponseTest {

    @Test
    void from_usesStateDependentEditHistoryCount_notRawRevisionCount() {
        Slip slip = Slip.createOutbound("2026/06/30-1", LocalDate.of(2026, 6, 30), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "S2c거래처",
                DeliveryTag.DAY, null, "sales-1");
        slip.incrementRevision();
        slip.incrementRevision();

        SlipResponse response = SlipResponse.from(slip);

        assertThat(slip.getRevisionCount()).isEqualTo(2);
        assertThat(slip.editHistoryCount()).isZero();
        assertThat(response.editHistoryCount()).isZero();
    }
}
