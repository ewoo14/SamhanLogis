package com.samhanair.logis.arologis.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipClient.SlipFullDetail;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.arologis.service.copy.PlaywrightCopyRenderer;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Phase F (D-DF-07) — sign-and-send-copy IT 공통 베이스.
 *
 * <p>External clients @MockBean 격리 ([feedback_it_mockbean_external_clients]):
 * <ul>
 *   <li>{@link SlipClient} — slip-service 양쪽 저장 + recipientPhone + fullDetail mock</li>
 *   <li>{@link PlaywrightCopyRenderer} — Chromium binary 미설치 환경 호환</li>
 *   <li>{@link PartnerClient}, {@link NotificationClient}, {@link SlipServiceClient} — 무관 client lenient</li>
 * </ul>
 *
 * <p>Docker 미가용 환경 (Windows + Docker Desktop npipe) 에서는 AbstractPostgresIT 가 자동 skip
 * ([feedback_testcontainers_windows_docker]).
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
abstract class AbstractSignAndSendCopyIT extends AbstractPostgresIT {

    @Autowired protected MockMvc mockMvc;
    @Autowired protected ObjectMapper objectMapper;
    @Autowired protected DispatchRepository dispatchRepository;
    @Autowired protected VehicleRepository vehicleRepository;
    @Autowired protected VehicleStopRepository stopRepository;
    @Autowired protected DriverRepository driverRepository;
    @Autowired protected SignatureRepository signatureRepository;
    @Autowired protected DriverLocationRepository locationRepository;

    @MockBean protected PartnerClient partnerClient;
    @MockBean protected SlipClient slipClient;
    @MockBean protected NotificationClient notificationClient;
    @MockBean protected SlipServiceClient slipServiceClient;
    @MockBean protected PlaywrightCopyRenderer renderer;

    protected UUID userId;
    protected UUID driverId;
    protected UUID dispatchId;
    protected UUID vehicleId;
    protected UUID stopId;
    protected UUID resolvedSlipId;

    @BeforeEach
    void baseSetUp() {
        // 1. cleanup (FK 순서)
        signatureRepository.deleteAll();
        locationRepository.deleteAll();
        stopRepository.deleteAll();
        vehicleRepository.deleteAll();
        dispatchRepository.deleteAll();
        driverRepository.deleteAll();

        // 2. 무관 client mock (lenient — 테스트마다 사용 여부 다름)
        lenient().when(partnerClient.findByCodes(any())).thenReturn(List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(notificationClient.send(any(), any(), any(), any())).thenReturn(true);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of());

        // 3. seed driver + dispatch + vehicle + stop
        userId = UUID.randomUUID();
        Driver driver = driverRepository.save(Driver.of(
                "DR-PHASE-F-001", "010-1111-2222", "1톤",
                DriverSource.INTERNAL, true, userId));
        driverId = driver.getId();

        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.now(), DispatchType.NIGHT, "Phase F IT"));
        dispatchId = dispatch.getId();

        Vehicle vehicle = vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_1, "차량1"));
        // vehicle.assignedDriverId = driverId 권한 검증 통과를 위해
        vehicle.assignDriver(driverId, MatchSource.INTERNAL_APP, "EXT-001");
        vehicleRepository.save(vehicle);
        vehicleId = vehicle.getId();

        VehicleStop stop = stopRepository.save(VehicleStop.of(
                vehicle.getId(), 1, "정차 1", "서울시 강남구",
                "테스트사", 999L, null, StopStatus.PENDING));
        stopId = stop.getId();

        // 4. SlipClient 기본 stub — by-partner-code (kakaoSeq=999) → resolvedSlipId
        resolvedSlipId = UUID.randomUUID();
        lenient().when(slipClient.findRecentSlipIdByPartnerCode(anyString()))
                .thenReturn(Optional.of(resolvedSlipId));
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(true);
        lenient().when(slipClient.findRecipientPhone(any())).thenReturn(Optional.of("01012345678"));
        lenient().when(slipClient.findFullDetail(any())).thenReturn(Optional.of(
                new SlipFullDetail(
                        "2026/05/15-1", LocalDate.now(), "테스트사",
                        "서울시 강남구",
                        List.of(),
                        new BigDecimal("10000"), new BigDecimal("1000"), new BigDecimal("11000"),
                        "본사창고")));
    }

    protected String validRequestBody() throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "driverSignatureBase64", "iVBORw0KGgo=",
                "recipientSignatureBase64", "iVBORw0KGgo=",
                "capturedAt", LocalDateTime.now().toString(),
                "gpsLat", "37.4979",
                "gpsLng", "127.0276"));
    }
}
