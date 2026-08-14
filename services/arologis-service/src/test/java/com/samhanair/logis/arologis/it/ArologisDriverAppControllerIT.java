package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverLocationSource;
import com.samhanair.logis.arologis.domain.DriverSource;
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
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * Driver-app endpoint 시나리오 (6 case) — Phase 10 W10-3 종합 TM 채택 fix (BE-3 / QA-3 통합).
 *
 * <ol>
 *   <li>X-User-Id / X-User-Role 헤더 누락 → 403 (Spring Security)</li>
 *   <li>X-User-Role 만 있고 X-User-Id 없음 → 403</li>
 *   <li>GET /driver-app/arologis/dispatches/today 200 (정상 driver, appUserId 매칭)</li>
 *   <li>POST /driver-app/arologis/locations 201/200 (source: APP_GPS_BACKGROUND 송신 → server 가 enum 변환 검증)</li>
 *   <li>POST /driver-app/arologis/dispatches/{id}/vehicles/{seq}/stops/{stopSeq}/sign 201/200</li>
 *   <li>본 어플 미등록 driver (appUserId 무관) → locations endpoint 404</li>
 * </ol>
 *
 * <p>{@code AbstractPostgresIT} (W10-1 패턴) + 4 외부 client {@code @MockBean} 격리 의무.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class ArologisDriverAppControllerIT extends AbstractPostgresIT {

    private static final String UUID_PATTERN =
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private DispatchRepository dispatchRepository;
    @Autowired
    private VehicleRepository vehicleRepository;
    @Autowired
    private VehicleStopRepository stopRepository;
    @Autowired
    private DriverRepository driverRepository;
    @Autowired
    private SignatureRepository signatureRepository;
    @Autowired
    private DriverLocationRepository locationRepository;

    @MockBean
    private PartnerClient partnerClient;
    // 2026-05-14 분리 — UserClient @MockBean 제거 (자체 user 도메인 도입).
    @MockBean
    private SlipClient slipClient;
    @MockBean
    private NotificationClient notificationClient;
    /** PR-E1 BE-3 — 출고전표 자동 조회 client (가배차/미배차/지방 분류 source). */
    @MockBean
    private SlipServiceClient slipServiceClient;
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);

        lenient().when(partnerClient.findByCodes(any())).thenReturn(java.util.List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(java.util.List.of());

        // FK 순서 cleanup
        signatureRepository.deleteAll();
        locationRepository.deleteAll();
        stopRepository.deleteAll();
        vehicleRepository.deleteAll();
        dispatchRepository.deleteAll();
        driverRepository.deleteAll();
    }

    /** Case 1 — X-User-* 헤더 누락 → 403 (Spring Security 인증 누락). */
    @Test
    void today_without_auth_headers_returns_401() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/driver-app/arologis/dispatches/today"))
                .andExpect(MockMvcResultMatchers.status().isUnauthorized());
    }

    /** Case 2 — X-User-Role 만 있고 X-User-Id 없음 → 403 (HeaderAuthenticationFilter 가 인증 적재 안 함). */
    @Test
    void today_with_role_only_returns_401() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/driver-app/arologis/dispatches/today")
                        .header("X-User-Role", "AROLOGIS_DRIVER"))
                .andExpect(MockMvcResultMatchers.status().isUnauthorized());
    }

    /** Case 3 — GET today 정상 driver (appUserId 매칭) → 200. */
    @Test
    void today_with_internal_driver_returns_200() throws Exception {
        UUID userId = UUID.randomUUID();
        Driver driver = driverRepository.save(Driver.of(
                "DR-IT-001", "010-1234-5678", "1톤",
                DriverSource.INTERNAL, true, userId));

        // dispatch + vehicle 1개 (driver 배정)
        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.now(), DispatchType.NIGHT, "test"));
        Vehicle vehicle = Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_1, "테스트");
        vehicle.assignDriver(driver.getId(),
                com.samhanair.logis.arologis.domain.MatchSource.INTERNAL_APP, null);
        vehicleRepository.save(vehicle);
        stopRepository.save(VehicleStop.of(
                vehicle.getId(), 1, "서울 강남구 테스트로 1 (테스트상사-1234)",
                "서울 강남구 테스트로 1", "테스트상사", 1234L, "문 앞 전달", StopStatus.PENDING));
        Dispatch yesterday = dispatchRepository.save(
                Dispatch.of(LocalDate.now().minusDays(1), DispatchType.NIGHT, "old"));
        Vehicle oldVehicle = Vehicle.of(yesterday.getId(), 1, VehicleTonnage.TONNAGE_1, "어제");
        oldVehicle.assignDriver(driver.getId(),
                com.samhanair.logis.arologis.domain.MatchSource.INTERNAL_APP, null);
        vehicleRepository.save(oldVehicle);
        Dispatch tomorrow = dispatchRepository.save(
                Dispatch.of(LocalDate.now().plusDays(1), DispatchType.NIGHT, "future"));
        Vehicle futureVehicle = Vehicle.of(tomorrow.getId(), 1, VehicleTonnage.TONNAGE_1, "내일");
        futureVehicle.assignDriver(driver.getId(),
                com.samhanair.logis.arologis.domain.MatchSource.INTERNAL_APP, null);
        vehicleRepository.save(futureVehicle);

        mockMvc.perform(MockMvcRequestBuilders.get("/driver-app/arologis/dispatches/today")
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "AROLOGIS_DRIVER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data").isArray())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].dispatchId").doesNotExist())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].dispatchDate").value(LocalDate.now().toString()))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].dispatchType").value("NIGHT"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].vehicleSequence").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].label").value("테스트"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].stops[0].stopSequence").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].stops[0].parsedPartnerName").value("테스트상사"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].stops[0].parsedKakaoSeq").value(1234))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].stops[0].status").value("PENDING"));
    }

    /**
     * Case 4 — POST locations + source=APP_GPS_BACKGROUND + capturedAt ISO8601 → 200.
     *
     * <p>BE-1 (source 파싱) + BE-2 (capturedAt Instant.parse) 채택 fix 회귀 검증.
     */
    @Test
    void report_location_with_background_source_returns_200() throws Exception {
        UUID userId = UUID.randomUUID();
        driverRepository.save(Driver.of(
                "DR-IT-002", "010-2222-3333", "1톤",
                DriverSource.INTERNAL, true, userId));

        String capturedAt = Instant.parse("2026-05-07T01:23:45Z").toString();
        String body = objectMapper.writeValueAsString(Map.of(
                "latitude", "37.5665",
                "longitude", "126.9780",
                "capturedAt", capturedAt,
                "source", "APP_GPS_BACKGROUND"));

        mockMvc.perform(MockMvcRequestBuilders.post("/driver-app/arologis/locations")
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "AROLOGIS_DRIVER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.locationId").doesNotExist())
                // BE-1 회귀 — source 변환 결과가 APP_GPS_BACKGROUND 로 응답
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.source")
                        .value(DriverLocationSource.APP_GPS_BACKGROUND.name()))
                .andDo(result -> assertThat(result.getResponse().getContentAsString())
                        .doesNotContain("locationId")
                        .doesNotContainPattern(UUID_PATTERN));
    }

    /** Case 5 — POST sign 정상 → 200 + UUID-free response. */
    @Test
    void sign_for_existing_stop_returns_200() throws Exception {
        UUID userId = UUID.randomUUID();
        driverRepository.save(Driver.of(
                "DR-IT-003", "010-4444-5555", "1톤",
                DriverSource.INTERNAL, true, userId));

        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.now(), DispatchType.NIGHT, "sign test"));
        Vehicle vehicle = vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_1, "차량1"));
        stopRepository.save(VehicleStop.of(
                vehicle.getId(), 1, "테스트 정차",
                "서울시 강남구 어딘가", "테스트사", 1234L, null, StopStatus.PENDING));

        String body = objectMapper.writeValueAsString(Map.of(
                "imageRef", "s3://test/sig.png",
                "latitude", "37.5",
                "longitude", "127.0"));

        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/driver-app/arologis/dispatches/" + dispatch.getId()
                                + "/vehicles/1/stops/1/sign")
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "AROLOGIS_DRIVER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.signatureId").doesNotExist())
                .andDo(result -> assertThat(result.getResponse().getContentAsString())
                        .doesNotContain("signatureId")
                        .doesNotContainPattern(UUID_PATTERN));

        // stop 미존재 sequence 는 404 검증 (Case 6 분리)
    }

    /** Case 6 — 본 어플 미등록 driver (appUserId 매칭 0) → locations 404. */
    @Test
    void report_location_for_unregistered_driver_returns_404() throws Exception {
        UUID unknownUserId = UUID.randomUUID();
        String body = objectMapper.writeValueAsString(Map.of(
                "latitude", "37.5",
                "longitude", "127.0"));

        mockMvc.perform(MockMvcRequestBuilders.post("/driver-app/arologis/locations")
                        .header("X-User-Id", unknownUserId.toString())
                        .header("X-User-Role", "AROLOGIS_DRIVER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isNotFound());
    }
}
