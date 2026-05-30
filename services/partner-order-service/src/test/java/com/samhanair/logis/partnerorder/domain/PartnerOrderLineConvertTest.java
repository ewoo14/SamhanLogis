package com.samhanair.logis.partnerorder.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

/**
 * Phase 2.6a PartnerOrderLine 부분전환 도메인 메서드 단위 테스트.
 *
 * <p>검증 케이스:
 * <ol>
 *   <li>초기 상태: convertedQuantity=0, remainingQuantity=전체</li>
 *   <li>부분전환 누적: convert 두 번 → 잔여 0, isFullyConverted=true</li>
 *   <li>잔여 초과 전환 → 409 ResponseStatusException</li>
 *   <li>비양수(0) 전환 → 409 ResponseStatusException</li>
 * </ol>
 */
class PartnerOrderLineConvertTest {

    private PartnerOrderLine line(int qty) {
        return PartnerOrderLine.create(UUID.randomUUID(), "MODEL-A", "상품명A", "homemulti",
                qty, BigDecimal.valueOf(1000), null);
    }

    /**
     * 케이스1: 초기 상태 — convertedQuantity=0, remainingQuantity=전체 수량.
     */
    @Test
    void remainingQuantity_default_isFull() {
        PartnerOrderLine l = line(10);
        assertThat(l.getConvertedQuantity()).isZero();
        assertThat(l.remainingQuantity()).isEqualTo(10);
    }

    /**
     * 케이스2: 부분전환 두 번 — 잔여 누적 차감, 전량 후 isFullyConverted=true.
     */
    @Test
    void convert_partial_accumulates() {
        PartnerOrderLine l = line(10);
        l.convert(3);
        assertThat(l.getConvertedQuantity()).isEqualTo(3);
        assertThat(l.remainingQuantity()).isEqualTo(7);
        l.convert(7);
        assertThat(l.remainingQuantity()).isZero();
        assertThat(l.isFullyConverted()).isTrue();
    }

    /**
     * 케이스3: 잔여 초과 전환 → 409 CONFLICT.
     */
    @Test
    void convert_overRemaining_throws409() {
        PartnerOrderLine l = line(5);
        assertThatThrownBy(() -> l.convert(6))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    /**
     * 케이스4: 비양수(0) 전환 → 409 CONFLICT.
     */
    @Test
    void convert_nonPositive_throws() {
        PartnerOrderLine l = line(5);
        assertThatThrownBy(() -> l.convert(0))
                .isInstanceOf(ResponseStatusException.class);
    }
}
