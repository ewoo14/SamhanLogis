package com.samhanair.logis.partner.dto;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PartnerSummaryResponseTest {

    @Test
    @DisplayName("resolveActorName — UUID/blank 은 null 로 정제해 사용자 화면 노출을 막는다")
    void resolveActorName_hides_uuid_and_blank_values() {
        assertThat(PartnerSummaryResponse.resolveActorName(null)).isNull();
        assertThat(PartnerSummaryResponse.resolveActorName("   ")).isNull();
        assertThat(PartnerSummaryResponse.resolveActorName("550e8400-e29b-41d4-a716-446655440000")).isNull();
    }

    @Test
    @DisplayName("resolveActorName — 표시명은 trim 후 deleted_by_name 길이 100자로 제한한다")
    void resolveActorName_trims_and_truncates_to_deletedByName_column_length() {
        String longName = "  " + "가".repeat(120) + "  ";

        String resolved = PartnerSummaryResponse.resolveActorName(longName);

        assertThat(resolved).hasSize(100);
        assertThat(resolved).isEqualTo("가".repeat(100));
    }
}
