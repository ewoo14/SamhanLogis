package com.samhanair.logis.arologis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverLocation;
import com.samhanair.logis.arologis.domain.DriverLocationSource;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStatus;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.matcher.DriverMatchResult;
import com.samhanair.logis.arologis.matcher.DriverMatcher;
import com.samhanair.logis.arologis.parser.ParsedDispatch;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * DispatchService 단위 테스트 — Phase 10 W10-1.
 *
 * <p>8 case — 생성 / 단건 조회 / 자동 매칭 (Mock matcher) / 수동 배정 / 미존재 NOT_FOUND /
 * 수동 위치 입력 3 case (vehicle 미존재 NOT_FOUND / 배정 기사 없음 INVALID_INPUT / 성공 저장).
 */
class DispatchServiceTest {

    /** FIX 3 (PR #818 리뷰) — recordManualLocation Clock 결정성 테스트용 고정 시각. */
    private static final Clock FIXED_CLOCK =
            Clock.fixed(Instant.parse("2026-07-14T03:00:00Z"), ZoneId.of("Asia/Seoul"));

    private final DispatchRepository dispatchRepository = mock(DispatchRepository.class);
    private final VehicleRepository vehicleRepository = mock(VehicleRepository.class);
    private final VehicleStopRepository stopRepository = mock(VehicleStopRepository.class);
    private final DriverRepository driverRepository = mock(DriverRepository.class);
    private final DriverLocationRepository locationRepository = mock(DriverLocationRepository.class);
    private final DriverMatcher driverMatcher = mock(DriverMatcher.class);
    private final NotificationClient notificationClient = mock(NotificationClient.class);
    // 2026-05-14 분리 — UserClient mock 제거 (자체 user 도메인 도입).
    // PR-H4b — DispatchService 가 stop status 변경 시 audit 기록 — 본 unit test 는 broker mock 만 검증
    private final com.samhanair.logis.arologis.realtime.service.ArologisAuditLogRecorder auditLogRecorder =
            mock(com.samhanair.logis.arologis.realtime.service.ArologisAuditLogRecorder.class);

    private final DispatchService service = new DispatchService(
            dispatchRepository, vehicleRepository, stopRepository,
            driverRepository, locationRepository, driverMatcher, notificationClient, auditLogRecorder,
            FIXED_CLOCK);

    private static void setId(Object entity, String fieldName, UUID id) throws Exception {
        Field f = entity.getClass().getDeclaredField(fieldName);
        f.setAccessible(true);
        f.set(entity, id);
    }

    @Test
    @DisplayName("생성 — parsed dispatch 입력 → dispatch + vehicle + stops 영속화")
    void create_persists_aggregate() throws Exception {
        ParsedDispatch parsed = new ParsedDispatch(
                LocalDate.of(2026, 5, 8),
                DispatchType.NIGHT,
                List.of(new ParsedDispatch.ParsedVehicle(1, VehicleTonnage.TONNAGE_1, "상일+초월",
                        List.of(
                                new ParsedDispatch.ParsedStop(1, "상일상차", null, null, null, "상일상차", true),
                                new ParsedDispatch.ParsedStop(2,
                                        "-인천 남동구(에스엠하나공조-214)아침8시",
                                        "인천 남동구", "에스엠하나공조", 214L, "아침8시", false)))),
                10, 8);

        Dispatch dispatch = Dispatch.of(parsed.dispatchDate(), parsed.dispatchType(), "raw");
        UUID dispatchId = UUID.randomUUID();
        setId(dispatch, "id", dispatchId);
        when(dispatchRepository.save(any(Dispatch.class))).thenReturn(dispatch);

        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "상일+초월");
        UUID vehicleId = UUID.randomUUID();
        setId(vehicle, "id", vehicleId);
        when(vehicleRepository.save(any(Vehicle.class))).thenReturn(vehicle);
        when(stopRepository.save(any(VehicleStop.class))).thenAnswer(inv -> inv.getArgument(0));

