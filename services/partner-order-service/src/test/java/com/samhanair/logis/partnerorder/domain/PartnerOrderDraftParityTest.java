package com.samhanair.logis.partnerorder.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("주문서웹 임시저장 레거시 보존 정책")
class PartnerOrderDraftParityTest {

    @Test
    @DisplayName("레거시 snapshot은 자동 만료되지 않아 31일 뒤에도 조회 대상이다")
    void legacySnapshotIsNotExpiredAfterThirtyOneDays() {
        LocalDateTime createdAt = LocalDateTime.of(2026, 8, 16, 10, 0);
        PartnerOrderDraft draft = PartnerOrderDraft.create(
                "CUST-001", 1, "주문서 snapshot", "{\"items\":[]}", null);

        assertThat(draft.isExpired(createdAt.plusDays(31))).isFalse();
    }
}
