package com.samhanair.logis.slip.dispatchgroup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.slip.domain.dispatchgroup.Carrier;
import com.samhanair.logis.slip.domain.dispatchgroup.DispatchGroup;
import com.samhanair.logis.slip.domain.dispatchgroup.DispatchGroupSlip;
import com.samhanair.logis.slip.domain.dispatchgroup.InclusionType;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DispatchGroupDomainTest {

    @Test
    void creates_group_without_carrier_and_accepts_both_inclusion_types() {
        DispatchGroup group = DispatchGroup.create("DG-20260804-001", LocalDate.of(2026, 8, 4), "2.5톤");

        assertThat(group.getCarrierId()).isNull();
        UUID groupId = UUID.randomUUID();
        assertThat(DispatchGroupSlip.create(groupId, UUID.randomUUID(), InclusionType.OUTBOUND, 1))
                .extracting(DispatchGroupSlip::getInclusionType)
                .isEqualTo(InclusionType.OUTBOUND);
        assertThat(DispatchGroupSlip.create(groupId, UUID.randomUUID(), InclusionType.INBOUND, 2))
                .extracting(DispatchGroupSlip::getInclusionType)
                .isEqualTo(InclusionType.INBOUND);
    }

    @Test
    void carrier_code_is_normalized_and_inactive_carrier_cannot_be_assigned() {
        Carrier carrier = Carrier.create("arologis", "아로로지스", true, null);
        DispatchGroup group = DispatchGroup.create("DG-20260804-002", LocalDate.of(2026, 8, 4), "1톤");

        group.assignCarrier(carrier);
        assertThat(carrier.getCode()).isEqualTo("AROLOGIS");
        assertThat(group.getCarrierId()).isEqualTo(carrier.getId());

        carrier.deactivate();
        assertThatThrownBy(() -> group.assignCarrier(carrier))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("비활성");
    }
}
