package com.samhanair.logis.accounting.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.domain.TaxInvoiceBatch;
import com.samhanair.logis.accounting.domain.TaxInvoiceBatchExclusion;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class TaxInvoiceActorDisplayResponseTest {

    private static final UUID ACTOR_ID = UUID.fromString("cafebabe-cafe-babe-cafe-babecafebabe");

    @Test
    void history_response_hides_processed_actor_uuid_but_entity_keeps_it() {
        TaxInvoiceBatch batch = TaxInvoiceBatch.create(
                "TIB-202608-001", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 1), ACTOR_ID);

        TaxInvoiceBatchHistoryResponse response = TaxInvoiceBatchHistoryResponse.ofSummary(batch);

        assertThat(batch.getProcessedBy()).isEqualTo(ACTOR_ID);
        assertThat(response.processedBy()).isEqualTo("변경자 미상");
        assertThat(String.valueOf(response.processedBy())).doesNotContain(ACTOR_ID.toString());
    }

    @Test
    void exclusion_response_hides_created_by_uuid_but_preserves_known_name() {
        TaxInvoiceBatchExclusion exclusion = TaxInvoiceBatchExclusion.create(
                "P-001", "거래처", "테스트");
        ReflectionTestUtils.setField(exclusion, "createdBy", ACTOR_ID.toString());

        TaxInvoiceBatchExclusionResponse response = TaxInvoiceBatchExclusionResponse.of(exclusion);

        assertThat(response.createdBy()).isEqualTo("변경자 미상");

        ReflectionTestUtils.setField(exclusion, "createdBy", "김감사");
        assertThat(TaxInvoiceBatchExclusionResponse.of(exclusion).createdBy()).isEqualTo("김감사");
    }
}
