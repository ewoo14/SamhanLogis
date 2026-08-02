package com.samhanair.logis.partnerorder.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.SlipPublishStatus;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** 주문 상세·목록 응답이 전표 발행 상태를 동일하게 보존하는지 검증한다. */
class PartnerOrderResponseTest {

    @Test
    void detailAndSummaryExposeSlipPublishStatusWithoutInternalIdentifiers() {
        PartnerOrder order = PartnerOrder.createFromConfirm(
                "P-854", "123-45-67890", "PO-854", "idem-854", BigDecimal.TEN);

        assertStatus(order, SlipPublishStatus.NOT_REQUIRED);

        order.markSlipPendingRetry();
        assertStatus(order, SlipPublishStatus.PENDING_RETRY);

        order.markSlipFailedPermanent();
        assertStatus(order, SlipPublishStatus.FAILED_PERMANENT);

        order.markSlipPublished("2026/07/20-854");
        assertStatus(order, SlipPublishStatus.PUBLISHED);
    }

    @Test
    void legacySummary_isMarkedIneligibleWithoutExposingUuid() {
        PartnerOrder legacy = PartnerOrder.createFromConfirm(
                "P-LEGACY", "123-45-67890", "PO-LEGACY", "idem-legacy", BigDecimal.TEN);

        PartnerOrderSummaryResponse summary = PartnerOrderSummaryResponse.from(legacy);

        assertThat(summary.mergeEligible()).isFalse();
        assertThat(summary.mergeIneligibilityReason())
                .contains("병합할 수 없습니다")
                .contains("단건 전표 발행");
        assertThat(summary.mergeIneligibilityReason()).doesNotContain(UUID.randomUUID().toString());
    }

    @Test
    void detail_preservesStructuredDeliveryAddress() {
        PartnerOrder order = PartnerOrder.createFromConfirm(
                "P-ADDRESS", "123-45-67890", "PO-ADDRESS", "idem-address", BigDecimal.TEN,
                "서울시 금천구 배송로 10");

        PartnerOrderDetailResponse detail = PartnerOrderDetailResponse.from(order);

        assertThat(order.getDeliveryAddress()).isEqualTo("서울시 금천구 배송로 10");
        assertThat(detail.deliveryAddress()).isEqualTo("서울시 금천구 배송로 10");
    }

    private void assertStatus(PartnerOrder order, SlipPublishStatus expected) {
        PartnerOrderDetailResponse detail = PartnerOrderDetailResponse.from(order);
        PartnerOrderSummaryResponse summary = PartnerOrderSummaryResponse.from(order);

        assertThat(detail.slipPublishStatus()).isEqualTo(expected.name());
        assertThat(summary.slipPublishStatus()).isEqualTo(expected.name());
        assertThat(detail).extracting(PartnerOrderDetailResponse::orderNumber)
                .isEqualTo(order.getOrderNo());
    }
}
