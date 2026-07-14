package com.samhanair.logis.arologis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.NotificationSendOutcome;
import com.samhanair.logis.arologis.domain.ArologisNotifyChannel;
import com.samhanair.logis.arologis.domain.ArologisNotifyStatus;
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

/**
 * DispatchService 단위 테스트.
 *
 * <p>배차 생성/조회/자동 매칭/수동 배정/수동 위치 기록과, 자동 매칭 후 알리고 SMS 발송 이력 기록
 * 계약을 검증한다.
 */
class DispatchServiceTest {

    private static final Clock FIXED_CLOCK =
            Clock.fixed(Instant.parse("2026-07-14T03:00:00Z"), ZoneId.of("Asia/Seoul"));

    private final DispatchRepository dispatchRepository = mock(DispatchRepository.class);
    private final VehicleRepository vehicleRepository = mock(VehicleRepository.class);
    private final VehicleStopRepository stopRepository = mock(VehicleStopRepository.class);
    private final DriverRepository driverRepository = mock(DriverRepository.class);
    private final DriverLocationRepository locationRepository = mock(DriverLocationRepository.class);
    private final DriverMatcher driverMatcher = mock(DriverMatcher.class);
    private final NotificationClient notificationClient = mock(NotificationClient.class);
    private final DispatchNotificationRecorder dispatchNotificationRecorder =
            mock(DispatchNotificationRecorder.class);
    private final com.samhanair.logis.arologis.realtime.service.ArologisAuditLogRecorder auditLogRecorder =
            mock(com.samhanair.logis.arologis.realtime.service.ArologisAuditLogRecorder.class);

    private final DispatchService service = new DispatchService(
            dispatchRepository, vehicleRepository, stopRepository,
            driverRepository, locationRepository, driverMatcher, notificationClient, auditLogRecorder,
            FIXED_CLOCK, dispatchNotificationRecorder);

    private static void setId(Object entity, String fieldName, UUID id) throws Exception {
        Field f = entity.getClass().getDeclaredField(fieldName);
        f.setAccessible(true);
        f.set(entity, id);
    }

