package com.samhanair.logis.arologis.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * {@link VehicleTonnage} 확장 후 fromRaw 매핑 검증 — BE Task B12.
 */
class VehicleTonnageTest {

    @Test
    void enum_now_has_11_values() {
        assertThat(VehicleTonnage.values()).hasSize(11);
    }

    @Test
    void fromRaw_active_9_values() {
        assertThat(VehicleTonnage.fromRaw("오토바이")).isEqualTo(VehicleTonnage.MOTORCYCLE);
        assertThat(VehicleTonnage.fromRaw("다마스")).isEqualTo(VehicleTonnage.DAMAS);
        assertThat(VehicleTonnage.fromRaw("1")).isEqualTo(VehicleTonnage.TONNAGE_1);
        assertThat(VehicleTonnage.fromRaw("1.5")).isEqualTo(VehicleTonnage.TONNAGE_1_5);
        assertThat(VehicleTonnage.fromRaw("2.5")).isEqualTo(VehicleTonnage.TONNAGE_2_5);
        assertThat(VehicleTonnage.fromRaw("3")).isEqualTo(VehicleTonnage.TONNAGE_3);
        assertThat(VehicleTonnage.fromRaw("5")).isEqualTo(VehicleTonnage.TONNAGE_5);
        assertThat(VehicleTonnage.fromRaw("10")).isEqualTo(VehicleTonnage.TONNAGE_10);
        assertThat(VehicleTonnage.fromRaw("20")).isEqualTo(VehicleTonnage.TONNAGE_20);
    }

    @Test
    void fromRaw_legacy_2_values_kakao_compat() {
        // legacy 카톡 파싱 호환
        assertThat(VehicleTonnage.fromRaw("1.4")).isEqualTo(VehicleTonnage.TONNAGE_1_4);
        assertThat(VehicleTonnage.fromRaw("11")).isEqualTo(VehicleTonnage.TONNAGE_BIG);
        assertThat(VehicleTonnage.fromRaw("25")).isEqualTo(VehicleTonnage.TONNAGE_BIG);
    }

    @Test
    void fromRaw_unknown_falls_back_to_TONNAGE_1() {
        assertThat(VehicleTonnage.fromRaw("X")).isEqualTo(VehicleTonnage.TONNAGE_1);
        assertThat(VehicleTonnage.fromRaw(null)).isEqualTo(VehicleTonnage.TONNAGE_1);
    }
}
