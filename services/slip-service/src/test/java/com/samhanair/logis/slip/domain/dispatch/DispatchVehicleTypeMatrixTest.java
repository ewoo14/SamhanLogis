package com.samhanair.logis.slip.domain.dispatch;

import static org.assertj.core.api.Assertions.assertThat;

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
    void small_body_types_do_not_require_tonnage_and_trucks_have_all_tonnages() {
        assertThat(DispatchVehicleTypeMatrix.allowedTonnages(DispatchVehicleBodyType.MOTORCYCLE))
                .isEmpty();
        assertThat(DispatchVehicleTypeMatrix.allowedTonnages(DispatchVehicleBodyType.SEDAN))
                .isEmpty();
        assertThat(DispatchVehicleTypeMatrix.allowedTonnages(DispatchVehicleBodyType.DAMAS))
                .isEmpty();
        assertThat(DispatchVehicleTypeMatrix.allowedTonnages(DispatchVehicleBodyType.LABO))
                .isEmpty();

        assertThat(DispatchVehicleTypeMatrix.allowedTonnages(DispatchVehicleBodyType.CARGO))
                .containsExactly(DispatchTonnage.values());
        assertThat(DispatchVehicleTypeMatrix.allowedTonnages(DispatchVehicleBodyType.TRAILER))
                .containsExactly(DispatchTonnage.values());
    }
}
