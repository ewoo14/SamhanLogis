package com.samhanair.logis.arologis.matcher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
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
    }

    @Test
    @DisplayName("매칭 성공 → Driver upsert + DriverMatchResult.of() 반환")
    void match_success_upserts_driver_and_returns_result() {
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);
        String vendorOrderId = "VENDOR-ORD-123";
        InsungDriverMatchResponse matchResp = InsungDriverMatchResponse.matched(
                "DRV-999", "홍길동", "010-1234-5678", "1톤");

        when(insungClient.requestOrder(any(), anyList())).thenReturn(vendorOrderId);
        when(insungClient.requestMatch(vendorOrderId)).thenReturn(matchResp);
        when(driverRepository.findByDriverCode("INSUNG-DRV-999")).thenReturn(Optional.empty());

        Driver mockDriver = Driver.of("INSUNG-DRV-999", "010-1234-5678", "1톤",
                DriverSource.EXTERNAL_INSUNG_QUICK, Boolean.FALSE, null);
        when(driverRepository.save(any())).thenReturn(mockDriver);

        DriverMatchResult result = matcher.match(vehicle, List.of());

        assertThat(result.driver()).isPresent();
        assertThat(result.driver().get().getDriverCode()).isEqualTo("INSUNG-DRV-999");
        assertThat(result.source()).isEqualTo(MatchSource.EXTERNAL_INSUNG_QUICK);
        assertThat(result.externalRefId()).isEqualTo(vendorOrderId);
    }

    @Test
    @DisplayName("기존 Driver 존재 시 upsert 없이 기존 Driver 반환")
    void match_success_returns_existing_driver_without_upsert() {
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);
        String vendorOrderId = "VENDOR-ORD-456";
        InsungDriverMatchResponse matchResp = InsungDriverMatchResponse.matched(
                "DRV-111", "이순신", "010-9876-5432", "2.5톤");

        when(insungClient.requestOrder(any(), anyList())).thenReturn(vendorOrderId);
        when(insungClient.requestMatch(vendorOrderId)).thenReturn(matchResp);

        Driver existingDriver = Driver.of("INSUNG-DRV-111", "010-9876-5432", "2.5톤",
                DriverSource.EXTERNAL_INSUNG_QUICK, Boolean.FALSE, null);
        when(driverRepository.findByDriverCode("INSUNG-DRV-111")).thenReturn(Optional.of(existingDriver));

        DriverMatchResult result = matcher.match(vehicle, List.of());

        assertThat(result.driver()).isPresent();
        assertThat(result.driver().get().getDriverCode()).isEqualTo("INSUNG-DRV-111");
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