        UUID returned = service.create(parsed, "raw");
        assertThat(returned).isEqualTo(dispatchId);
    }

    @Test
    @DisplayName("단건 조회 — vehicles + stops aggregate 반환")
    void findById_returns_aggregate() throws Exception {
        UUID dispatchId = UUID.randomUUID();
        Dispatch dispatch = Dispatch.of(LocalDate.of(2026, 5, 8), DispatchType.NIGHT, "raw");
        setId(dispatch, "id", dispatchId);
        when(dispatchRepository.findById(dispatchId)).thenReturn(Optional.of(dispatch));

        Vehicle v1 = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, null);
        UUID v1Id = UUID.randomUUID();
        setId(v1, "id", v1Id);
        when(vehicleRepository.findAllByDispatchIdOrderBySequenceAsc(dispatchId))
                .thenReturn(List.of(v1));
        VehicleStop s1 = VehicleStop.of(v1Id, 1, "raw", "주소", "파트너", 1L, "메모", StopStatus.PENDING);
        when(stopRepository.findAllByVehicleIdOrderBySequenceAsc(v1Id)).thenReturn(List.of(s1));

        DispatchService.DispatchAggregate agg = service.findById(dispatchId);
        assertThat(agg.dispatch()).isSameAs(dispatch);
        assertThat(agg.vehicles()).hasSize(1);
        assertThat(agg.stops()).hasSize(1);
    }

    @Test
    @DisplayName("자동 매칭 — Mock matcher 호출 + 차량 ASSIGNED 전이")
    void autoMatch_assigns_drivers() throws Exception {
        UUID dispatchId = UUID.randomUUID();
        Dispatch dispatch = Dispatch.of(LocalDate.of(2026, 5, 8), DispatchType.NIGHT, "raw");
        setId(dispatch, "id", dispatchId);
        when(dispatchRepository.findById(dispatchId)).thenReturn(Optional.of(dispatch));

        Vehicle v1 = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, null);
        UUID v1Id = UUID.randomUUID();
        setId(v1, "id", v1Id);
        when(vehicleRepository.findAllByDispatchIdOrderBySequenceAsc(dispatchId))
                .thenReturn(List.of(v1));
        when(stopRepository.findAllByVehicleIdOrderBySequenceAsc(v1Id)).thenReturn(List.of());

        Driver mockDriver = Driver.of("MOCK-001", "010-0000-0000", "1톤",
                DriverSource.INTERNAL, false, null);
        UUID driverId = UUID.randomUUID();
        setId(mockDriver, "id", driverId);
        when(driverMatcher.match(any(), any()))
                .thenReturn(DriverMatchResult.of(mockDriver, MatchSource.INTERNAL_APP, "MOCK-aaaa"));
        lenient().when(notificationClient.send(any(), any(), any(), any())).thenReturn(true);

        DispatchService.AutoMatchResult result = service.autoMatch(dispatchId);
        assertThat(result.totalVehicles()).isEqualTo(1);
        assertThat(result.matched()).isEqualTo(1);
        assertThat(v1.getStatus()).isEqualTo(VehicleStatus.ASSIGNED);
        assertThat(v1.getAssignedDriverId()).isEqualTo(driverId);
    }

    @Test
    @DisplayName("수동 배정 — driverCode 로 lookup 후 vehicle.assignDriver")
    void assignDriverManual_assigns_correctly() throws Exception {
        UUID dispatchId = UUID.randomUUID();
        Vehicle v1 = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, null);
        when(vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, 1))
                .thenReturn(Optional.of(v1));
        Driver driver = Driver.of("D-100", "010-1111-2222", "1톤", DriverSource.MANUAL, false, null);
        UUID driverId = UUID.randomUUID();
        setId(driver, "id", driverId);
        when(driverRepository.findByDriverCode("D-100")).thenReturn(Optional.of(driver));

        service.assignDriverManual(dispatchId, 1, "D-100");
        assertThat(v1.getStatus()).isEqualTo(VehicleStatus.ASSIGNED);
        assertThat(v1.getMatchSource()).isEqualTo(MatchSource.MANUAL);
        assertThat(v1.getAssignedDriverId()).isEqualTo(driverId);
    }

    @Test
    @DisplayName("미존재 dispatch 조회 → BusinessException NOT_FOUND")
    void findById_throws_when_missing() {
        UUID id = UUID.randomUUID();
        when(dispatchRepository.findById(id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.findById(id))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("dispatch 미존재");
    }

    // ---- FIX 3 (PR #818 리뷰) — recordManualLocation Clock 주입 + 단위 테스트 3 case ----

    @Test
    @DisplayName("수동 위치 입력 — vehicle 미존재 → BusinessException NOT_FOUND")
    void recordManualLocation_vehicle_not_found_throws_NOT_FOUND() {
        UUID dispatchId = UUID.randomUUID();
        when(vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, 1))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.recordManualLocation(dispatchId, 1,
                new BigDecimal("37.1234567"), new BigDecimal("127.1234567")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.NOT_FOUND);
    }

    @Test
    @DisplayName("수동 위치 입력 — 배정 기사 없음 → BusinessException INVALID_INPUT")
    void recordManualLocation_without_assigned_driver_throws_INVALID_INPUT() {
        UUID dispatchId = UUID.randomUUID();
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "상일");
        when(vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, 1))
                .thenReturn(Optional.of(vehicle));

        assertThatThrownBy(() -> service.recordManualLocation(dispatchId, 1,
                new BigDecimal("37.1234567"), new BigDecimal("127.1234567")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("수동 위치 입력 — 성공 시 source=MANUAL + fixed clock now 로 저장")
    void recordManualLocation_success_saves_manual_location_with_fixed_clock_now() {
        UUID dispatchId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "상일");
        vehicle.assignDriver(driverId, MatchSource.MANUAL, null);
        when(vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, 1))
                .thenReturn(Optional.of(vehicle));
        when(locationRepository.save(any(DriverLocation.class))).thenAnswer(inv -> inv.getArgument(0));

        BigDecimal latitude = new BigDecimal("37.1234567");
        BigDecimal longitude = new BigDecimal("127.7654321");
        service.recordManualLocation(dispatchId, 1, latitude, longitude);

        ArgumentCaptor<DriverLocation> captor = ArgumentCaptor.forClass(DriverLocation.class);
        verify(locationRepository).save(captor.capture());
        DriverLocation saved = captor.getValue();
        assertThat(saved.getSource()).isEqualTo(DriverLocationSource.MANUAL);
        assertThat(saved.getDriverId()).isEqualTo(driverId);
        assertThat(saved.getCapturedAt()).isEqualTo(LocalDateTime.now(FIXED_CLOCK));
        assertThat(saved.getLatitude()).isEqualByComparingTo(latitude);
        assertThat(saved.getLongitude()).isEqualByComparingTo(longitude);
    }
}
