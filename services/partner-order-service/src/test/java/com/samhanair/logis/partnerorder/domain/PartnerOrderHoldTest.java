package com.samhanair.logis.partnerorder.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

/**
 * PartnerOrder 보류(ON_HOLD) 상태 전이 도메인 메서드 단위 테스트 (Phase 2.5).
 *
 * <p>검증 케이스:
 * <ol>
 *   <li>DRAFT → markOnHold() → ON_HOLD</li>
 *   <li>CONFIRMED → markOnHold() → 409 CONFLICT</li>
 *   <li>CONFIRMING → markOnHold() → 409 CONFLICT (Cycle 1 추가 — QA-2.5-02)</li>
 *   <li>ON_HOLD → releaseHold() → DRAFT</li>
 *   <li>DRAFT → releaseHold() → 409 CONFLICT</li>
 * </ol>
 */
class PartnerOrderHoldTest {

    /**
     * DRAFT 상태 주문을 생성한다 (createFromEstimate 실제 시그니처 — 8인자).
     *
     * @return status=DRAFT 인 PartnerOrder
     */
    private PartnerOrder draftOrder() {
        return PartnerOrder.createFromEstimate(
                "PT-001",
                "1234567890",
                "2026/05/31-1",
                "idem-1",
                BigDecimal.ZERO,
                UUID.randomUUID(),
                null,
                null);
    }

    /** DRAFT 주문에 markOnHold() 호출 시 status 가 ON_HOLD 로 전환된다. */
    @Test
    void markOnHold_fromDraft_setsOnHold() {
        PartnerOrder o = draftOrder();
        o.markOnHold();
        assertThat(o.getStatus()).isEqualTo(PartnerOrderStatus.ON_HOLD);
    }

    /** CONFIRMED 주문에 markOnHold() 호출 시 409 CONFLICT ResponseStatusException 이 발생한다. */
    @Test
    void markOnHold_fromConfirmed_throws409() {
        PartnerOrder o = draftOrder();
        ReflectionTestUtils.setField(o, "status", PartnerOrderStatus.CONFIRMED);
        assertThatThrownBy(o::markOnHold)
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409")
                .hasMessageContaining("완료")
                .hasMessageNotContaining("DRAFT")
                .hasMessageNotContaining("CONFIRMED");
    }

    /**
     * CONFIRMING(출고전표 전환 중) 주문에 markOnHold() 호출 시 409 CONFLICT.
     * 운영 중 race condition 시나리오 — transient 상태 보호 (Cycle 1, QA-2.5-02).
     */
    @Test
    void markOnHold_fromConfirming_throws409() {
        PartnerOrder o = draftOrder();
        ReflectionTestUtils.setField(o, "status", PartnerOrderStatus.CONFIRMING);
        assertThatThrownBy(o::markOnHold)
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    /** ON_HOLD 주문에 releaseHold() 호출 시 status 가 DRAFT 로 복귀한다. */
    @Test
    void releaseHold_fromOnHold_setsDraft() {
        PartnerOrder o = draftOrder();
        o.markOnHold();
        o.releaseHold();
        assertThat(o.getStatus()).isEqualTo(PartnerOrderStatus.DRAFT);
    }

    /** DRAFT 주문에 releaseHold() 호출 시 409 CONFLICT ResponseStatusException 이 발생한다. */
    @Test
    void releaseHold_fromDraft_throws409() {
        PartnerOrder o = draftOrder();
        assertThatThrownBy(o::releaseHold)
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }
}
