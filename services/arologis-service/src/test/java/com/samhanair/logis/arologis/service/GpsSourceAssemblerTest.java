package com.samhanair.logis.arologis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.config.ArologisMatcherProperties;
import com.samhanair.logis.arologis.domain.DriverLocation;
import com.samhanair.logis.arologis.domain.DriverLocationSource;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.Signature;
import com.samhanair.logis.arologis.domain.SignatureSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.dto.GpsSource;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * GPS source assembler 단위 테스트 — 인성 서명 스냅샷 + 앱/수동 GPS 우선순위 통합.
 */
class GpsSourceAssemblerTest {

    private static final Clock FIXED_CLOCK =
            Clock.fixed(Instant.parse("2026-07-14T03:00:00Z"), ZoneId.of("Asia/Seoul"));

    private final DriverLocationRepository locationRepository = mock(DriverLocationRepository.class);
    private final SignatureRepository signatureRepository = mock(SignatureRepository.class);
    private final ArologisMatcherProperties matcherProperties = new ArologisMatcherProperties();

    private GpsSourceAssembler assembler;

    @BeforeEach
    void setUp() {
        matcherProperties.getGps().setStaleThresholdMs(60_000);
        matcherProperties.getGps().setPriority("insung-lbs,app-gps,manual");
        assembler = new GpsSourceAssembler(locationRepository, signatureRepository, matcherProperties, FIXED_CLOCK);
    }

    @Test
    void insung_snapshot_stale_and_fresh_app_gps_active_marks_app_active() {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID stopId = UUID.randomUUID();
        Vehicle vehicle = assignedVehicle(dispatchId, vehicleId, driverId);
        VehicleStop stop = stop(vehicleId, stopId);
        LocalDateTime now = LocalDateTime.now(FIXED_CLOCK);

        when(locationRepository.findLatestPerDriverAndSource(anyCollection(), anyCollection()))
                .thenReturn(List.of(location(driverId, DriverLocationSource.APP_GPS_ACTIVE, now.minusSeconds(10))));
        when(signatureRepository.findAllByStopIdInAndSourceOrderByCapturedAtDesc(
                anyCollection(), org.mockito.ArgumentMatchers.eq(SignatureSource.EXTERNAL_INSUNG_LBS)))
                .thenReturn(List.of(signature(stopId, now.minusMinutes(5),
                        new BigDecimal("37.1000000"), new BigDecimal("127.1000000"))));

        Map<UUID, List<GpsSource>> result = assembler.assemble(List.of(vehicle), List.of(stop));

        List<GpsSource> sources = result.get(vehicleId);
        assertThat(sources).extracting(GpsSource::source)
                .containsExactly(DriverLocationSource.EXTERNAL_INSUNG_LBS, DriverLocationSource.APP_GPS_ACTIVE);
        assertThat(sources.get(0).active()).isFalse();
        assertThat(sources.get(1).active()).isTrue();
    }

    @Test
    void all_stale_sources_have_no_active_source() {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        Vehicle vehicle = assignedVehicle(dispatchId, vehicleId, driverId);
        LocalDateTime now = LocalDateTime.now(FIXED_CLOCK);

        when(locationRepository.findLatestPerDriverAndSource(anyCollection(), anyCollection()))
                .thenReturn(List.of(location(driverId, DriverLocationSource.APP_GPS_ACTIVE, now.minusMinutes(2))));
        when(signatureRepository.findAllByStopIdInAndSourceOrderByCapturedAtDesc(
                anyCollection(), org.mockito.ArgumentMatchers.eq(SignatureSource.EXTERNAL_INSUNG_LBS)))
                .thenReturn(List.of());

        Map<UUID, List<GpsSource>> result = assembler.assemble(List.of(vehicle), List.of());

        assertThat(result.get(vehicleId)).allMatch(source -> !source.active());
    }

    @Test
    void future_last_received_at_is_treated_as_stale_not_active() {
        // FIX 2 (PR #818 리뷰) — 기사 앱 clock skew 로 lastReceivedAt 이 fixed clock 의 now 보다
        // 미래인 경우, Duration.between 이 음수가 되어 예전에는 "항상 fresh" 로 오판되었다.
        // 이번 케이스는 미래 시각도 stale 로 취급되어 활성 source 가 없어야 함을 검증한다.
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        Vehicle vehicle = assignedVehicle(dispatchId, vehicleId, driverId);
        LocalDateTime now = LocalDateTime.now(FIXED_CLOCK);

        when(locationRepository.findLatestPerDriverAndSource(anyCollection(), anyCollection()))
                .thenReturn(List.of(location(driverId, DriverLocationSource.APP_GPS_ACTIVE, now.plusMinutes(10))));
        when(signatureRepository.findAllByStopIdInAndSourceOrderByCapturedAtDesc(
                anyCollection(), org.mockito.ArgumentMatchers.eq(SignatureSource.EXTERNAL_INSUNG_LBS)))
                .thenReturn(List.of());

        Map<UUID, List<GpsSource>> result = assembler.assemble(List.of(vehicle), List.of());

        assertThat(result.get(vehicleId)).allMatch(source -> !source.active());
    }