    private Vehicle prepareAutoMatch(UUID dispatchId, UUID vehicleId, Driver driver) throws Exception {
        Dispatch dispatch = Dispatch.of(LocalDate.of(2026, 5, 8), DispatchType.NIGHT, "raw");
        setId(dispatch, "id", dispatchId);
        when(dispatchRepository.findById(dispatchId)).thenReturn(Optional.of(dispatch));

        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, null);
        setId(vehicle, "id", vehicleId);
        if (driver.getId() == null) {
            setId(driver, "id", UUID.randomUUID());
        }
        when(vehicleRepository.findAllByDispatchIdOrderBySequenceAsc(dispatchId))
                .thenReturn(List.of(vehicle));
        when(stopRepository.findAllByVehicleIdOrderBySequenceAsc(vehicleId)).thenReturn(List.of());
        return vehicle;
    }

    @Test
    @DisplayName("생성 시 dispatch, vehicle, stop aggregate를 저장한다")
    void create_persists_aggregate() throws Exception {
        ParsedDispatch parsed = new ParsedDispatch(
                LocalDate.of(2026, 5, 8),
                DispatchType.NIGHT,
                List.of(new ParsedDispatch.ParsedVehicle(1, VehicleTonnage.TONNAGE_1, "영일+초월",
                        List.of(
                                new ParsedDispatch.ParsedStop(1, "영일상차", null, null, null, "영일상차", true),
                                new ParsedDispatch.ParsedStop(2,
                                        "-인천 남동구 테스트공조 214)아침8시",
                                        "인천 남동구", "테스트공조", 214L, "아침8시", false)))),
                10, 8);

        Dispatch dispatch = Dispatch.of(parsed.dispatchDate(), parsed.dispatchType(), "raw");
        UUID dispatchId = UUID.randomUUID();
        setId(dispatch, "id", dispatchId);
        when(dispatchRepository.save(any(Dispatch.class))).thenReturn(dispatch);

        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "영일+초월");
        setId(vehicle, "id", UUID.randomUUID());
        when(vehicleRepository.save(any(Vehicle.class))).thenReturn(vehicle);
        when(stopRepository.save(any(VehicleStop.class))).thenAnswer(inv -> inv.getArgument(0));

        UUID returned = service.create(parsed, "raw");

        assertThat(returned).isEqualTo(dispatchId);
    }

    @Test
    @DisplayName("단건 조회 시 vehicles와 stops aggregate를 반환한다")
    void findById_returns_aggregate() throws Exception {
        UUID dispatchId = UUID.randomUUID();
        Dispatch dispatch = Dispatch.of(LocalDate.of(2026, 5, 8), DispatchType.NIGHT, "raw");
        setId(dispatch, "id", dispatchId);
        when(dispatchRepository.findById(dispatchId)).thenReturn(Optional.of(dispatch));

        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, null);
        UUID vehicleId = UUID.randomUUID();
        setId(vehicle, "id", vehicleId);
        when(vehicleRepository.findAllByDispatchIdOrderBySequenceAsc(dispatchId))
                .thenReturn(List.of(vehicle));
        VehicleStop stop = VehicleStop.of(vehicleId, 1, "raw", "주소", "파트너", 1L, "메모", StopStatus.PENDING);
        when(stopRepository.findAllByVehicleIdOrderBySequenceAsc(vehicleId)).thenReturn(List.of(stop));

        DispatchService.DispatchAggregate agg = service.findById(dispatchId);

        assertThat(agg.dispatch()).isSameAs(dispatch);
        assertThat(agg.vehicles()).containsExactly(vehicle);
        assertThat(agg.stops()).containsExactly(stop);
    }

    @Test
    @DisplayName("자동 매칭 시 matcher 결과로 차량을 ASSIGNED 상태로 전환한다")
    void autoMatch_assigns_drivers() throws Exception {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        Driver driver = Driver.of("MOCK-001", "010-0000-0000", "1톤",
                DriverSource.INTERNAL, false, null);
        UUID driverId = UUID.randomUUID();
        setId(driver, "id", driverId);
        Vehicle vehicle = prepareAutoMatch(dispatchId, vehicleId, driver);
        when(driverMatcher.match(any(), any()))
                .thenReturn(DriverMatchResult.of(driver, MatchSource.INTERNAL_APP, "MOCK-aaaa"));
        lenient().when(notificationClient.sendDispatchSms(any(), any(), any()))
                .thenReturn(new NotificationSendOutcome(true, ArologisNotifyStatus.SUCCESS, null));

        DispatchService.AutoMatchResult result = service.autoMatch(dispatchId);

        assertThat(result.totalVehicles()).isEqualTo(1);
        assertThat(result.matched()).isEqualTo(1);
        assertThat(vehicle.getStatus()).isEqualTo(VehicleStatus.ASSIGNED);
        assertThat(vehicle.getAssignedDriverId()).isEqualTo(driverId);
    }

    @Test
    @DisplayName("자동 매칭 성공 시 기사 휴대폰으로 Aligo SMS를 발송하고 성공 이력을 기록한다")
    void autoMatch_sends_sms_and_records_aligo_success_notification() throws Exception {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        Driver driver = Driver.of("MOCK-001", "010-1111-2222", "1톤",
                DriverSource.INTERNAL, true, null);
        Vehicle vehicle = prepareAutoMatch(dispatchId, vehicleId, driver);
        when(driverMatcher.match(any(), any()))
                .thenReturn(DriverMatchResult.of(driver, MatchSource.INTERNAL_APP, "MOCK-aaaa"));
        when(notificationClient.sendDispatchSms(any(), any(), any()))
                .thenReturn(new NotificationSendOutcome(true, ArologisNotifyStatus.SUCCESS, null));

        service.autoMatch(dispatchId);

        verify(notificationClient).sendDispatchSms(
                eq("010-1111-2222"),
                eq("신규 배차 매칭"),
                eq("차량 #1 (1톤) 배정"));
        verify(dispatchNotificationRecorder).record(
                eq(dispatchId),
                eq(vehicle.getId()),
                eq(ArologisNotifyChannel.ALIGO),
                eq(ArologisNotifyStatus.SUCCESS),
                eq(LocalDateTime.now(FIXED_CLOCK)),
                eq("010-1111-2222"),
                isNull());
    }

    @Test
    @DisplayName("알림 이력 기록이 예외를 던져도 fail-soft로 흡수되어 자동 매칭 결과와 배정은 유지된다")
    void autoMatch_survives_when_notification_recorder_throws() throws Exception {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        Driver driver = Driver.of("MOCK-005", "010-5555-6666", "1톤",
                DriverSource.INTERNAL, true, null);
        UUID driverId = UUID.randomUUID();
        setId(driver, "id", driverId);
        Vehicle vehicle = prepareAutoMatch(dispatchId, vehicleId, driver);
        when(driverMatcher.match(any(), any()))
                .thenReturn(DriverMatchResult.of(driver, MatchSource.INTERNAL_APP, "MOCK-eeee"));
        when(notificationClient.sendDispatchSms(any(), any(), any()))
                .thenReturn(new NotificationSendOutcome(true, ArologisNotifyStatus.SUCCESS, null));
        doThrow(new IllegalStateException("db down"))
                .when(dispatchNotificationRecorder)
                .record(any(), any(), any(), any(), any(), any(), any());

        DispatchService.AutoMatchResult result = service.autoMatch(dispatchId);

        assertThat(result.totalVehicles()).isEqualTo(1);
        assertThat(result.matched()).isEqualTo(1);
        assertThat(vehicle.getStatus()).isEqualTo(VehicleStatus.ASSIGNED);
        assertThat(vehicle.getAssignedDriverId()).isEqualTo(driverId);
    }

    @Test
    @DisplayName("자동 매칭 SMS 발송 실패 시 실패 이력과 오류 코드를 기록한다")
    void autoMatch_records_failed_notification_when_sms_send_fails() throws Exception {
        UUID dispatchId = UUID.randomUUID();
        Driver driver = Driver.of("MOCK-002", "010-2222-3333", "1톤",
                DriverSource.INTERNAL, true, null);
        prepareAutoMatch(dispatchId, UUID.randomUUID(), driver);
        when(driverMatcher.match(any(), any()))
                .thenReturn(DriverMatchResult.of(driver, MatchSource.INTERNAL_APP, "MOCK-bbbb"));
        when(notificationClient.sendDispatchSms(any(), any(), any()))
                .thenReturn(new NotificationSendOutcome(true, ArologisNotifyStatus.FAILED, "HTTP_400"));

        service.autoMatch(dispatchId);

        verify(dispatchNotificationRecorder).record(
                eq(dispatchId),
                any(),
                eq(ArologisNotifyChannel.ALIGO),
                eq(ArologisNotifyStatus.FAILED),
                eq(LocalDateTime.now(FIXED_CLOCK)),
                eq("010-2222-3333"),
                eq("HTTP_400"));
    }

    @Test
    @DisplayName("자동 매칭 SMS가 skeleton-mode로 미시도이면 이력을 기록하지 않는다")
    void autoMatch_does_not_record_notification_when_sms_not_attempted() throws Exception {
        UUID dispatchId = UUID.randomUUID();
        Driver driver = Driver.of("MOCK-003", "010-3333-4444", "1톤",
                DriverSource.INTERNAL, true, null);
        prepareAutoMatch(dispatchId, UUID.randomUUID(), driver);
        when(driverMatcher.match(any(), any()))
                .thenReturn(DriverMatchResult.of(driver, MatchSource.INTERNAL_APP, "MOCK-cccc"));
        when(notificationClient.sendDispatchSms(any(), any(), any()))
                .thenReturn(new NotificationSendOutcome(false, null, null));

        service.autoMatch(dispatchId);

        verify(dispatchNotificationRecorder, never()).record(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("자동 매칭된 기사 휴대폰 번호가 없으면 SMS 발송과 이력 기록을 생략한다")
    void autoMatch_skips_notification_when_driver_phone_is_blank() throws Exception {
        UUID dispatchId = UUID.randomUUID();
        Driver driver = Driver.of("MOCK-004", null, "1톤",
                DriverSource.INTERNAL, true, null);
        prepareAutoMatch(dispatchId, UUID.randomUUID(), driver);
        when(driverMatcher.match(any(), any()))
                .thenReturn(DriverMatchResult.of(driver, MatchSource.INTERNAL_APP, "MOCK-dddd"));

        service.autoMatch(dispatchId);

        verify(notificationClient, never()).sendDispatchSms(any(), any(), any());
        verify(dispatchNotificationRecorder, never()).record(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("수동 배정 시 driverCode로 차량에 기사를 배정한다")
    void assignDriverManual_assigns_correctly() throws Exception {
        UUID dispatchId = UUID.randomUUID();
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, null);
        when(vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, 1))
                .thenReturn(Optional.of(vehicle));
        Driver driver = Driver.of("D-100", "010-1111-2222", "1톤", DriverSource.MANUAL, false, null);
        UUID driverId = UUID.randomUUID();
        setId(driver, "id", driverId);
        when(driverRepository.findByDriverCode("D-100")).thenReturn(Optional.of(driver));

        service.assignDriverManual(dispatchId, 1, "D-100");

        assertThat(vehicle.getStatus()).isEqualTo(VehicleStatus.ASSIGNED);
        assertThat(vehicle.getMatchSource()).isEqualTo(MatchSource.MANUAL);
        assertThat(vehicle.getAssignedDriverId()).isEqualTo(driverId);
    }

    @Test
    @DisplayName("없는 dispatch 조회 시 NOT_FOUND BusinessException을 던진다")
    void findById_throws_when_missing() {
        UUID id = UUID.randomUUID();
        when(dispatchRepository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.findById(id))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.NOT_FOUND);
    }

    @Test
    @DisplayName("수동 위치 입력 대상 차량이 없으면 NOT_FOUND를 던진다")
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
    @DisplayName("기사 배정 전 수동 위치 입력은 INVALID_INPUT을 던진다")
    void recordManualLocation_without_assigned_driver_throws_INVALID_INPUT() {
        UUID dispatchId = UUID.randomUUID();
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "영일");
        when(vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, 1))
                .thenReturn(Optional.of(vehicle));

        assertThatThrownBy(() -> service.recordManualLocation(dispatchId, 1,
                new BigDecimal("37.1234567"), new BigDecimal("127.1234567")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("수동 위치 입력 성공 시 MANUAL source와 고정 clock 시각으로 저장한다")
    void recordManualLocation_success_saves_manual_location_with_fixed_clock_now() {
        UUID dispatchId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "영일");
        vehicle.assignDriver(driverId, MatchSource.MANUAL, null);
        when(vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, 1))
                .thenReturn(Optional.of(vehicle));
        when(locationRepository.save(any(DriverLocation.class))).thenAnswer(inv -> inv.getArgument(0));

        BigDecimal latitude = new BigDecimal("37.1234567");
        BigDecimal longitude = new BigDecimal("127.7654321");
        service.recordManualLocation(dispatchId, 1, latitude, longitude);

        org.mockito.ArgumentCaptor<DriverLocation> captor =
                org.mockito.ArgumentCaptor.forClass(DriverLocation.class);
        verify(locationRepository).save(captor.capture());
        DriverLocation saved = captor.getValue();
        assertThat(saved.getSource()).isEqualTo(DriverLocationSource.MANUAL);
        assertThat(saved.getDriverId()).isEqualTo(driverId);
        assertThat(saved.getCapturedAt()).isEqualTo(LocalDateTime.now(FIXED_CLOCK));
        assertThat(saved.getLatitude()).isEqualByComparingTo(latitude);
        assertThat(saved.getLongitude()).isEqualByComparingTo(longitude);
    }
}
