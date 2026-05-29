package com.samhanair.logis.arologis.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
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
 * P1-5 배차 Admin UI endpoint IT — DispatchAdminV1Controller (7 케이스).
 *
 * <ol>
 *   <li>배차 list 조회 → 200 + content array</li>
 *   <li>자동 매칭 trigger → 200 + totalVehicles</li>
 *   <li>수동 배차 성공 → 200 + dispatchId + driverCode</li>
 *   <li>수동 배차 미존재 driver → 404</li>
 *   <li>기사 변경 성공 → 200 + newDriverCode</li>
 *   <li>기사 변경 미존재 dispatch → 404</li>
 *   <li>가용 기사 list → 200 + availableDrivers array</li>
 * </ol>
 *
 * <p>외부 client 전체 @MockBean + lenient stub (IT @MockBean 의무, PR #17 회고).
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class DispatchAdminV1ControllerIT extends AbstractPostgresIT {

    private static final String ADMIN_ACCOUNT_ID = "10000000-0000-0000-0000-000000000406";

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
    @MockBean
    private SlipServiceClient slipServiceClient;
    /**
     * SP-D3 동적 권한 client 격리.
     * lenient stub 기본값: canView/canEdit 모두 true (기존 IT 회귀 0건 보장).
     */
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    private static final String SAMPLE_KAKAO = """
            8일착 야상입니다
            1. 상일+초월
            -인천 남동구 구월동(에스엠하나공조-214)아침8시
            -인천 서구 봉수대로(대한공조-170)아침9시반
            1톤
            """;

    /** 저장된 dispatch id (테스트 간 공유). */
    private String savedDispatchId;

    /** 저장된 driver code (테스트 간 공유). */
    private String savedDriverCode;

    @BeforeEach
    void setUp() throws Exception {
        lenient().when(partnerClient.findByCodes(any())).thenReturn(java.util.List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
        lenient().when(notificationClient.send(any(), any(), any(), any())).thenReturn(true);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(java.util.List.of());
        // SP-D3 lenient stub — canView=true, canEdit=true 기본값 (기존 IT 회귀 0건 보장)
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class), anyString(),
                        org.mockito.ArgumentMatchers.any(PermissionAction.class)))
                .thenReturn(true);

        // FK 순서로 정리
        signatureRepository.deleteAll();
        locationRepository.deleteAll();
        stopRepository.deleteAll();
        vehicleRepository.deleteAll();
        dispatchRepository.deleteAll();
        driverRepository.deleteAll();

        // 테스트용 dispatch 사전 생성 (기존 admin endpoint 활용)
        String createBody = objectMapper.writeValueAsString(Map.of("kakaoText", SAMPLE_KAKAO));
        String createResp = mockMvc.perform(MockMvcRequestBuilders.post("/admin/arologis/dispatches")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType("application/json")
                        .content(createBody))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andReturn().getResponse().getContentAsString();
        savedDispatchId = objectMapper.readTree(createResp).get("data").get("dispatchId").asText();

        // 테스트용 driver 사전 등록 (save 반환 managed entity 사용)
        Driver saved = driverRepository.save(Driver.of("DRV-IT-001", "010-9999-0001", "1톤",
                DriverSource.INTERNAL, false, null));
        savedDriverCode = saved.getDriverCode();
    }

    // -----------------------------------------------------------------------
    // 1. 배차 list 조회
    // -----------------------------------------------------------------------

    @Test
    void listDispatches_returns_200_with_content_array() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/api/v1/arologis/admin/dispatches")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.content").isArray())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.totalElements").exists())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.page").value(0))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.size").value(20));
    }

    @Test
    void listDispatches_with_status_filter_returns_200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/api/v1/arologis/admin/dispatches")
                        .param("status", "NIGHT")
                        .param("fromDate", "2026-01-01")
                        .param("toDate", "2026-12-31")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.content").isArray());
    }

    // -----------------------------------------------------------------------
    // 2. 자동 매칭 trigger
    // -----------------------------------------------------------------------

    @Test
    void autoMatch_trigger_returns_200_with_result() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("dispatchId", savedDispatchId));
        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/arologis/admin/dispatches/auto-match")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.totalVehicles").exists())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.matched").exists());
    }

    @Test
    void autoMatch_missing_dispatchId_returns_400() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of());
        mockMvc.perform(MockMvcRequestBuilders.post("/api/v1/arologis/admin/dispatches/auto-match")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isBadRequest());
    }

    // -----------------------------------------------------------------------
    // 3. 수동 배차
    // -----------------------------------------------------------------------

    @Test
    void manualAssign_success_returns_200() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "vehicleSeq", 1,
                "driverCode", savedDriverCode));
        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/api/v1/arologis/admin/dispatches/" + savedDispatchId + "/manual-assign")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.dispatchId").value(savedDispatchId))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.driverCode").value(savedDriverCode));
    }

    @Test
    void manualAssign_unknown_driver_returns_404() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "vehicleSeq", 1,
                "driverCode", "DRV-UNKNOWN-999"));
        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/api/v1/arologis/admin/dispatches/" + savedDispatchId + "/manual-assign")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isNotFound());
    }

    // -----------------------------------------------------------------------
    // 4. 기사 변경
    // -----------------------------------------------------------------------

    @Test
    void changeDriver_success_returns_200() throws Exception {
        // 우선 수동 배차로 차량 1에 기사 배정
        String assignBody = objectMapper.writeValueAsString(Map.of(
                "vehicleSeq", 1,
                "driverCode", savedDriverCode));
        mockMvc.perform(MockMvcRequestBuilders.post(
                        "/api/v1/arologis/admin/dispatches/" + savedDispatchId + "/manual-assign")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType("application/json")
                        .content(assignBody))
                .andExpect(MockMvcResultMatchers.status().isOk());

        // 두 번째 기사 추가 등록 (save 반환 managed entity 사용)
        Driver driver2 = driverRepository.save(Driver.of("DRV-IT-002", "010-9999-0002", "1톤",
                DriverSource.INTERNAL, false, null));

        // 기사 변경
        String changeBody = objectMapper.writeValueAsString(Map.of(
                "vehicleSeq", 1,
                "newDriverCode", driver2.getDriverCode()));
        mockMvc.perform(MockMvcRequestBuilders.patch(
                        "/api/v1/arologis/admin/dispatches/" + savedDispatchId + "/driver")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType("application/json")
                        .content(changeBody))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.dispatchId").value(savedDispatchId))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.newDriverCode").value(driver2.getDriverCode()));
    }

    @Test
    void changeDriver_missing_dispatch_returns_404() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "vehicleSeq", 1,
                "newDriverCode", savedDriverCode));
        mockMvc.perform(MockMvcRequestBuilders.patch(
                        "/api/v1/arologis/admin/dispatches/" + UUID.randomUUID() + "/driver")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(MockMvcResultMatchers.status().isNotFound());
    }

    // -----------------------------------------------------------------------
    // 5. 가용 기사 list
    // -----------------------------------------------------------------------

    @Test
    void availableDrivers_returns_200_with_array() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/api/v1/arologis/admin/drivers/available")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.availableDrivers").isArray())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.totalCount").exists());
    }

    @Test
    void availableDrivers_with_date_param_returns_200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/api/v1/arologis/admin/drivers/available")
                        .param("date", "2026-05-11")
                        .param("zoneId", "1톤")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.queryDate").value("2026-05-11"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.zoneId").value("1톤"));
    }
}