    @Test
    void manual_location_is_included_when_present() {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        Vehicle vehicle = assignedVehicle(dispatchId, vehicleId, driverId);
        LocalDateTime now = LocalDateTime.now(FIXED_CLOCK);

        when(locationRepository.findLatestPerDriverAndSource(anyCollection(), anyCollection()))
                .thenReturn(List.of(location(driverId, DriverLocationSource.MANUAL, now.minusSeconds(5))));
        when(signatureRepository.findAllByStopIdInAndSourceOrderByCapturedAtDesc(
                anyCollection(), org.mockito.ArgumentMatchers.eq(SignatureSource.EXTERNAL_INSUNG_LBS)))
                .thenReturn(List.of());

        Map<UUID, List<GpsSource>> result = assembler.assemble(List.of(vehicle), List.of());

        assertThat(result.get(vehicleId)).singleElement().satisfies(source -> {
            assertThat(source.source()).isEqualTo(DriverLocationSource.MANUAL);
            assertThat(source.active()).isTrue();
        });
    }

    @Test
    void insung_signature_with_null_coordinate_is_omitted() {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID stopId = UUID.randomUUID();
        Vehicle vehicle = assignedVehicle(dispatchId, vehicleId, driverId);
        VehicleStop stop = stop(vehicleId, stopId);
        LocalDateTime now = LocalDateTime.now(FIXED_CLOCK);

        when(locationRepository.findLatestPerDriverAndSource(anyCollection(), anyCollection()))
                .thenReturn(List.of());
        when(signatureRepository.findAllByStopIdInAndSourceOrderByCapturedAtDesc(
                anyCollection(), org.mockito.ArgumentMatchers.eq(SignatureSource.EXTERNAL_INSUNG_LBS)))
                .thenReturn(List.of(signature(stopId, now.minusSeconds(5), null, new BigDecimal("127.1000000"))));

        Map<UUID, List<GpsSource>> result = assembler.assemble(List.of(vehicle), List.of(stop));

        assertThat(result).doesNotContainKey(vehicleId);
    }

    @Test
    void configured_priority_orders_sources_and_expands_app_gps_token() {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID stopId = UUID.randomUUID();
        Vehicle vehicle = assignedVehicle(dispatchId, vehicleId, driverId);
        VehicleStop stop = stop(vehicleId, stopId);
        LocalDateTime now = LocalDateTime.now(FIXED_CLOCK);
        matcherProperties.getGps().setPriority("manual,app-gps,insung-lbs");

        when(locationRepository.findLatestPerDriverAndSource(anyCollection(), anyCollection()))
                .thenReturn(List.of(
                        location(driverId, DriverLocationSource.APP_GPS_BACKGROUND, now.minusSeconds(10)),
                        location(driverId, DriverLocationSource.APP_GPS_ACTIVE, now.minusSeconds(10)),
                        location(driverId, DriverLocationSource.MANUAL, now.minusSeconds(10))));
        when(signatureRepository.findAllByStopIdInAndSourceOrderByCapturedAtDesc(
                anyCollection(), org.mockito.ArgumentMatchers.eq(SignatureSource.EXTERNAL_INSUNG_LBS)))
                .thenReturn(List.of(signature(stopId, now.minusSeconds(10),
                        new BigDecimal("37.1000000"), new BigDecimal("127.1000000"))));

        Map<UUID, List<GpsSource>> result = assembler.assemble(List.of(vehicle), List.of(stop));

        assertThat(result.get(vehicleId)).extracting(GpsSource::source).containsExactly(
                DriverLocationSource.MANUAL,
                DriverLocationSource.APP_GPS_ACTIVE,
                DriverLocationSource.APP_GPS_BACKGROUND,
                DriverLocationSource.EXTERNAL_INSUNG_LBS);
        assertThat(result.get(vehicleId).get(0).active()).isTrue();
    }

    @Test
    void exactly_stale_threshold_is_still_fresh_but_null_timestamp_is_stale() {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        Vehicle vehicle = assignedVehicle(dispatchId, vehicleId, driverId);
        LocalDateTime now = LocalDateTime.now(FIXED_CLOCK);
        matcherProperties.getGps().setPriority("manual,app-gps");
        DriverLocation nullTimestampManual =
                location(driverId, DriverLocationSource.MANUAL, now.minusSeconds(1));
        ReflectionTestUtils.setField(nullTimestampManual, "capturedAt", null);

        when(locationRepository.findLatestPerDriverAndSource(anyCollection(), anyCollection()))
                .thenReturn(List.of(
                        nullTimestampManual,
                        location(driverId, DriverLocationSource.APP_GPS_ACTIVE, now.minusSeconds(60))));
        when(signatureRepository.findAllByStopIdInAndSourceOrderByCapturedAtDesc(
                anyCollection(), org.mockito.ArgumentMatchers.eq(SignatureSource.EXTERNAL_INSUNG_LBS)))
                .thenReturn(List.of());

        Map<UUID, List<GpsSource>> result = assembler.assemble(List.of(vehicle), List.of());

        assertThat(result.get(vehicleId)).extracting(GpsSource::source).containsExactly(
                DriverLocationSource.MANUAL,
                DriverLocationSource.APP_GPS_ACTIVE);
        assertThat(result.get(vehicleId).get(0).active()).isFalse();
        assertThat(result.get(vehicleId).get(1).active()).isTrue();
    }

