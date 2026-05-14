package com.samhanair.logis.slip.domain.dispatch;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * {@link DispatchVehicleType} 의 한국어 displayName 검증.
 */
class DispatchVehicleTypeTest {

    @Test
    void all_nine_values_have_korean_display_name() {
        DispatchVehicleType[] values = DispatchVehicleType.values();
        assertThat(values).hasSize(9);
        for (DispatchVehicleType v : values) {
            assertThat(v.getDisplayName()).isNotBlank();
        }
    }

    @Test
    void display_name_mapping_matches_spec() {
        assertThat(DispatchVehicleType.MOTORCYCLE.getDisplayName()).isEqualTo("오토바이");
        assertThat(DispatchVehicleType.DAMAS.getDisplayName()).isEqualTo("다마스");
        assertThat(DispatchVehicleType.TONNAGE_1.getDisplayName()).isEqualTo("1톤");
        assertThat(DispatchVehicleType.TONNAGE_1_5.getDisplayName()).isEqualTo("1.5톤");
        assertThat(DispatchVehicleType.TONNAGE_2_5.getDisplayName()).isEqualTo("2.5톤");
        assertThat(DispatchVehicleType.TONNAGE_3.getDisplayName()).isEqualTo("3톤");
        assertThat(DispatchVehicleType.TONNAGE_5.getDisplayName()).isEqualTo("5톤");
        assertThat(DispatchVehicleType.TONNAGE_10.getDisplayName()).isEqualTo("10톤");
        assertThat(DispatchVehicleType.TONNAGE_20.getDisplayName()).isEqualTo("20톤");
    }
}
