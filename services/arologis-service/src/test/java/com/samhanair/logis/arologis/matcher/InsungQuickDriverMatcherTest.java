package com.samhanair.logis.arologis.matcher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.client.InsungQuickClient;
import com.samhanair.logis.arologis.client.dto.InsungDriverMatchResponse;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * InsungQuickDriverMatcher 단위 테스트 — Phase 10 W10-2 실 구현.
 *
 * <p>W10-1 placeholder ({@link UnsupportedOperationException}) 검증 → W10-2 실 구현 검증으로 교체.
 * 외부 client, repository 모두 mock 으로 격리.
 */
class InsungQuickDriverMatcherTest {

    private InsungQuickClient insungClient;
    private DriverRepository driverRepository;
    private VehicleRepository vehicleRepository;
    private InsungQuickDriverMatcher matcher;

    @BeforeEach
    void setUp() {
        insungClient = mock(InsungQuickClient.class);
        driverRepository = mock(DriverRepository.class);
        vehicleRepository = mock(VehicleRepository.class);
        matcher = new InsungQuickDriverMatcher(insungClient, driverRepository, vehicleRepository);
    }

    @Test
    @DisplayName("source enum = EXTERNAL_INSUNG_QUICK")
    void source_returns_insung_quick() {
        assertThat(matcher.source()).isEqualTo(MatchSource.EXTERNAL_INSUNG_QUICK);
    }

    @Test
    @DisplayName("vehicle null → empty 반환 (fail-soft)")
    void match_with_null_vehicle_returns_empty() {
        DriverMatchResult result = matcher.match(null, List.of());

        assertThat(result.driver()).isEmpty();
        assertThat(result.source()).isEqualTo(MatchSource.EXTERNAL_INSUNG_QUICK);
    }

    @Test
    @DisplayName("requestOrder null 응답 → empty 반환 (fail-soft)")
    void match_when_requestOrder_returns_null_returns_empty() {
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);
        when(insungClient.requestOrder(any(), anyList())).thenReturn(null);

        DriverMatchResult result = matcher.match(vehicle, List.of());