    @Test
    void latest_location_per_driver_and_source_uses_desc_first_row() {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        Vehicle vehicle = assignedVehicle(dispatchId, vehicleId, driverId);
        LocalDateTime now = LocalDateTime.now(FIXED_CLOCK);

        when(locationRepository.findLatestPerDriverAndSource(anyCollection(), anyCollection()))
                .thenReturn(List.of(
                        location(driverId, DriverLocationSource.APP_GPS_ACTIVE, now.minusSeconds(1),
                                "37.5555555", "127.5555555"),
                        location(driverId, DriverLocationSource.APP_GPS_ACTIVE, now.minusSeconds(5),
                                "37.9999999", "127.9999999")));
        when(signatureRepository.findAllByStopIdInAndSourceOrderByCapturedAtDesc(
                anyCollection(), org.mockito.ArgumentMatchers.eq(SignatureSource.EXTERNAL_INSUNG_LBS)))
                .thenReturn(List.of());

        Map<UUID, List<GpsSource>> result = assembler.assemble(List.of(vehicle), List.of());

        assertThat(result.get(vehicleId)).singleElement().satisfies(source -> {
            assertThat(source.source()).isEqualTo(DriverLocationSource.APP_GPS_ACTIVE);
            assertThat(source.latitude()).isEqualByComparingTo("37.5555555");
            assertThat(source.longitude()).isEqualByComparingTo("127.5555555");
        });
    }

    @Test
    void latest_insung_signature_across_vehicle_stops_skips_null_coordinates() {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID stopId1 = UUID.randomUUID();
        UUID stopId2 = UUID.randomUUID();
        Vehicle vehicle = assignedVehicle(dispatchId, vehicleId, driverId);
        VehicleStop stop1 = stop(vehicleId, stopId1);
        VehicleStop stop2 = stop(vehicleId, stopId2);
        LocalDateTime now = LocalDateTime.now(FIXED_CLOCK);

        when(locationRepository.findLatestPerDriverAndSource(anyCollection(), anyCollection()))
                .thenReturn(List.of());
        when(signatureRepository.findAllByStopIdInAndSourceOrderByCapturedAtDesc(
                anyCollection(), org.mockito.ArgumentMatchers.eq(SignatureSource.EXTERNAL_INSUNG_LBS)))
                .thenReturn(List.of(
                        signature(stopId2, now.minusSeconds(1), null, new BigDecimal("127.9999999")),
                        signature(stopId2, now.minusSeconds(5), new BigDecimal("37.2222222"), new BigDecimal("127.2222222")),
                        signature(stopId1, now.minusSeconds(10), new BigDecimal("37.1111111"), new BigDecimal("127.1111111"))));

        Map<UUID, List<GpsSource>> result = assembler.assemble(List.of(vehicle), List.of(stop1, stop2));

        assertThat(result.get(vehicleId)).singleElement().satisfies(source -> {
            assertThat(source.source()).isEqualTo(DriverLocationSource.EXTERNAL_INSUNG_LBS);
            assertThat(source.latitude()).isEqualByComparingTo("37.2222222");
            assertThat(source.longitude()).isEqualByComparingTo("127.2222222");
        });
    }

    private static Vehicle assignedVehicle(UUID dispatchId, UUID vehicleId, UUID driverId) {
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "상일+초월");
        ReflectionTestUtils.setField(vehicle, "id", vehicleId);
        vehicle.assignDriver(driverId, MatchSource.MANUAL, null);
        return vehicle;
    }

    private static VehicleStop stop(UUID vehicleId, UUID stopId) {
        VehicleStop stop = VehicleStop.of(
                vehicleId, 1, "-상일", "서울 강동구", "상일공조", 214L, null, StopStatus.PENDING);
        ReflectionTestUtils.setField(stop, "id", stopId);
        return stop;
    }

    private static DriverLocation location(UUID driverId, DriverLocationSource source, LocalDateTime capturedAt) {
        return location(driverId, source, capturedAt, "37.2000000", "127.2000000");
    }

    private static DriverLocation location(UUID driverId, DriverLocationSource source, LocalDateTime capturedAt,
                                           String latitude, String longitude) {
        return DriverLocation.of(driverId, new BigDecimal(latitude),
                new BigDecimal(longitude), capturedAt, source);
    }

    private static Signature signature(UUID stopId, LocalDateTime capturedAt,
                                       BigDecimal latitude, BigDecimal longitude) {
        return Signature.of(stopId, SignatureSource.EXTERNAL_INSUNG_LBS, "image-ref",
                capturedAt, latitude, longitude);
    }
}
