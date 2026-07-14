package com.samhanair.logis.arologis.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * PR-H4b — arologis-service shared:realtime-abstraction 통합 IT.
 *
 * <p>시나리오:
 * <ol>
 *   <li>Dispatch 생성 + stop status 변경 → audit timeline 1행</li>
 *   <li>PLANNED 단계 (모든 stop=PENDING) edit-request 생성 → 400</li>
 * </ol>
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class ArologisRealtimeIT extends AbstractPostgresIT {

    private static final String ADMIN_ACCOUNT_ID = "10000000-0000-0000-0000-000000000405";

    private static final String SAMPLE_KAKAO = """
            8일착 야상입니다
            1. 상일+초월
            -인천 남동구 구월동(에스엠하나공조-214)아침8시
            -인천 서구 봉수대로(대한공조-170)아침9시반
            1톤
            """;

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
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        lenient().when(partnerClient.findByCodes(any())).thenReturn(java.util.List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(java.util.List.of());
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);

        signatureRepository.deleteAll();
        locationRepository.deleteAll();
        stopRepository.deleteAll();
        vehicleRepository.deleteAll();
        dispatchRepository.deleteAll();
        driverRepository.deleteAll();
    }

    /** Dispatch 생성 + stop status 변경 → audit timeline 1행 + SSE event broadcast. */
    @Test
    void updateStopStatus_recordsAuditAndExposesTimeline() throws Exception {
        // 1) dispatch 생성
        String createBody = objectMapper.writeValueAsString(Map.of("kakaoText", SAMPLE_KAKAO));
        String createResp = mockMvc.perform(post("/admin/arologis/dispatches")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(createBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String dispatchId = objectMapper.readTree(createResp).get("data").get("dispatchId").asText();

        // 2) stop status 갱신 (PENDING → ARRIVED) — audit log 1행 기록 trigger
        String statusBody = objectMapper.writeValueAsString(Map.of("status", "ARRIVED"));
        mockMvc.perform(put("/admin/arologis/dispatches/" + dispatchId
                        + "/vehicles/1/stops/1/status")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(statusBody))
                .andExpect(status().isOk());

        // 3) audit timeline 조회 — 1행 이상
        mockMvc.perform(get("/admin/arologis/dispatches/" + dispatchId + "/audit-logs")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].fieldName").value("stops[1].status"))
                .andExpect(jsonPath("$.data[0].oldValue").value("PENDING"))
                .andExpect(jsonPath("$.data[0].newValue").value("ARRIVED"));
    }

    /** PLANNED 단계 dispatch 의 edit-request 생성 → 400 (자유 단계 — 요청 불필요). */
    @Test
    void createEditRequest_onPlannedDispatch_returns400() throws Exception {
        String createBody = objectMapper.writeValueAsString(Map.of("kakaoText", SAMPLE_KAKAO));
        String createResp = mockMvc.perform(post("/admin/arologis/dispatches")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(createBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String dispatchId = objectMapper.readTree(createResp).get("data").get("dispatchId").asText();

        // 모든 stop = PENDING (방금 생성) → derived = PLANNED → 요청 거부
        String editReqBody = objectMapper.writeValueAsString(Map.of("requestType", "EDIT"));
        mockMvc.perform(post("/admin/arologis/dispatches/" + dispatchId + "/edit-requests")
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType("application/json")
                        .content(editReqBody))
                .andExpect(status().isBadRequest());
    }
}