        assertThat(result.driver()).isEmpty();
        assertThat(result.source()).isEqualTo(MatchSource.EXTERNAL_INSUNG_QUICK);
    }

    @Test
    @DisplayName("requestMatch pending 응답 → empty 반환 (매칭 진행 중)")
    void match_when_requestMatch_returns_pending_returns_empty() {
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);
        when(insungClient.requestOrder(any(), anyList())).thenReturn("VENDOR-ORD-001");
        when(insungClient.requestMatch("VENDOR-ORD-001")).thenReturn(InsungDriverMatchResponse.pending());

        DriverMatchResult result = matcher.match(vehicle, List.of());

        assertThat(result.driver()).isEmpty();
        assertThat(result.externalRefId()).isNull();
        assertThat(vehicle.getVendorOrderId()).isEqualTo("VENDOR-ORD-001");
        verify(vehicleRepository).save(vehicle);
    }

    @Test
    @DisplayName("매칭 성공 → Driver upsert + 기사명/차량번호 저장 + DriverMatchResult.of() 반환")
    void match_success_upserts_driver_and_returns_result() {
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);
        String vendorOrderId = "VENDOR-ORD-123";
        InsungDriverMatchResponse matchResp = InsungDriverMatchResponse.matched(
                "DRV-999", "홍길동", "010-1234-5678", "1톤", "서울12바3456");

        when(insungClient.requestOrder(any(), anyList())).thenReturn(vendorOrderId);
        when(insungClient.requestMatch(vendorOrderId)).thenReturn(matchResp);
        when(driverRepository.findByDriverCode("INSUNG-DRV-999")).thenReturn(Optional.empty());

        when(driverRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        DriverMatchResult result = matcher.match(vehicle, List.of());

        assertThat(result.driver()).isPresent();
        assertThat(result.driver().get().getDriverCode()).isEqualTo("INSUNG-DRV-999");
        assertThat(result.driver().get().getDriverName()).isEqualTo("홍길동");
        assertThat(result.driver().get().getVehiclePlateNumber()).isEqualTo("서울12바3456");
        assertThat(result.source()).isEqualTo(MatchSource.EXTERNAL_INSUNG_QUICK);
        assertThat(result.externalRefId()).isEqualTo(vendorOrderId);
        assertThat(vehicle.getVendorOrderId()).isEqualTo(vendorOrderId);
        verify(vehicleRepository).save(vehicle);
        ArgumentCaptor<Driver> driverCaptor = ArgumentCaptor.forClass(Driver.class);
        verify(driverRepository).save(driverCaptor.capture());
        assertThat(driverCaptor.getValue().getDriverName()).isEqualTo("홍길동");
        assertThat(driverCaptor.getValue().getVehiclePlateNumber()).isEqualTo("서울12바3456");
    }

    @Test
    @DisplayName("매칭 성공 응답의 vendorDriverId 결손 → INSUNG-null 생성 없이 empty 반환")
    void match_success_without_vendorDriverId_returns_empty_without_driver_upsert() {
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);
        String vendorOrderId = "VENDOR-ORD-NO-DRIVER";
        InsungDriverMatchResponse matchResp = InsungDriverMatchResponse.matched(
                null, "홍길동", "010-1234-5678", "1톤", "서울12바3456");

        when(insungClient.requestOrder(any(), anyList())).thenReturn(vendorOrderId);
        when(insungClient.requestMatch(vendorOrderId)).thenReturn(matchResp);

        DriverMatchResult result = matcher.match(vehicle, List.of());

        assertThat(result.driver()).isEmpty();
        verify(driverRepository, never()).findByDriverCode(any());
        verify(driverRepository, never()).save(any());
    }

    @Test
    @DisplayName("vendorDriverId가 driverCode 50자를 넘기면 식별자 절단 없이 매칭을 skip")
    void match_success_with_too_long_vendorDriverId_returns_empty_without_driver_upsert() {
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);
        String vendorOrderId = "VENDOR-ORD-LONG-DRIVER";
        String vendorDriverId = "D".repeat(44);
        InsungDriverMatchResponse matchResp = InsungDriverMatchResponse.matched(
                vendorDriverId, "Long Driver", "010-1234-5678", "1T", "12A3456");

        when(insungClient.requestOrder(any(), anyList())).thenReturn(vendorOrderId);
        when(insungClient.requestMatch(vendorOrderId)).thenReturn(matchResp);

        DriverMatchResult result = matcher.match(vehicle, List.of());

        assertThat(result.driver()).isEmpty();
        verify(driverRepository, never()).findByDriverCode(any());
        verify(driverRepository, never()).save(any());
    }

    @Test
    @DisplayName("매칭 성공 응답의 기사 전화번호 결손 → 더미 없이 null 저장")
    void match_success_without_driverPhone_saves_null_phone() {
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);
        String vendorOrderId = "VENDOR-ORD-NO-PHONE";
        InsungDriverMatchResponse matchResp = InsungDriverMatchResponse.matched(
                "DRV-NO-PHONE", "홍길동", null, "1톤", "서울12바3456");

        when(insungClient.requestOrder(any(), anyList())).thenReturn(vendorOrderId);
        when(insungClient.requestMatch(vendorOrderId)).thenReturn(matchResp);
        when(driverRepository.findByDriverCode("INSUNG-DRV-NO-PHONE")).thenReturn(Optional.empty());
        when(driverRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        DriverMatchResult result = matcher.match(vehicle, List.of());

        assertThat(result.driver()).isPresent();
        assertThat(result.driver().get().getPhoneNumber()).isNull();
        ArgumentCaptor<Driver> driverCaptor = ArgumentCaptor.forClass(Driver.class);
        verify(driverRepository).save(driverCaptor.capture());
        assertThat(driverCaptor.getValue().getPhoneNumber()).isNull();
    }

    @Test
    @DisplayName("vendor profile 생성 시 phone/vehicleType 길이를 DB 컬럼 길이로 정규화")
    void match_success_normalizes_phone_and_vehicleType_lengths() {
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);
        String vendorOrderId = "VENDOR-ORD-LONG-FIELDS";
        InsungDriverMatchResponse matchResp = InsungDriverMatchResponse.matched(
                "DRV-LONG-FIELDS",
                "Driver",
                "010-1234-5678-EXTRA-LONG",
                "VEHICLE-TYPE-OVER-20-CHARS",
                "12A3456");

        when(insungClient.requestOrder(any(), anyList())).thenReturn(vendorOrderId);
        when(insungClient.requestMatch(vendorOrderId)).thenReturn(matchResp);
        when(driverRepository.findByDriverCode("INSUNG-DRV-LONG-FIELDS")).thenReturn(Optional.empty());
        when(driverRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        DriverMatchResult result = matcher.match(vehicle, List.of());

        assertThat(result.driver()).isPresent();
        assertThat(result.driver().get().getPhoneNumber()).hasSize(20);
        assertThat(result.driver().get().getVehicleType()).hasSize(20);
    }

    @Test
    @DisplayName("기존 Driver 존재 시 vendor 기사명/차량번호 갱신 후 반환")
    void match_success_updates_existing_driver_with_vendor_profile() {
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);
        String vendorOrderId = "VENDOR-ORD-456";
        InsungDriverMatchResponse matchResp = InsungDriverMatchResponse.matched(
                "DRV-111", "이순신", "010-9876-5432", "2.5톤", "부산34사5678");

        when(insungClient.requestOrder(any(), anyList())).thenReturn(vendorOrderId);
        when(insungClient.requestMatch(vendorOrderId)).thenReturn(matchResp);

        Driver existingDriver = Driver.of("INSUNG-DRV-111", "010-9876-5432", "2.5톤",
                DriverSource.EXTERNAL_INSUNG_QUICK, Boolean.FALSE, null);
        when(driverRepository.findByDriverCode("INSUNG-DRV-111")).thenReturn(Optional.of(existingDriver));

        DriverMatchResult result = matcher.match(vehicle, List.of());

        assertThat(result.driver()).isPresent();
        assertThat(result.driver().get().getDriverCode()).isEqualTo("INSUNG-DRV-111");
        assertThat(result.driver().get().getDriverName()).isEqualTo("이순신");
        assertThat(result.driver().get().getVehiclePlateNumber()).isEqualTo("부산34사5678");
        assertThat(result.source()).isEqualTo(MatchSource.EXTERNAL_INSUNG_QUICK);
    }

    @Test
    @DisplayName("RPC 예외 → empty 반환 (fail-soft)")
    void match_when_rpc_throws_returns_empty() {
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);
        when(insungClient.requestOrder(any(), anyList())).thenThrow(new RuntimeException("네트워크 오류"));

        DriverMatchResult result = matcher.match(vehicle, List.of());

        assertThat(result.driver()).isEmpty();
        assertThat(result.source()).isEqualTo(MatchSource.EXTERNAL_INSUNG_QUICK);
    }
}
