package com.samhanair.logis.notification.client;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/** 출고전표 endpoint 부재를 빈 목록으로 숨기지 않는 계약 테스트. */
class NoopSlipServiceClientTest {

    @Test
    void missingOutboundEndpoint_isVisibleAsFailure() {
        NoopSlipServiceClient client = new NoopSlipServiceClient();

        assertThatThrownBy(() -> client.getOutboundSlips(
                LocalDate.of(2026, 6, 8), LocalDate.of(2026, 6, 8)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("/internal/slips/outbound");
    }
}
