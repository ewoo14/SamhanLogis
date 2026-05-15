package com.samhanair.logis.arologis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStatus;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.dto.DriverTodayVehicleResponse;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.arologis.service.SlipResolver;
import com.samhanair.logis.arologis.service.copy.SignAndSendCopyService;
import com.samhanair.logis.arologis.web.dto.copy.SignAndSendCopyRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class ArologisDriverAppControllerTest {

    @Mock
    private DriverRepository driverRepository;
    @Mock
    private DispatchRepository dispatchRepository;
    @Mock
    private VehicleRepository vehicleRepository;
    @Mock
    private VehicleStopRepository stopRepository;
    @Mock
    private SignatureRepository signatureRepository;
    @Mock
    private DriverLocationRepository locationRepository;
    @Mock
    private SlipClient slipClient;
    @Mock
    private SlipResolver slipResolver;
    @Mock
    private SignAndSendCopyService signAndSendCopyService;
    @Mock
    private HttpServletRequest request;

    @Test
    void today_returns_signable_stop_targets_for_assigned_driver() {
        UUID userId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        LocalDate today = LocalDate.now(ZoneId.systemDefault());

        Driver driver = Driver.of("DR-UNIT-001", "010-1111-2222", "1톤",
                DriverSource.INTERNAL, true, userId);
        ReflectionTestUtils.setField(driver, "id", driverId);

        Dispatch dispatch = Dispatch.of(today, DispatchType.NIGHT, "unit");
        ReflectionTestUtils.setField(dispatch, "id", dispatchId);

        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "강남+서초");
        ReflectionTestUtils.setField(vehicle, "id", vehicleId);
        vehicle.assignDriver(driverId, MatchSource.INTERNAL_APP, null);

        VehicleStop stop = VehicleStop.of(vehicleId, 1, "서울 강남구 테스트로 1 (테스트상사-1234)",
                "서울 강남구 테스트로 1", "테스트상사", 1234L, "문 앞 전달", StopStatus.PENDING);

        when(request.getHeader("X-User-Id")).thenReturn(userId.toString());
        when(driverRepository.findByAppUserId(userId)).thenReturn(Optional.of(driver));
        when(vehicleRepository.findAllAssignedToDriverOnDate(driverId, today))
                .thenReturn(List.of(vehicle));
        when(dispatchRepository.findAllById(List.of(dispatchId))).thenReturn(List.of(dispatch));
        when(stopRepository.findAllByVehicleIdOrderBySequenceAsc(vehicleId)).thenReturn(List.of(stop));

        ArologisDriverAppController controller = new ArologisDriverAppController(
                driverRepository,
                dispatchRepository,
                vehicleRepository,
                stopRepository,
                signatureRepository,
                locationRepository,
                slipClient,
                slipResolver,
                signAndSendCopyService);

        ApiResponse<List<DriverTodayVehicleResponse>> response = controller.today(request);

        assertThat(response.getData()).hasSize(1);
        DriverTodayVehicleResponse vehicleData = response.getData().get(0);
        assertThat(Arrays.stream(DriverTodayVehicleResponse.class.getRecordComponents())
                .map(component -> component.getName()))
                .doesNotContain("dispatchId");
        assertThat(vehicleData.dispatchDate()).isEqualTo(today);
        assertThat(vehicleData.dispatchType()).isEqualTo(DispatchType.NIGHT);
        assertThat(vehicleData.vehicleSequence()).isEqualTo(1);
        assertThat(vehicleData.label()).isEqualTo("강남+서초");
        assertThat(vehicleData.status()).isEqualTo(VehicleStatus.ASSIGNED);
        assertThat(vehicleData.stops())
                .singleElement()
                .satisfies(stopData -> {
                    assertThat(stopData.stopSequence()).isEqualTo(1);
                    assertThat(stopData.parsedPartnerName()).isEqualTo("테스트상사");
                    assertThat(stopData.parsedKakaoSeq()).isEqualTo(1234L);
                    assertThat(stopData.status()).isEqualTo(StopStatus.PENDING);
                });
    }

    @Test
    void signAndSendCopyToday_resolves_internal_dispatch_without_uuid_response_contract() {
        UUID userId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        SignAndSendCopyRequest signRequest = new SignAndSendCopyRequest(
                "driver-png", "recipient-png", LocalDateTime.of(2026, 5, 15, 12, 0),
                null, null, 4321L);

        Driver driver = Driver.of("DR-UNIT-002", "010-3333-4444", "1톤",
                DriverSource.INTERNAL, true, userId);
        ReflectionTestUtils.setField(driver, "id", driverId);
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "강남");
        ReflectionTestUtils.setField(vehicle, "id", vehicleId);
        vehicle.assignDriver(driverId, MatchSource.INTERNAL_APP, null);
        VehicleStop stop = VehicleStop.of(vehicleId, 1, "서울 강남구 테스트로 1 (강남상사-4321)",
                "서울 강남구 테스트로 1", "강남상사", 4321L, null, StopStatus.PENDING);

        when(request.getHeader("X-User-Id")).thenReturn(userId.toString());
        when(driverRepository.findByAppUserId(userId)).thenReturn(Optional.of(driver));
        when(vehicleRepository.findAllAssignedToDriverOnDateAndTypeAndSequence(
                driverId, today, DispatchType.NIGHT, 1)).thenReturn(List.of(vehicle));
        when(stopRepository.findFirstByVehicleIdAndSequence(vehicleId, 1)).thenReturn(Optional.of(stop));
        when(signAndSendCopyService.execute(dispatchId, 1, 1, driverId, signRequest))
                .thenReturn(SignAndSendCopyService.SignAndSendCopyResult.success(
                        UUID.randomUUID(), new byte[]{1, 2, 3}, LocalDateTime.now(), "010-****-4444"));

        ArologisDriverAppController controller = new ArologisDriverAppController(
                driverRepository,
                dispatchRepository,
                vehicleRepository,
                stopRepository,
                signatureRepository,
                locationRepository,
                slipClient,
                slipResolver,
                signAndSendCopyService);

        var response = controller.signAndSendCopyToday(DispatchType.NIGHT, 1, 1, request, signRequest);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getFirst("X-Copy-Recipient-Phone-Masked"))
                .isEqualTo("010-****-4444");
    }
}
