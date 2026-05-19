package com.samhanair.logis.slip.estimate.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * 견적서 Controller 통합 테스트 — P2-1 (Stage 4).
 *
 * <p>매뉴얼 출처: {@code docs/manual/01-영업/06-견적서.md}.
 *
 * <p>검증 시나리오:
 * <ol>
 *   <li>견적서 생성 (DRAFT 201) + 단건 조회</li>
 *   <li>DRAFT → SENT → ACCEPTED → CONVERTED (슬립 자동 발행) 전체 라이프사이클</li>
 *   <li>견적서 수정 (DRAFT 단계만 허용)</li>
 *   <li>견적서 목록 페이지 조회</li>
 *   <li>SALES 권한 외 접근 차단 (403)</li>
 * </ol>
 *
 * <p>외부 client 전체 {@code @MockBean} 격리 (메모리 가드 {@code feedback_it_mockbean_external_clients}).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class EstimateControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    /** 외부 RestClient — 모두 MockBean 격리 (Eureka 비활성 시 500 방지). */
    @MockBean
    private ProductClient productClient;
    @MockBean
    private InventoryClient inventoryClient;
    @MockBean
    private NotificationClient notificationClient;
    @MockBean
    private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean
    private PartnerBlockClient partnerBlockClient;
    @MockBean
    private PartnerInternalClient partnerInternalClient;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean
    private UserInternalClient userInternalClient;

    private UUID productId;

    @BeforeEach
    void setUpMocks() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        productId = UUID.randomUUID();
        ProductSummary summary = new ProductSummary(productId, "에어컨 220V 실외기", "AC-220",
                null, new BigDecimal("550000.00"), null);
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenReturn(List.of(summary));
        Mockito.lenient().when(partnerBlockClient.isBlocked(ArgumentMatchers.any()))
                .thenReturn(false);
    }

    /**
     * 견적서 생성 (DRAFT 201) + 단건 조회 검증.
     */
    @Test
    @DisplayName("견적서 생성 201 + 단건 조회 — status=QUOTE_DRAFT, estimateNo 채번")
    void createEstimate_and_getOne() throws Exception {
        // 1) 생성
        MvcResult result = mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", "sales-user-1")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildCreateRequest())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("QUOTE_DRAFT"))
                .andExpect(jsonPath("$.data.estimateNo").isNotEmpty())
                .andExpect(jsonPath("$.data.lines").isArray())
                .andReturn();

        // 2) id 추출 → 단건 조회
        String id = objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(get("/slips/estimates/" + id)
                        .header("X-User-Id", "sales-user-1")
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(id))
                .andExpect(jsonPath("$.data.totalSupply").isNumber())
                .andExpect(jsonPath("$.data.totalVat").isNumber());
    }

    /**
     * 전체 라이프사이클 — DRAFT → SENT → ACCEPTED → CONVERTED (슬립 자동 발행).
     */
    @Test
    @DisplayName("견적서 전체 라이프사이클: DRAFT → SENT → ACCEPTED → CONVERTED + 슬립 ID 기록")
    void fullLifecycle_draftToConverted() throws Exception {
        // 생성 (DRAFT)
        MvcResult created = mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", "sales-user-1")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildCreateRequest())))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // DRAFT → SENT
        mockMvc.perform(post("/slips/estimates/" + id + "/send")
                        .header("X-User-Id", "sales-user-1")
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("QUOTE_SENT"));

        // SENT → ACCEPTED
        mockMvc.perform(post("/slips/estimates/" + id + "/accept")
                        .header("X-User-Id", "sales-user-1")
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("QUOTE_ACCEPTED"));

        // ACCEPTED → CONVERTED (슬립 자동 발행)
        mockMvc.perform(post("/slips/estimates/" + id + "/convert")
                        .header("X-User-Id", "sales-user-1")
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("QUOTE_CONVERTED"))
                .andExpect(jsonPath("$.data.convertedSlipId").isNotEmpty())
                .andExpect(jsonPath("$.data.convertedAt").isNotEmpty());
    }

    /**
     * 견적서 수정 — DRAFT 단계에서 헤더 및 라인 replace.
     */
    @Test
    @DisplayName("견적서 수정 — DRAFT 단계 헤더 + 라인 replace 200")
    void updateEstimate_draftStage() throws Exception {
        MvcResult created = mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", "sales-user-1")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildCreateRequest())))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // 수정 요청 — memo 변경 + 라인 교체
        Map<String, Object> updateBody = new HashMap<>();
        updateBody.put("memo", "수정된 비고");
        Map<String, Object> newLine = new HashMap<>();
        newLine.put("productId", productId.toString());
        newLine.put("productName", "에어컨 220V 실외기");
        newLine.put("quantity", 3);
        newLine.put("unitPrice", "300000.00");
        updateBody.put("lines", List.of(newLine));

        mockMvc.perform(put("/slips/estimates/" + id)
                        .header("X-User-Id", "sales-user-1")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.memo").value("수정된 비고"));
    }

    /**
     * 견적서 목록 페이지 조회 — 정상 200.
     */
    @Test
    @DisplayName("견적서 목록 조회 200")
    void listEstimates() throws Exception {
        mockMvc.perform(get("/slips/estimates")
                        .header("X-User-Id", "sales-user-1")
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray());
    }

    /**
     * 권한 없는 사용자 (VIEWER) 생성 시도 → 403 Forbidden.
     */
    @Test
    @DisplayName("권한 없는 역할(VIEWER) 견적서 생성 시도 → 403")
    void createEstimate_viewerRole_forbidden() throws Exception {
        mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", "viewer-1")
                        .header("X-User-Role", "VIEWER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildCreateRequest())))
                .andExpect(status().isForbidden());
    }

    // ===== 헬퍼 =====

    private Map<String, Object> buildCreateRequest() {
        Map<String, Object> lineReq = new HashMap<>();
        lineReq.put("productId", productId.toString());
        lineReq.put("productName", "에어컨 220V 실외기");
        lineReq.put("quantity", 2);
        lineReq.put("unitPrice", "550000.00");

        Map<String, Object> body = new HashMap<>();
        body.put("estimateDate", "2026-05-11");
        body.put("partnerName", "테스트거래처");
        body.put("partnerBusinessNo", "123-45-67890");
        body.put("validUntil", "2026-06-11");
        body.put("memo", "P2-1 견적서 IT 테스트");
        body.put("lines", List.of(lineReq));
        return body;
    }
}
