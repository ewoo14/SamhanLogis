package com.samhanair.logis.slip.estimate.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.ExpandedLineDto;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
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

    private static final String SALES_ACCOUNT_ID = "10000000-0000-0000-0000-000000000331";
    private static final String VIEWER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000332";

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
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;
    /** SP-D4 회귀 fix (audit-slice-3) — ArologisDispatchClient @MockBean 격리. */
    @MockBean
    private ArologisDispatchClient arologisDispatchClient;

    private UUID productId;

    @BeforeEach
    void setUpMocks() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        // SP-D4 회귀 fix — DynamicPermissionClient lenient stub (기본 허용)
        Mockito.lenient().when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
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
                        .header("X-User-Id", SALES_ACCOUNT_ID)
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
                        .header("X-User-Id", SALES_ACCOUNT_ID)
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
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildCreateRequest())))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // DRAFT → SENT
        mockMvc.perform(post("/slips/estimates/" + id + "/send")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("QUOTE_SENT"));

        // SENT → ACCEPTED
        mockMvc.perform(post("/slips/estimates/" + id + "/accept")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("QUOTE_ACCEPTED"));

        // ACCEPTED → CONVERTED (슬립 자동 발행)
        mockMvc.perform(post("/slips/estimates/" + id + "/convert")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
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
                        .header("X-User-Id", SALES_ACCOUNT_ID)
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
                        .header("X-User-Id", SALES_ACCOUNT_ID)
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
                        .header("X-User-Id", SALES_ACCOUNT_ID)
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
        Mockito.when(dynamicPermissionClient.check(
                        any(UUID.class), eq("estimates.list"), eq(PermissionAction.CREATE)))
                .thenReturn(false);

        mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", VIEWER_ACCOUNT_ID)
                        .header("X-User-Role", "VIEWER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildCreateRequest())))
                .andExpect(status().isForbidden());
    }

    // ===== 헬퍼 =====

    @Test
    @DisplayName("견적 세트(BUNDLE) 라인 → 구성품으로 전개되어 라인 영속 (옵션 A)")
    void createEstimate_bundle_expandedToComponents() throws Exception {
        UUID setId = UUID.randomUUID();
        UUID inId = UUID.randomUUID();
        UUID outId = UUID.randomUUID();
        ProductSummary setSummary = new ProductSummary(setId, "360 CST 세트", "360-CST", null, null,
                new BigDecimal("1000000.00"), null, false, "AC360SET", "BUNDLE");
        Mockito.when(productClient.lookup(ArgumentMatchers.anyList())).thenReturn(List.of(setSummary));
        Mockito.when(productClient.expand(ArgumentMatchers.eq("AC360SET"), ArgumentMatchers.any(),
                        ArgumentMatchers.any(), ArgumentMatchers.any()))
                .thenReturn(List.of(
                        new ExpandedLineDto(inId, "IN-360", "IN-M", "실내기", new BigDecimal("1"),
                                new BigDecimal("600000"), "INDOOR", true),
                        new ExpandedLineDto(outId, "OUT-360", "OUT-M", "실외기", new BigDecimal("1"),
                                new BigDecimal("400000"), "OUTDOOR", false)));

        Map<String, Object> lineReq = new HashMap<>();
        lineReq.put("productId", setId.toString());
        lineReq.put("quantity", 1);
        lineReq.put("unitPrice", "1000000.00");
        Map<String, Object> body = new HashMap<>();
        body.put("partnerName", "세트거래처");
        body.put("lines", List.of(lineReq));

        mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.lines.length()").value(2))
                .andExpect(jsonPath("$.data.lines[0].productName").value("실내기"))
                .andExpect(jsonPath("$.data.lines[0].unitPrice").value(600000))
                .andExpect(jsonPath("$.data.lines[1].productName").value("실외기"))
                .andExpect(jsonPath("$.data.lines[1].unitPrice").value(400000));
    }

    @Test
    @DisplayName("견적 단가 부가세포함 → 라인 단위 공급가액/부가세 분리(원 단위)")
    void createEstimate_priceVatInclusive_splitsPerLine() throws Exception {
        // qty=1, 단가(VAT포함)=1000 → 합계 1000, 공급가액=round(1000/1.1)=909, 부가세=91.
        Map<String, Object> lineReq = new HashMap<>();
        lineReq.put("productId", productId.toString());
        lineReq.put("productName", "VAT포함 견적");
        lineReq.put("quantity", 1);
        lineReq.put("unitPrice", "1000");
        lineReq.put("priceVatInclusive", true);
        Map<String, Object> body = new HashMap<>();
        body.put("partnerName", "VAT견적거래처");
        body.put("lines", List.of(lineReq));

        mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.lines[0].unitPriceWithVat").value(1000.0))
                .andExpect(jsonPath("$.data.lines[0].supplyAmount").value(909.0))
                .andExpect(jsonPath("$.data.lines[0].vatAmount").value(91.0));
    }

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
