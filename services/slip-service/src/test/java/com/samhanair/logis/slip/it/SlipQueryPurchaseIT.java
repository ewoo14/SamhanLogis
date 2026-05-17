package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
 * SP-08-5-1 매입 목록/상세 R1/R2 endpoint 잠금 IT.
 *
 * <p>매입은 별도 PurchaseSlip 엔티티가 아니라 {@code Slip.slipType=INBOUND} 이다.
 * 목록은 legacy GAS parity alias 인 {@code type=INBOUND} 를 수용하고, 입고 검수 CTA 권한과
 * 동일하게 {@code WAREHOUSE / MANAGER / MASTER} 만 허용한다. {@code INVENTORY} 는 SP-03
 * 정책상 구매관리 검수 CTA 표면에서 제외되므로 R1/R2 조회도 403 으로 잠근다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipQueryPurchaseIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String SLIPS_PATH = "/slips";
    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Seoul"));
    private static final UUID TEST_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SlipRepository slipRepository;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private NotificationClient notificationClient;

    @MockBean
    private NotificationChatRoomClient notificationChatRoomClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private PartnerBlockClient partnerBlockClient;

    @BeforeEach
    void setupLenientMocks() {
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(
                                    id, "매입 IT 제품", "PUR-001",
                                    UUID.randomUUID(), new BigDecimal("120000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "매입 IT 제품", "PUR-001",
                        UUID.randomUUID(), new BigDecimal("120000"), "ACTIVE"));
        Mockito.lenient().doNothing()
                .when(notificationClient).sendUserSms(
                        ArgumentMatchers.any(), ArgumentMatchers.anyString(), ArgumentMatchers.anyString());
        Mockito.lenient().doNothing()
                .when(notificationClient).sendExternalSms(
                        ArgumentMatchers.anyString(), ArgumentMatchers.anyString(), ArgumentMatchers.anyString());
        Mockito.lenient().doNothing()
                .when(notificationClient).sendUserPush(
                        ArgumentMatchers.any(), ArgumentMatchers.anyString(), ArgumentMatchers.anyString());
        Mockito.lenient().doNothing()
                .when(inventoryClient).inbound(
                        ArgumentMatchers.any(), ArgumentMatchers.any(), ArgumentMatchers.anyInt(),
                        ArgumentMatchers.anyString(), ArgumentMatchers.any());
    }

    @Test
    @DisplayName("R1: type=INBOUND alias 로 매입 목록을 조회하고 최신 전표일자 순으로 반환한다")
    void testListInboundSuccess() throws Exception {
        createSlip("OUTBOUND", TODAY, "SP0851-출고처");
        String olderInboundId = createSlip("INBOUND", TODAY.minusDays(1), "SP0851-입고처-과거");
        String latestInboundId = createSlip("INBOUND", TODAY, "SP0851-입고처-최신");
        String latestSlipNo = slipNo(latestInboundId);

        MvcResult result = mockMvc.perform(get(SLIPS_PATH)
                        .param("type", "INBOUND")
                        .param("from", TODAY.minusDays(7).toString())
                        .param("to", TODAY.plusDays(1).toString())
                        .param("page", "0")
                        .param("size", "10")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].slipType", is("INBOUND")))
                .andExpect(jsonPath("$.data.content[0].slipNo", is(latestSlipNo)))
                .andReturn();

        JsonNode content = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("content");
        assertThat(content).hasSizeGreaterThanOrEqualTo(2);
        assertThat(content.toString()).contains(slipNo(olderInboundId));
        for (JsonNode item : content) {
            assertThat(item.path("slipType").asText()).isEqualTo("INBOUND");
        }
    }

    @Test
    @DisplayName("R1: type=INBOUND + from/to 로 기간 밖 매입 전표를 제외한다")
    void testListInboundFilterByDate() throws Exception {
        createSlip("INBOUND", TODAY.minusDays(10), "SP0851-기간밖");
        String inRangeId = createSlip("INBOUND", TODAY, "SP0851-기간안");
        String inRangeSlipNo = slipNo(inRangeId);

        MvcResult result = mockMvc.perform(get(SLIPS_PATH)
                        .param("type", "INBOUND")
                        .param("from", TODAY.minusDays(1).toString())
                        .param("to", TODAY.plusDays(1).toString())
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString();
        assertThat(body).contains(inRangeSlipNo);
        assertThat(body).doesNotContain("SP0851-기간밖");
    }

    @Test
    @DisplayName("R1: INVENTORY 는 매입 목록 조회 권한에서 제외된다")
    void testListInboundForbiddenForInventory() throws Exception {
        mockMvc.perform(get(SLIPS_PATH)
                        .param("type", "INBOUND")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("R1-query: INVENTORY 는 /slips/query 매입 목록 조회 권한에서 제외된다")
    void testListPurchaseQueryForbiddenForInventory() throws Exception {
        mockMvc.perform(get("/slips/query")
                        .param("slipType", "INBOUND")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("R1-query: ACCOUNTANT 는 /slips/query 매입 목록 조회 권한에서 제외된다")
    void testListPurchaseQueryForbiddenForAccountant() throws Exception {
        mockMvc.perform(get("/slips/query")
                        .param("slipType", "INBOUND")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "ACCOUNTANT"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("R1: SALES 는 매입 목록 조회 권한에서 제외된다")
    void testListInboundForbiddenForSales() throws Exception {
        mockMvc.perform(get(SLIPS_PATH)
                        .param("type", "INBOUND")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("R1: ACCOUNTANT 는 매입 목록 조회 권한에서 제외된다")
    void testListInboundForbiddenForAccountant() throws Exception {
        mockMvc.perform(get(SLIPS_PATH)
                        .param("type", "INBOUND")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "ACCOUNTANT"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("R2: 매입 상세는 라인, 거래처, 검수 CTA 기준 상태를 포함한다")
    void testGetDetailWithLines() throws Exception {
        String id = createSlip("INBOUND", TODAY, "SP0851-상세거래처");

        mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipType", is("INBOUND")))
                .andExpect(jsonPath("$.data.slipNo", notNullValue()))
                .andExpect(jsonPath("$.data.partnerName", is("SP0851-상세거래처")))
                .andExpect(jsonPath("$.data.lines[0].productName", is("매입 IT 제품")))
                .andExpect(jsonPath("$.data.id", is(id)))
                .andExpect(jsonPath("$.data.partnerId", notNullValue()))
                .andExpect(jsonPath("$.data.destinationWarehouseId", notNullValue()))
                .andExpect(jsonPath("$.data.inspectionStatus", is("NOT_READY")));
    }

    @Test
    @DisplayName("R2: SAVED 매입 상세는 검수 가능 READY 상태를 반환한다")
    void testGetDetailReadyWhenSaved() throws Exception {
        String id = createSlip("INBOUND", TODAY, "SP0851-READY");
        mockMvc.perform(post(SLIPS_PATH + "/" + id + "/save")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk());

        mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.inspectionStatus", is("READY")));
    }

    @Test
    @DisplayName("R2: CONFIRMED 매입 상세는 검수 가능 READY 상태를 반환한다")
    void testGetDetailReadyWhenConfirmed() throws Exception {
        String id = createSlip("INBOUND", TODAY, "SP0851-CONFIRMED-READY");
        mockMvc.perform(post(SLIPS_PATH + "/" + id + "/save")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk());
        mockMvc.perform(post(SLIPS_PATH + "/" + id + "/send")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk());
        mockMvc.perform(post(SLIPS_PATH + "/" + id + "/accept")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk());
        mockMvc.perform(post(SLIPS_PATH + "/" + id + "/process")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk());
        mockMvc.perform(post(SLIPS_PATH + "/" + id + "/complete")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk());
        mockMvc.perform(post(SLIPS_PATH + "/" + id + "/inspect")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk());
        mockMvc.perform(post(SLIPS_PATH + "/" + id + "/confirm")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "ACCOUNTANT"))
                .andExpect(status().isOk());

        mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.inspectionStatus", is("READY")));
    }

    @Test
    @DisplayName("R2: INVENTORY는 INBOUND 매입 상세 조회 권한에서 제외된다")
    void testGetDetailForbiddenForInventory() throws Exception {
        String id = createSlip("INBOUND", TODAY, "SP0851-DETAIL-INVENTORY-FORBIDDEN");

        mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("R2: SALES는 INBOUND 매입 상세 조회 권한에서 제외된다")
    void testGetDetailForbiddenForSales() throws Exception {
        String id = createSlip("INBOUND", TODAY, "SP0851-DETAIL-SALES-FORBIDDEN");

        mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("R2: ACCOUNTANT는 INBOUND 매입 상세 조회 권한에서 제외된다")
    void testGetDetailForbiddenForAccountant() throws Exception {
        String id = createSlip("INBOUND", TODAY, "SP0851-DETAIL-ACCOUNTANT-FORBIDDEN");

        mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "ACCOUNTANT"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("R1: 같은 전표일자는 seqNo DESC 순으로 반환한다")
    void testListInboundOrderBySeqNo() throws Exception {
        String firstId = createSlip("INBOUND", TODAY, "SP0851-SEQ-1");
        String secondId = createSlip("INBOUND", TODAY, "SP0851-SEQ-2");
        String firstSlipNo = slipNo(firstId);
        String secondSlipNo = slipNo(secondId);

        mockMvc.perform(get(SLIPS_PATH)
                        .param("type", "INBOUND")
                        .param("from", TODAY.toString())
                        .param("to", TODAY.toString())
                        .param("page", "0")
                        .param("size", "10")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].slipNo", is(secondSlipNo)))
                .andExpect(jsonPath("$.data.content[1].slipNo", is(firstSlipNo)));
    }

    @Test
    @DisplayName("R1: INVENTORY type omitted excludes INBOUND rows")
    void testListInventoryRoleSeesNoInboundWithoutSlipTypeFilter() throws Exception {
        createSlip("OUTBOUND", TODAY, "SP0851-NULLTYPE-OUT");
        createSlip("INBOUND", TODAY, "SP0851-NULLTYPE-IN");

        MvcResult result = mockMvc.perform(get(SLIPS_PATH)
                        .param("from", TODAY.toString())
                        .param("to", TODAY.toString())
                        .param("page", "0")
                        .param("size", "20")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode content = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("content");
        assertThat(content.toString()).doesNotContain("SP0851-NULLTYPE-IN");
        for (JsonNode item : content) {
            assertThat(item.path("slipType").asText()).isNotEqualTo("INBOUND");
        }
    }

    @Test
    @DisplayName("R1: SALES type omitted excludes INBOUND rows")
    void testListSalesRoleSeesNoInboundWithoutSlipTypeFilter() throws Exception {
        createSlip("OUTBOUND", TODAY, "SP0851-NULLTYPE-SALES-OUT");
        createSlip("INBOUND", TODAY, "SP0851-NULLTYPE-SALES-IN");

        MvcResult result = mockMvc.perform(get(SLIPS_PATH)
                        .param("from", TODAY.toString())
                        .param("to", TODAY.toString())
                        .param("page", "0")
                        .param("size", "20")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode content = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("content");
        assertThat(content.toString()).doesNotContain("SP0851-NULLTYPE-SALES-IN");
        for (JsonNode item : content) {
            assertThat(item.path("slipType").asText()).isNotEqualTo("INBOUND");
        }
    }

    @Test
    @DisplayName("R1-query: INVENTORY slipType omitted excludes INBOUND rows")
    void testListPurchaseQueryInventoryRoleSeesNoInboundWithoutSlipTypeFilter() throws Exception {
        createSlip("OUTBOUND", TODAY, "SP0851-QUERY-NULLTYPE-OUT");
        createSlip("INBOUND", TODAY, "SP0851-QUERY-NULLTYPE-IN");

        MvcResult result = mockMvc.perform(get("/slips/query")
                        .param("dateFrom", TODAY.toString())
                        .param("dateTo", TODAY.toString())
                        .param("page", "0")
                        .param("size", "20")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode content = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("content");
        assertThat(content.toString()).doesNotContain("SP0851-QUERY-NULLTYPE-IN");
        for (JsonNode item : content) {
            assertThat(item.path("slipType").asText()).isNotEqualTo("INBOUND");
        }
    }

    @Test
    @DisplayName("R1-query: SALES slipType omitted excludes INBOUND rows")
    void testListPurchaseQuerySalesRoleSeesNoInboundWithoutSlipTypeFilter() throws Exception {
        createSlip("OUTBOUND", TODAY, "SP0851-QUERY-SALES-OUT");
        createSlip("INBOUND", TODAY, "SP0851-QUERY-SALES-IN");

        MvcResult result = mockMvc.perform(get("/slips/query")
                        .param("dateFrom", TODAY.toString())
                        .param("dateTo", TODAY.toString())
                        .param("page", "0")
                        .param("size", "20")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode content = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("content");
        assertThat(content.toString()).doesNotContain("SP0851-QUERY-SALES-IN");
        for (JsonNode item : content) {
            assertThat(item.path("slipType").asText()).isNotEqualTo("INBOUND");
        }
    }

    @Test
    @DisplayName("R1-query: ACCOUNTANT slipType omitted excludes INBOUND rows")
    void testListAccountantSeesNoInboundWithoutSlipTypeFilter() throws Exception {
        createSlip("OUTBOUND", TODAY, "SP0851-QUERY-ACCOUNTANT-OUT");
        createSlip("INBOUND", TODAY, "SP0851-QUERY-ACCOUNTANT-IN");

        MvcResult result = mockMvc.perform(get("/slips/query")
                        .param("dateFrom", TODAY.toString())
                        .param("dateTo", TODAY.toString())
                        .param("page", "0")
                        .param("size", "20")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode content = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("content");
        assertThat(content.toString()).doesNotContain("SP0851-QUERY-ACCOUNTANT-IN");
        for (JsonNode item : content) {
            assertThat(item.path("slipType").asText()).isNotEqualTo("INBOUND");
        }
    }

    @Test
    @DisplayName("R1-query: same slipDate sorts by seqNo DESC")
    void testListPurchaseQueryOrderBySeqNo() throws Exception {
        String firstId = createSlip("INBOUND", TODAY, "SP0851-QUERY-SEQ-1");
        String secondId = createSlip("INBOUND", TODAY, "SP0851-QUERY-SEQ-2");
        String firstSlipNo = slipNo(firstId);
        String secondSlipNo = slipNo(secondId);

        mockMvc.perform(get("/slips/query")
                        .param("slipType", "INBOUND")
                        .param("dateFrom", TODAY.toString())
                        .param("dateTo", TODAY.toString())
                        .param("page", "0")
                        .param("size", "10")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].slipNo", is(secondSlipNo)))
                .andExpect(jsonPath("$.data.content[1].slipNo", is(firstSlipNo)));
    }

    @Test
    @DisplayName("R2: 없는 매입 상세는 404를 반환한다")
    void testGetDetailNotFound() throws Exception {
        mockMvc.perform(get(SLIPS_PATH + "/" + UUID.randomUUID())
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isNotFound());
    }

    private String createSlip(String slipType, LocalDate slipDate, String partnerName) throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "매입 IT 제품");
        line.put("modelName", "PUR-001");
        line.put("quantity", 3);
        line.put("unitPrice", 120000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", slipType);
        body.put("slipDate", slipDate.toString());
        body.put("sourceWarehouseId", "OUTBOUND".equals(slipType) ? UUID.randomUUID().toString() : null);
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", partnerName);
        body.put("memo", "SP-08-5-1 매입 IT");
        body.put("lines", List.of(line));

        MvcResult result = mockMvc.perform(post(SLIPS_PATH)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        String slipNo = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("slipNo").asText();
        return slipRepository.findBySlipTypeAndSlipNoAndIsDeletedFalse(
                        SlipType.valueOf(slipType), slipNo)
                .orElseThrow()
                .getId()
                .toString();
    }

    private String slipNo(String slipId) throws Exception {
        MvcResult result = mockMvc.perform(get(SLIPS_PATH + "/" + slipId)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("slipNo").asText();
    }
}
