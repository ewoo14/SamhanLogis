package com.samhanair.logis.slip.domain.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * 배차 2축 차량 모델 enum + matrix 검증.
 */
class DispatchVehicleTypeMatrixTest {

    @Test
    void body_type_and_tonnage_have_spec_display_names() {
        assertThat(DispatchVehicleBodyType.values()).hasSize(12);
        assertThat(DispatchTonnage.values()).hasSize(10);

        assertThat(DispatchVehicleBodyType.WINGBODY.getDisplayName()).isEqualTo("윙바디");
        assertThat(DispatchVehicleBodyType.REEFER.getDisplayName()).isEqualTo("냉장냉동탑");
        assertThat(DispatchVehicleBodyType.TRAILER.getDisplayName()).isEqualTo("추레라");
        assertThat(DispatchTonnage.T_1_4.getDisplayName()).isEqualTo("1.4톤");
        assertThat(DispatchTonnage.T_25.getDisplayName()).isEqualTo("25톤");
    }

    @Test
    void active_body_types_and_active_tonnages_are_selection_subset() {
        assertThat(DispatchVehicleTypeMatrix.ALLOWED_TONNAGES.keySet())
                .containsExactlyInAnyOrder(
                        DispatchVehicleBodyType.MOTORCYCLE,
                        DispatchVehicleBodyType.DAMAS,
                        DispatchVehicleBodyType.LABO,
                        DispatchVehicleBodyType.CARGO,
                        DispatchVehicleBodyType.WINGBODY,
                        DispatchVehicleBodyType.TOPCAR,
                        DispatchVehicleBodyType.LIFT,
                        DispatchVehicleBodyType.REEFER,
                        DispatchVehicleBodyType.VIBRATION_FREE);

        assertThat(DispatchVehicleTypeMatrix.allowedTonnages(DispatchVehicleBodyType.MOTORCYCLE))
                .isEmpty();
        assertThat(DispatchVehicleTypeMatrix.allowedTonnages(DispatchVehicleBodyType.DAMAS))
                .isEmpty();
        assertThat(DispatchVehicleTypeMatrix.allowedTonnages(DispatchVehicleBodyType.LABO))
                .isEmpty();

        assertThat(DispatchVehicleTypeMatrix.allowedTonnages(DispatchVehicleBodyType.CARGO))
                .containsExactly(
                        DispatchTonnage.T_1,
                        DispatchTonnage.T_1_4,
                        DispatchTonnage.T_2_5,
                        DispatchTonnage.T_3_5,
                        DispatchTonnage.T_5,
                        DispatchTonnage.T_11);
    }

    @Test
    void validate_rejects_inactive_body_types_and_tonnages() {
        assertThatThrownBy(() -> DispatchVehicleTypeMatrix.validate(DispatchVehicleBodyType.SEDAN, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("선택할 수 없는 차종");

        assertThatThrownBy(() -> DispatchVehicleTypeMatrix.validate(DispatchVehicleBodyType.AXLE, DispatchTonnage.T_11))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("선택할 수 없는 차종");

        assertThatThrownBy(() -> DispatchVehicleTypeMatrix.validate(DispatchVehicleBodyType.CARGO, DispatchTonnage.T_14))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("선택할 수 없는 톤수");
    }
}
