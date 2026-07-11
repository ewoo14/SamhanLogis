package com.samhanair.logis.slip.domain.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * {@link DispatchVehicleGroup} + {@link DispatchVehicleGroupSlip} 단위 검증.
 */
class DispatchVehicleGroupTest {

    @Test
    void create_group_ok() {
        UUID taskId = UUID.randomUUID();
        DispatchVehicleGroup g = DispatchVehicleGroup.create(taskId, 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
        assertThat(g.getDispatchTaskId()).isEqualTo(taskId);
        assertThat(g.getSequence()).isEqualTo(1);
        assertThat(g.getVehicleBodyType()).isEqualTo(DispatchVehicleBodyType.CARGO);
        assertThat(g.getTonnage()).isEqualTo(DispatchTonnage.T_1);
        assertThat(g.getVehicleType()).isEqualTo(DispatchVehicleType.TONNAGE_1);
    }

    @Test
    void create_group_derives_legacy_vehicle_type_lossy_for_arologis_wire() {
        assertThat(DispatchVehicleGroup.deriveLegacyVehicleType(DispatchVehicleBodyType.SEDAN, null))
                .isEqualTo(DispatchVehicleType.DAMAS);
        assertThat(DispatchVehicleGroup.deriveLegacyVehicleType(DispatchVehicleBodyType.WINGBODY, DispatchTonnage.T_1_4))
                .isEqualTo(DispatchVehicleType.TONNAGE_1_5);
        assertThat(DispatchVehicleGroup.deriveLegacyVehicleType(DispatchVehicleBodyType.TRAILER, DispatchTonnage.T_25))
                .isEqualTo(DispatchVehicleType.TONNAGE_20);
    }

    @Test
    void derive_legacy_vehicle_type_rejects_null_body_type() {
        assertThatThrownBy(() -> DispatchVehicleGroup.deriveLegacyVehicleType(null, null))
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("bodyType 필수");
    }

    @Test
    void create_group_validates_matrix() {
        assertThatThrownBy(() -> DispatchVehicleGroup.create(UUID.randomUUID(), 1,
                DispatchVehicleBodyType.CARGO, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("톤수 선택이 필요");

        assertThatThrownBy(() -> DispatchVehicleGroup.create(UUID.randomUUID(), 1,
                DispatchVehicleBodyType.MOTORCYCLE, DispatchTonnage.T_1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("톤수 선택이 불필요");

        assertThatThrownBy(() -> DispatchVehicleGroup.create(UUID.randomUUID(), 1,
                DispatchVehicleBodyType.TRAILER, DispatchTonnage.T_11))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("선택할 수 없는 차종");

        assertThatThrownBy(() -> DispatchVehicleGroup.create(UUID.randomUUID(), 1,
                DispatchVehicleBodyType.CARGO, DispatchTonnage.T_25))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("선택할 수 없는 톤수");
    }

    @Test
    void create_group_zero_sequence_throws() {
        assertThatThrownBy(() -> DispatchVehicleGroup.create(UUID.randomUUID(), 0,
                DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void resetToPending_rejects_non_dispatched_group() {
        // #725 — 과거 IllegalStateException(500 마스킹) → BusinessException(CONFLICT, 409) 승격.
        DispatchVehicleGroup g = DispatchVehicleGroup.create(
                UUID.randomUUID(), 1, DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);

        assertThatThrownBy(g::resetToPending)
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT))
                .hasMessageContaining("발송완료")
                .hasMessageNotContaining("DISPATCHED")
                .hasMessageNotContaining("PENDING");
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
