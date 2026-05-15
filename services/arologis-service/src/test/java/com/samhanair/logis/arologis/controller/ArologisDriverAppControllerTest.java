package com.samhanair.logis.arologis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
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
import com.samhanair.logis.arologis.web.dto.detail.DriverSlipDetailResponse;
import com.samhanair.logis.arologis.web.dto.photo.DriverPhotoType;
import com.samhanair.logis.arologis.web.dto.photo.DriverPhotoUploadResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
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
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
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

    @Test
    void uploadPhotoToday_uploads_delivery_photo_without_uuid_response_contract() {
        UUID userId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        LocalDateTime capturedAt = LocalDateTime.of(2026, 5, 15, 13, 30);
        LocalDateTime uploadedAt = LocalDateTime.of(2026, 5, 15, 13, 31);
        MockMultipartFile file = new MockMultipartFile(
                "file", "delivery-proof.jpg", "image/jpeg", new byte[]{1, 2, 3, 4});

        Driver driver = Driver.of("DR-PHOTO-001", "010-5555-6666", "1톤",
                DriverSource.INTERNAL, true, userId);
        ReflectionTestUtils.setField(driver, "id", driverId);
        Vehicle vehicle = Vehicle.of(dispatchId, 2, VehicleTonnage.TONNAGE_1, "강남");
        ReflectionTestUtils.setField(vehicle, "id", vehicleId);
        vehicle.assignDriver(driverId, MatchSource.INTERNAL_APP, null);
        VehicleStop stop = VehicleStop.of(vehicleId, 3, "서울 강남구 테스트로 1 (사진상사-9876)",
                "서울 강남구 테스트로 1", "사진상사", 9876L, null, StopStatus.PENDING);

        when(request.getHeader("X-User-Id")).thenReturn(userId.toString());
        when(driverRepository.findByAppUserId(userId)).thenReturn(Optional.of(driver));
        when(vehicleRepository.findAllAssignedToDriverOnDateAndTypeAndSequence(
                driverId, today, DispatchType.NIGHT, 2)).thenReturn(List.of(vehicle));
        when(stopRepository.findFirstByVehicleIdAndSequence(vehicleId, 3)).thenReturn(Optional.of(stop));
        when(slipResolver.resolveSlipId(stop)).thenReturn(Optional.of(slipId));
        when(slipClient.uploadAttachment(
                slipId, "DELIVERY", file,
                new BigDecimal("37.4979000"), new BigDecimal("127.0276000"),
                capturedAt, driver.getDriverCode()))
                .thenReturn(Optional.of(new SlipClient.UploadedAttachment(
                        "DELIVERY", "delivery-proof.jpg", 4L, "image/jpeg", capturedAt, uploadedAt)));

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

        var response = controller.uploadStopPhotoToday(DispatchType.NIGHT, 2, 3, DriverPhotoType.DELIVERY,
                request, file, 9876L,
                new BigDecimal("37.4979000"), new BigDecimal("127.0276000"), capturedAt);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        ApiResponse<DriverPhotoUploadResponse> body =
                (ApiResponse<DriverPhotoUploadResponse>) response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getData()).isEqualTo(new DriverPhotoUploadResponse(
                "DELIVERY", "delivery-proof.jpg", 4L, "image/jpeg", capturedAt, uploadedAt));
        assertThat(Arrays.stream(DriverPhotoUploadResponse.class.getRecordComponents())
                .map(component -> component.getName()))
                .doesNotContain("id", "attachmentId", "slipId", "downloadUrl");
    }

    @Test
    void uploadPhotoToday_rejects_mismatched_parsedKakaoSeq_before_slip_mapping() {
        UUID userId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        MockMultipartFile file = new MockMultipartFile(
                "file", "inspection.png", "image/png", new byte[]{1, 2});

        Driver driver = Driver.of("DR-PHOTO-002", "010-7777-8888", "1톤",
                DriverSource.INTERNAL, true, userId);
        ReflectionTestUtils.setField(driver, "id", driverId);
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "강남");
        ReflectionTestUtils.setField(vehicle, "id", vehicleId);
        vehicle.assignDriver(driverId, MatchSource.INTERNAL_APP, null);
        VehicleStop stop = VehicleStop.of(vehicleId, 1, "서울 강남구 테스트로 1 (검수상사-1111)",
                "서울 강남구 테스트로 1", "검수상사", 1111L, null, StopStatus.PENDING);

        when(request.getHeader("X-User-Id")).thenReturn(userId.toString());
        when(driverRepository.findByAppUserId(userId)).thenReturn(Optional.of(driver));
        when(vehicleRepository.findAllAssignedToDriverOnDateAndTypeAndSequence(
                driverId, today, DispatchType.NIGHT, 1)).thenReturn(List.of(vehicle));
        when(stopRepository.findFirstByVehicleIdAndSequence(vehicleId, 1)).thenReturn(Optional.of(stop));

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

        var response = controller.uploadStopPhotoToday(DispatchType.NIGHT, 1, 1, DriverPhotoType.INSPECTION,
                request, file, 2222L, null, null, null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isInstanceOf(ApiResponse.class);
        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        assertThat(body.isSuccess()).isFalse();
        assertThat(body.getCode()).isEqualTo("INVALID_INPUT");
    }

    @Test
    void uploadPhotoToday_returns_422_when_slip_mapping_not_found() {
        UUID userId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        MockMultipartFile file = new MockMultipartFile(
                "file", "delivery-proof.jpg", "image/jpeg", new byte[]{1, 2, 3});

        Driver driver = Driver.of("DR-PHOTO-003", "010-9999-0000", "1톤",
                DriverSource.INTERNAL, true, userId);
        ReflectionTestUtils.setField(driver, "id", driverId);
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "강남");
        ReflectionTestUtils.setField(vehicle, "id", vehicleId);
        vehicle.assignDriver(driverId, MatchSource.INTERNAL_APP, null);
        VehicleStop stop = VehicleStop.of(vehicleId, 1, "서울 강남구 테스트로 1 (미매핑-3333)",
                "서울 강남구 테스트로 1", "미매핑", 3333L, null, StopStatus.PENDING);

        when(request.getHeader("X-User-Id")).thenReturn(userId.toString());
        when(driverRepository.findByAppUserId(userId)).thenReturn(Optional.of(driver));
        when(vehicleRepository.findAllAssignedToDriverOnDateAndTypeAndSequence(
                driverId, today, DispatchType.NIGHT, 1)).thenReturn(List.of(vehicle));
        when(stopRepository.findFirstByVehicleIdAndSequence(vehicleId, 1)).thenReturn(Optional.of(stop));
        when(slipResolver.resolveSlipId(stop)).thenReturn(Optional.empty());

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

        var response = controller.uploadStopPhotoToday(DispatchType.NIGHT, 1, 1, DriverPhotoType.DELIVERY,
                request, file, 3333L, null, null, null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.isSuccess()).isFalse();
        assertThat(body.getCode()).isEqualTo("SLIP_MAPPING_NOT_FOUND");
    }

    @Test
    void uploadPhotoToday_maps_slip_client_failure_to_json_error() {
        UUID userId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        MockMultipartFile file = new MockMultipartFile(
                "file", "delivery-proof.jpg", "image/jpeg", new byte[]{1, 2, 3});

        Driver driver = Driver.of("DR-PHOTO-004", "010-1212-3434", "1톤",
                DriverSource.INTERNAL, true, userId);
        ReflectionTestUtils.setField(driver, "id", driverId);
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "강남");
        ReflectionTestUtils.setField(vehicle, "id", vehicleId);
        vehicle.assignDriver(driverId, MatchSource.INTERNAL_APP, null);
        VehicleStop stop = VehicleStop.of(vehicleId, 1, "서울 강남구 테스트로 1 (실패상사-4444)",
                "서울 강남구 테스트로 1", "실패상사", 4444L, null, StopStatus.PENDING);

        when(request.getHeader("X-User-Id")).thenReturn(userId.toString());
        when(driverRepository.findByAppUserId(userId)).thenReturn(Optional.of(driver));
        when(vehicleRepository.findAllAssignedToDriverOnDateAndTypeAndSequence(
                driverId, today, DispatchType.NIGHT, 1)).thenReturn(List.of(vehicle));
        when(stopRepository.findFirstByVehicleIdAndSequence(vehicleId, 1)).thenReturn(Optional.of(stop));
        when(slipResolver.resolveSlipId(stop)).thenReturn(Optional.of(slipId));
        when(slipClient.uploadAttachment(slipId, "DELIVERY", file, null, null, null, driver.getDriverCode()))
                .thenReturn(Optional.empty());

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

        var response = controller.uploadStopPhotoToday(DispatchType.NIGHT, 1, 1, DriverPhotoType.DELIVERY,
                request, file, 4444L, null, null, null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.isSuccess()).isFalse();
        assertThat(body.getCode()).isEqualTo("SLIP_ATTACHMENT_UPLOAD_FAILED");
    }

    @Test
    void slipDetailToday_returns_uuid_free_read_model() {
        UUID userId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        LocalDate today = LocalDate.now(ZoneId.systemDefault());

        Driver driver = Driver.of("DR-SLIP-001", "010-1111-2222", "1톤",
                DriverSource.INTERNAL, true, userId);
        ReflectionTestUtils.setField(driver, "id", driverId);
        Vehicle vehicle = Vehicle.of(dispatchId, 4, VehicleTonnage.TONNAGE_1, "강남");
        ReflectionTestUtils.setField(vehicle, "id", vehicleId);
        vehicle.assignDriver(driverId, MatchSource.INTERNAL_APP, null);
        VehicleStop stop = VehicleStop.of(vehicleId, 2, "서울 강남구 테스트로 1 (상세상사-5555)",
                "서울 강남구 테스트로 1", "상세상사", 5555L, "문 앞", StopStatus.PENDING);
        SlipClient.SlipFullDetail detail = new SlipClient.SlipFullDetail(
                "SL-20260515-0001",
                LocalDate.of(2026, 5, 15),
                "상세상사",
                "서울 강남구 테스트로 1",
                List.of(new SlipClient.SlipFullLine(
                        "테스트 상품", "BOX", 2, new BigDecimal("10000"), new BigDecimal("20000"))),
                new BigDecimal("20000"),
                new BigDecimal("2000"),
                new BigDecimal("22000"),
                "본사창고");

        when(request.getHeader("X-User-Id")).thenReturn(userId.toString());
        when(driverRepository.findByAppUserId(userId)).thenReturn(Optional.of(driver));
        when(vehicleRepository.findAllAssignedToDriverOnDateAndTypeAndSequence(
                driverId, today, DispatchType.NIGHT, 4)).thenReturn(List.of(vehicle));
        when(stopRepository.findFirstByVehicleIdAndSequence(vehicleId, 2)).thenReturn(Optional.of(stop));
        when(slipResolver.resolveSlipId(stop)).thenReturn(Optional.of(slipId));
        when(slipClient.findFullDetail(slipId)).thenReturn(Optional.of(detail));

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

        var response = controller.slipDetailToday(DispatchType.NIGHT, 4, 2, request, 5555L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        ApiResponse<DriverSlipDetailResponse> body =
                (ApiResponse<DriverSlipDetailResponse>) response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.isSuccess()).isTrue();
        DriverSlipDetailResponse data = body.getData();
        assertThat(data.dispatchType()).isEqualTo(DispatchType.NIGHT);
        assertThat(data.vehicleSequence()).isEqualTo(4);
        assertThat(data.stopSequence()).isEqualTo(2);
        assertThat(data.parsedKakaoSeq()).isEqualTo(5555L);
        assertThat(data.partnerName()).isEqualTo("상세상사");
        assertThat(data.stopLabel()).isEqualTo("문 앞");
        assertThat(data.slipNo()).isEqualTo("SL-20260515-0001");
        assertThat(data.lines())
                .singleElement()
                .satisfies(line -> {
                    assertThat(line.productName()).isEqualTo("테스트 상품");
                    assertThat(line.quantity()).isEqualTo(2);
                    assertThat(line.lineTotal()).isEqualByComparingTo("20000");
                });
        assertThat(Arrays.stream(DriverSlipDetailResponse.class.getRecordComponents())
                .map(component -> component.getName()))
                .doesNotContain("id", "dispatchId", "vehicleId", "stopId", "slipId", "downloadUrl");
        assertThat(Arrays.stream(DriverSlipDetailResponse.Line.class.getRecordComponents())
                .map(component -> component.getName()))
                .doesNotContain("id", "dispatchId", "vehicleId", "stopId", "slipId", "downloadUrl");
    }

    @Test
    void slipDetailToday_rejects_mismatched_parsedKakaoSeq_before_slip_lookup() {
        UUID userId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        LocalDate today = LocalDate.now(ZoneId.systemDefault());

        Driver driver = Driver.of("DR-SLIP-002", "010-3333-4444", "1톤",
                DriverSource.INTERNAL, true, userId);
        ReflectionTestUtils.setField(driver, "id", driverId);
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "강남");
        ReflectionTestUtils.setField(vehicle, "id", vehicleId);
        vehicle.assignDriver(driverId, MatchSource.INTERNAL_APP, null);
        VehicleStop stop = VehicleStop.of(vehicleId, 1, "서울 강남구 테스트로 1 (불일치상사-1111)",
                "서울 강남구 테스트로 1", "불일치상사", 1111L, null, StopStatus.PENDING);

        when(request.getHeader("X-User-Id")).thenReturn(userId.toString());
        when(driverRepository.findByAppUserId(userId)).thenReturn(Optional.of(driver));
        when(vehicleRepository.findAllAssignedToDriverOnDateAndTypeAndSequence(
                driverId, today, DispatchType.NIGHT, 1)).thenReturn(List.of(vehicle));
        when(stopRepository.findFirstByVehicleIdAndSequence(vehicleId, 1)).thenReturn(Optional.of(stop));

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

        var response = controller.slipDetailToday(DispatchType.NIGHT, 1, 1, request, 2222L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.isSuccess()).isFalse();
        assertThat(body.getCode()).isEqualTo("INVALID_INPUT");
        verifyNoInteractions(slipResolver, slipClient);
    }

    @Test
    void slipDetailToday_returns_422_when_slip_mapping_not_found() {
        UUID userId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        LocalDate today = LocalDate.now(ZoneId.systemDefault());

        Driver driver = Driver.of("DR-SLIP-003", "010-5555-6666", "1톤",
                DriverSource.INTERNAL, true, userId);
        ReflectionTestUtils.setField(driver, "id", driverId);
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "강남");
        ReflectionTestUtils.setField(vehicle, "id", vehicleId);
        vehicle.assignDriver(driverId, MatchSource.INTERNAL_APP, null);
        VehicleStop stop = VehicleStop.of(vehicleId, 1, "서울 강남구 테스트로 1 (미매핑상사-3333)",
                "서울 강남구 테스트로 1", "미매핑상사", 3333L, null, StopStatus.PENDING);

        when(request.getHeader("X-User-Id")).thenReturn(userId.toString());
        when(driverRepository.findByAppUserId(userId)).thenReturn(Optional.of(driver));
        when(vehicleRepository.findAllAssignedToDriverOnDateAndTypeAndSequence(
                driverId, today, DispatchType.NIGHT, 1)).thenReturn(List.of(vehicle));
        when(stopRepository.findFirstByVehicleIdAndSequence(vehicleId, 1)).thenReturn(Optional.of(stop));
        when(slipResolver.resolveSlipId(stop)).thenReturn(Optional.empty());

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

        var response = controller.slipDetailToday(DispatchType.NIGHT, 1, 1, request, 3333L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.isSuccess()).isFalse();
        assertThat(body.getCode()).isEqualTo("SLIP_MAPPING_NOT_FOUND");
    }

    @Test
    void slipDetailToday_maps_detail_fetch_failure_to_502() {
        UUID userId = UUID.randomUUID();
        UUID driverId = UUID.randomUUID();
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        LocalDate today = LocalDate.now(ZoneId.systemDefault());

        Driver driver = Driver.of("DR-SLIP-004", "010-7777-8888", "1톤",
                DriverSource.INTERNAL, true, userId);
        ReflectionTestUtils.setField(driver, "id", driverId);
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "강남");
        ReflectionTestUtils.setField(vehicle, "id", vehicleId);
        vehicle.assignDriver(driverId, MatchSource.INTERNAL_APP, null);
        VehicleStop stop = VehicleStop.of(vehicleId, 1, "서울 강남구 테스트로 1 (상세실패상사-4444)",
                "서울 강남구 테스트로 1", "상세실패상사", 4444L, null, StopStatus.PENDING);

        when(request.getHeader("X-User-Id")).thenReturn(userId.toString());
        when(driverRepository.findByAppUserId(userId)).thenReturn(Optional.of(driver));
        when(vehicleRepository.findAllAssignedToDriverOnDateAndTypeAndSequence(
                driverId, today, DispatchType.NIGHT, 1)).thenReturn(List.of(vehicle));
        when(stopRepository.findFirstByVehicleIdAndSequence(vehicleId, 1)).thenReturn(Optional.of(stop));
        when(slipResolver.resolveSlipId(stop)).thenReturn(Optional.of(slipId));
        when(slipClient.findFullDetail(slipId)).thenReturn(Optional.empty());

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

        var response = controller.slipDetailToday(DispatchType.NIGHT, 1, 1, request, 4444L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.isSuccess()).isFalse();
        assertThat(body.getCode()).isEqualTo("SLIP_DETAIL_FETCH_FAILED");
    }
}
