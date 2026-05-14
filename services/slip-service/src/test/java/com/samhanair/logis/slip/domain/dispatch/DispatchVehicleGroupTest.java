package com.samhanair.logis.slip.domain.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * {@link DispatchVehicleGroup} + {@link DispatchVehicleGroupSlip} 단위 검증.
 */
class DispatchVehicleGroupTest {

    @Test
    void create_group_ok() {
        UUID taskId = UUID.randomUUID();
        DispatchVehicleGroup g = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleType.TONNAGE_1);
        assertThat(g.getDispatchTaskId()).isEqualTo(taskId);
        assertThat(g.getSequence()).isEqualTo(1);
        assertThat(g.getVehicleType()).isEqualTo(DispatchVehicleType.TONNAGE_1);
    }

    @Test
    void create_group_zero_sequence_throws() {
        assertThatThrownBy(() -> DispatchVehicleGroup.create(UUID.randomUUID(), 0, DispatchVehicleType.TONNAGE_1))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void create_slip_mapping_ok() {
        UUID groupId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        DispatchVehicleGroupSlip m = DispatchVehicleGroupSlip.create(groupId, slipId, 3);
        assertThat(m.getVehicleGroupId()).isEqualTo(groupId);
        assertThat(m.getSlipId()).isEqualTo(slipId);
        assertThat(m.getSequence()).isEqualTo(3);
    }

    @Test
    void slip_mapping_updateSequence_ok() {
        DispatchVehicleGroupSlip m = DispatchVehicleGroupSlip.create(UUID.randomUUID(), UUID.randomUUID(), 1);
        m.updateSequence(5);
        assertThat(m.getSequence()).isEqualTo(5);
    }
}
