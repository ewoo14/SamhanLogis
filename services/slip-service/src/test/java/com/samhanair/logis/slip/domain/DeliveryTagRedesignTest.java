package com.samhanair.logis.slip.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class DeliveryTagRedesignTest {

    @Test
    void inbound_hasExactlySevenTagsWithRentalReturnAndReentry() {
        assertThat(Arrays.stream(DeliveryTag.values())
                .filter(tag -> tag.getDirection() == SlipType.INBOUND)
                .map(Enum::name)
                .collect(Collectors.toSet()))
                .containsExactlyInAnyOrder(
                        "PURCHASE", "BORROW", "RENTAL_RETURN", "RETURN",
                        "DELIVERY_RETURN", "RETURN_TRIP", "REENTRY");
    }

    @Test
    void outbound_hasExactlyElevenTagsWithSaleAndBorrowReturn() {
        assertThat(Arrays.stream(DeliveryTag.values())
                .filter(tag -> tag.getDirection() == SlipType.OUTBOUND)
                .map(Enum::name)
                .collect(Collectors.toSet()))
                .containsExactlyInAnyOrder(
                        "SALE", "RENTAL", "BORROW_RETURN", "DEFECT_RETURN",
                        "DIRECT_DELIVERY", "PREEMPTIVE_ACTION", "LOGEN",
                        "GYEONGDONG_PARCEL", "GYEONGDONG_FREIGHT", "STACK", "REGION");
    }

    @Test
    void outbound_withoutDeliveryTag_defaultsToSale() {
        Slip slip = Slip.createOutbound(
                "2026/08/14-1", LocalDate.of(2026, 8, 14), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "거래처",
                null, null, "user-1");

        assertThat(slip.getDeliveryTag()).isEqualTo(DeliveryTag.valueOf("SALE"));
    }

    @Test
    void unloadMemoIsEnabledOnlyForStackAndRegion() {
        assertThat(DeliveryTag.STACK.isAutoMemo()).isTrue();
        assertThat(DeliveryTag.REGION.isAutoMemo()).isTrue();
        assertThat(Arrays.stream(DeliveryTag.values())
                .filter(tag -> tag != DeliveryTag.STACK && tag != DeliveryTag.REGION)
                .allMatch(tag -> !tag.isAutoMemo()))
                .isTrue();
    }
}
