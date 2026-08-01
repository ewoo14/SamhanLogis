package com.samhanair.logis.arologis.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.NotificationSendOutcome;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.client.SlipServiceClient.OutboundSlipSummary;
import com.samhanair.logis.arologis.domain.ArologisNotifyChannel;
import com.samhanair.logis.arologis.domain.ArologisNotifyStatus;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchNotification;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverLocation;
import com.samhanair.logis.arologis.domain.DriverLocationSource;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.Signature;
import com.samhanair.logis.arologis.domain.SignatureSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.repository.DispatchNotificationRepository;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * Admin endpoint 시나리오 (20 case) — Phase 10 W10-1 + 후속 확장.
 *
 * <ol>
 *   <li>parse-kakao 정상 (사용자 카톡 예시 입력 → 13 차량 응답)</li>
 *   <li>parse-kakao 헤더 없음 → 400</li>
 *   <li>dispatches POST 저장 정상 → 200 + dispatchId</li>
 *   <li>dispatches GET list 정상 → 200</li>
 *   <li>dispatches/{id} GET 미존재 → 404</li>
 *   <li>auto-match 호출 (Mock matcher) → 200 + matched 카운트</li>
 *   <li>assign-driver 미존재 driver → 404</li>
 *   <li>stop status 갱신 미존재 → 404</li>
 *   <li>drivers list 정상 → 200</li>
 *   <li>dispatches/{id} GET → sandboxMode·vendorOrderId 직렬화 (계약 정합 #804)</li>
 *   <li>manual-location 미존재 vehicle sequence → 404 (PR #818 리뷰 FIX 4)</li>
 *   <li>manual-location 위도 범위 초과(200) → 400 Bean Validation (PR #818 리뷰 FIX 4)</li>
 *   <li>… PR-E1/후속 시나리오 (총 20 tests, 대표 목록)</li>
 * </ol>
 *
 * <p>sandbox-mode 는 {@code @TestPropertySource} 로 true 고정 — 향후 전역 test 프로파일이
 * false 로 바꿔도 본 IT 의 sandboxMode 기대값이 깨지지 않도록 명시 고정한다.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
@TestPropertySource(properties = "samhan.arologis.matcher.insung-quick.sandbox-mode=true")
class ArologisAdminControllerIT extends AbstractPostgresIT {

    private static final String ADMIN_ACCOUNT_ID = "10000000-0000-0000-0000-000000000401";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private DispatchRepository dispatchRepository;
    @Autowired
    private DispatchNotificationRepository dispatchNotificationRepository;
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
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;
    /** PR-E1 BE-3 — 출고전표 자동 조회 client (가배차/미배차/지방 endpoint source). */
    @MockBean
    private SlipServiceClient slipServiceClient;

    private static final String SAMPLE_KAKAO = """
            8일착 야상입니다
            1. 상일+초월
            -인천 남동구 구월동(에스엠하나공조-214)아침8시
            -인천 서구 봉수대로(대한공조-170)아침9시반
            1톤
            """;

    @BeforeEach
    void setUp() {
        lenient().when(partnerClient.findByCodes(any())).thenReturn(java.util.List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
        lenient().when(notificationClient.sendDispatchSms(anyString(), anyString(), anyString()))
                .thenReturn(new NotificationSendOutcome(true, ArologisNotifyStatus.SUCCESS, null));
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        // PR-E1 BE-3 — 기본 빈 리스트 (graceful empty). 개별 테스트가 override 가능.
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(java.util.List.of());

        // signatures → vehicle_stops → vehicles → dispatches FK 순서로 cleanup
        dispatchNotificationRepository.deleteAll();
        signatureRepository.deleteAll();
        locationRepository.deleteAll();
        stopRepository.deleteAll();
        vehicleRepository.deleteAll();
        dispatchRepository.deleteAll();
        driverRepository.deleteAll();
    }

    @Test
    void parseKakao_returns_200() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("kakaoText", SAMPLE_KAKAO));
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/arologis/dispatches/parse-kakao")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.dispatchType").value("NIGHT"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles").isArray());
    }

    @Test
    void parseKakao_with_invalid_text_returns_400() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("kakaoText", "잘못된 메시지"));
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/arologis/dispatches/parse-kakao")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isBadRequest());
    }

    @Test
    void create_dispatch_returns_200_with_id() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("kakaoText", SAMPLE_KAKAO));
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/arologis/dispatches")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.dispatchId").exists());
    }

    @Test
    void list_dispatches_returns_200_array() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/arologis/dispatches")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data").isArray());
    }

    @Test
    void find_missing_dispatch_returns_404() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/arologis/dispatches/" + UUID.randomUUID())
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isNotFound());
    }

    @Test
    void find_dispatch_returns_sandboxMode_and_vendorOrderId() throws Exception {
        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.of(2026, 7, 14), DispatchType.EXPRESS, "804 detail"));
        Vehicle vehicle = vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_1, "상일+초월"));
        // matchSource=EXTERNAL_INSUNG_QUICK 배정 — FE INSUNG pill 게이팅 계약을 e2e 자동 고정(F1-QA).
        vehicle.assignDriver(UUID.randomUUID(), MatchSource.EXTERNAL_INSUNG_QUICK, "EXT-REF-804");
        vehicle.updateVendorOrderId("INSUNG-ORDER-804");
        vehicleRepository.save(vehicle);
        stopRepository.save(VehicleStop.of(
                vehicle.getId(),
                1,
                "-인천 남동구 구월동(에스엠하나공조-214)",
                "인천 남동구 구월동",
                "에스엠하나공조",
                214L,
                null,
                StopStatus.PENDING));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/arologis/dispatches/" + dispatch.getId())
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.sandboxMode").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles[0].vendorOrderId")
                        .value("INSUNG-ORDER-804"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles[0].matchSource")
                        .value("EXTERNAL_INSUNG_QUICK"));
    }

    @Test
    void find_dispatch_returns_notifyResults() throws Exception {
        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.of(2026, 7, 14), DispatchType.EXPRESS, "notify detail"));
        Vehicle vehicle = vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_1, "상일+초월"));
        dispatchNotificationRepository.save(DispatchNotification.of(
                dispatch.getId(),
                vehicle.getId(),
                ArologisNotifyChannel.ALIGO,
                ArologisNotifyStatus.SUCCESS,
                LocalDateTime.of(2026, 7, 14, 10, 30),
                "010-1111-2222",
                null));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/arologis/dispatches/" + dispatch.getId())
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles[0].notifyResults[0].channel")
                        .value("aligo"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles[0].notifyResults[0].status")
                        .value("SUCCESS"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles[0].notifyResults[0].recipientPhone")
                        .value("010-1111-2222"));
    }

    @Test
    void find_dispatch_returns_gpsSources_from_app_gps_and_insung_signature() throws Exception {
        Driver driver = driverRepository.save(Driver.of(
                "DRV-GPS-001", "010-1111-2222", "1톤", DriverSource.INTERNAL, true, null));
        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.of(2026, 7, 14), DispatchType.EXPRESS, "gps detail"));
        Vehicle vehicle = vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_1, "상일+초월"));
        vehicle.assignDriver(driver.getId(), MatchSource.MANUAL, null);
        vehicleRepository.save(vehicle);
        VehicleStop stop = stopRepository.save(VehicleStop.of(
                vehicle.getId(),
                1,
                "-인천 남동구 구월동(에스엠하나공조-214)",
                "인천 남동구 구월동",
                "에스엠하나공조",
                214L,
                null,
                StopStatus.PENDING));
        LocalDateTime now = LocalDateTime.now();
        locationRepository.save(DriverLocation.of(
                driver.getId(),
                new BigDecimal("37.2000000"),
                new BigDecimal("127.2000000"),
                now.minusSeconds(10),
                DriverLocationSource.APP_GPS_ACTIVE));
        signatureRepository.save(Signature.of(
                stop.getId(),
                SignatureSource.EXTERNAL_INSUNG_LBS,
                "image-ref",
                now.minusMinutes(5),
                new BigDecimal("37.1000000"),
                new BigDecimal("127.1000000")));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/arologis/dispatches/" + dispatch.getId())
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles[0].gpsSources[0].source")
                        .value("EXTERNAL_INSUNG_LBS"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles[0].gpsSources[0].active")
                        .value(false))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles[0].gpsSources[0].latitude")
                        .value(37.1000000))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles[0].gpsSources[1].source")
                        .value("APP_GPS_ACTIVE"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles[0].gpsSources[1].active")
                        .value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles[0].gpsSources[1].longitude")
                        .value(127.2000000));
    }

    @Test
    void manual_location_post_records_manual_source_and_detail_returns_it() throws Exception {
        Driver driver = driverRepository.save(Driver.of(
                "DRV-MANUAL-001", "010-1111-3333", "1톤", DriverSource.MANUAL, false, null));
        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.of(2026, 7, 14), DispatchType.EXPRESS, "manual gps"));
        Vehicle vehicle = vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_1, "상일"));
        vehicle.assignDriver(driver.getId(), MatchSource.MANUAL, null);
        vehicleRepository.save(vehicle);
        stopRepository.save(VehicleStop.of(
                vehicle.getId(), 1, "-상일", "서울 강동구", "상일공조", 214L, null, StopStatus.PENDING));

        String body = objectMapper.writeValueAsString(Map.of(
                "latitude", new BigDecimal("37.3333333"),
                "longitude", new BigDecimal("127.3333333")));
        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/admin/arologis/dispatches/" + dispatch.getId() + "/vehicles/1/manual-location")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.dispatchId").doesNotExist())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.sequence").value("1"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.source").value("MANUAL"));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/arologis/dispatches/" + dispatch.getId())
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles[0].gpsSources[0].source")
                        .value("MANUAL"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.vehicles[0].gpsSources[0].latitude")
                        .value(37.3333333));
    }

    @Test
    void manual_location_post_without_assigned_driver_returns_400() throws Exception {
        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.of(2026, 7, 14), DispatchType.EXPRESS, "manual gps no driver"));
        vehicleRepository.save(Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_1, "상일"));
        String body = objectMapper.writeValueAsString(Map.of(
                "latitude", new BigDecimal("37.3333333"),
                "longitude", new BigDecimal("127.3333333")));

        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/admin/arologis/dispatches/" + dispatch.getId() + "/vehicles/1/manual-location")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isBadRequest());
    }

    @Test
    void manual_location_post_to_missing_vehicle_sequence_returns_404() throws Exception {
        // FIX 4 (PR #818 리뷰) — dispatch 는 존재하지만 vehicle sequence 1 이 저장된 적 없는 경우
        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.of(2026, 7, 14), DispatchType.EXPRESS, "manual gps missing vehicle"));
        String body = objectMapper.writeValueAsString(Map.of(
                "latitude", new BigDecimal("37.3333333"),
                "longitude", new BigDecimal("127.3333333")));

        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/admin/arologis/dispatches/" + dispatch.getId() + "/vehicles/1/manual-location")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isNotFound());
    }

    @Test
    void manual_location_post_with_out_of_range_latitude_returns_400() throws Exception {
        // FIX 4 (PR #818 리뷰) — ManualLocationRequest.latitude 는 @DecimalMax("90") Bean Validation
        Driver driver = driverRepository.save(Driver.of(
                "DRV-MANUAL-002", "010-1111-4444", "1톤", DriverSource.MANUAL, false, null));
        Dispatch dispatch = dispatchRepository.save(
                Dispatch.of(LocalDate.of(2026, 7, 14), DispatchType.EXPRESS, "manual gps invalid lat"));
        Vehicle vehicle = vehicleRepository.save(
                Vehicle.of(dispatch.getId(), 1, VehicleTonnage.TONNAGE_1, "상일"));
        vehicle.assignDriver(driver.getId(), MatchSource.MANUAL, null);
        vehicleRepository.save(vehicle);

        String body = objectMapper.writeValueAsString(Map.of(
                "latitude", new BigDecimal("200"),
                "longitude", new BigDecimal("127.3333333")));

        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/admin/arologis/dispatches/" + dispatch.getId() + "/vehicles/1/manual-location")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isBadRequest());
    }

    @Test
    void auto_match_returns_200() throws Exception {
        // 우선 dispatch 생성
        String createBody = objectMapper.writeValueAsString(Map.of("kakaoText", SAMPLE_KAKAO));
        String createResponse = mockMvc.perform(MockMvcRequestBuilders.post("/admin/arologis/dispatches")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(createBody))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andReturn().getResponse().getContentAsString();
        String dispatchId = objectMapper.readTree(createResponse)
                .get("data").get("dispatchId").asText();

        mockMvc.perform(MockMvcRequestBuilders.post("/admin/arologis/dispatches/" + dispatchId + "/auto-match")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.totalVehicles").exists())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.matched").exists());
    }

    @Test
    void assign_driver_unknown_code_returns_404() throws Exception {
        // dispatch 생성
        String createBody = objectMapper.writeValueAsString(Map.of("kakaoText", SAMPLE_KAKAO));
        String createResponse = mockMvc.perform(MockMvcRequestBuilders.post("/admin/arologis/dispatches")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(createBody))
                .andReturn().getResponse().getContentAsString();
        String dispatchId = objectMapper.readTree(createResponse)
                .get("data").get("dispatchId").asText();

        String body = objectMapper.writeValueAsString(Map.of("driverCode", "UNKNOWN-999"));
        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/admin/arologis/dispatches/" + dispatchId + "/vehicles/1/assign-driver")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isNotFound());
    }

    @Test
    void update_stop_status_missing_returns_404() throws Exception {
        UUID id = UUID.randomUUID();
        String body = objectMapper.writeValueAsString(Map.of("status", "ARRIVED"));
        mockMvc.perform(MockMvcRequestBuilders.put(
                        "/admin/arologis/dispatches/" + id + "/vehicles/1/stops/1/status")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isNotFound());
    }

    @Test
    void list_drivers_returns_200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/arologis/drivers")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data").isArray());
    }

    // ---- PR-E1 BE-3 — 가배차/미배차/지방가배차 3 endpoint 시나리오 ----

    @Test
    void preClassify_returns_200_with_region_groups() throws Exception {
        org.mockito.Mockito.when(slipServiceClient.getOutboundSlips(
                java.time.LocalDate.parse("2026-05-10"),
                java.time.LocalDate.parse("2026-05-10")))
                .thenReturn(java.util.List.of(
                        new OutboundSlipSummary("id-1", "2026/05/10-001", "P-2026-0001",
                                "에스엠하나공조", "서울 강남구 역삼동")
                ));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/arologis/dispatches/pre-classify")
                        .param("from", "2026-05-10")
                        .param("to", "2026-05-10")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.regionGroups").exists())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.unclassified").isArray());
    }

    @Test
    void unassigned_returns_200_with_entries() throws Exception {
        org.mockito.Mockito.when(slipServiceClient.getOutboundSlips(
                java.time.LocalDate.parse("2026-05-10"),
                java.time.LocalDate.parse("2026-05-10")))
                .thenReturn(java.util.List.of(
                        new OutboundSlipSummary("id-1", "2026/05/10-001", "P-2026-0001",
                                "미배차공조", "서울 강남구 역삼동")
                ));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/arologis/dispatches/unassigned")
                        .param("date", "2026-05-10")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.totalOutbound").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.unassignedCount").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.entries[0].slipNo").value("2026/05/10-001"));
    }

    @Test
    void regional_returns_200_with_sido_groups() throws Exception {
        org.mockito.Mockito.when(slipServiceClient.getOutboundSlips(
                java.time.LocalDate.parse("2026-05-10"),
                java.time.LocalDate.parse("2026-05-10")))
                .thenReturn(java.util.List.of(
                        new OutboundSlipSummary("id-1", "2026/05/10-001", "P-2026-0001",
                                "부산공조", "부산 해운대구", "REGION")
                ));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/arologis/dispatches/regional")
                        .param("date", "2026-05-10")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.sidoGroups").exists())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.sidoGroups.부산[0].slipNo").value("2026/05/10-001"));
    }
}
