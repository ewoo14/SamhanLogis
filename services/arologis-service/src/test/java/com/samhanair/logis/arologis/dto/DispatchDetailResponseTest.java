package com.samhanair.logis.arologis.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class DispatchDetailResponseTest {

    @Test
    void from_maps_sandboxMode_and_vendorOrderId_without_exposing_vehicleId() {
        UUID dispatchId = UUID.fromString("10000000-0000-0000-0000-000000008041");
        UUID vehicleId = UUID.fromString("10000000-0000-0000-0000-000000008042");
        UUID driverId = UUID.fromString("10000000-0000-0000-0000-000000008043");
        Dispatch dispatch = Dispatch.of(LocalDate.of(2026, 7, 14), DispatchType.EXPRESS, "raw");
        ReflectionTestUtils.setField(dispatch, "id", dispatchId);

        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "상일+초월");
        ReflectionTestUtils.setField(vehicle, "id", vehicleId);
        vehicle.assignDriver(driverId, MatchSource.EXTERNAL_INSUNG_QUICK, "EXT-804");
        vehicle.updateVendorOrderId("INSUNG-ORDER-804");

        VehicleStop stop = VehicleStop.of(
                vehicleId,
                1,
                "-인천 남동구 구월동(에스엠하나공조-214)",
                "인천 남동구 구월동",
                "에스엠하나공조",
                214L,
                null,
                StopStatus.PENDING);

        DispatchDetailResponse response = DispatchDetailResponse.from(
                dispatch,
                List.of(vehicle),
                List.of(stop),
                Map.of(driverId.toString(), "INSUNG-001"),
                true);

        assertThat(response.dispatchId()).isEqualTo(dispatchId.toString());
        assertThat(response.sandboxMode()).isTrue();
        assertThat(response.vehicles()).hasSize(1);
        DispatchDetailResponse.VehicleDetail vehicleDetail = response.vehicles().get(0);
        assertThat(vehicleDetail.assignedDriverCode()).isEqualTo("INSUNG-001");
        assertThat(vehicleDetail.externalRefId()).isEqualTo("EXT-804");
        assertThat(vehicleDetail.vendorOrderId()).isEqualTo("INSUNG-ORDER-804");
        assertThat(vehicleDetail.stops()).hasSize(1);
    }

    @Test
    void from_passes_sandboxMode_false_through() {
        // sandboxMode 가 하드코딩(항상 true) 이 아니라 인자로 전달됨을 증명 —
        // false 를 넣으면 응답도 false 여야 한다(컨트롤러는 config 값을 전달).
        Dispatch dispatch = Dispatch.of(LocalDate.of(2026, 7, 14), DispatchType.DAY, "raw");
        ReflectionTestUtils.setField(dispatch, "id", UUID.fromString("10000000-0000-0000-0000-000000008044"));

        DispatchDetailResponse response = DispatchDetailResponse.from(
                dispatch, List.of(), List.of(), Map.of(), false);

        assertThat(response.sandboxMode()).isFalse();
    }
}
