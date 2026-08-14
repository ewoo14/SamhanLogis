package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
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
 * SP-08-6-1 매출(OUTBOUND) 목록/상세 R1/R2 endpoint 잠금 IT.
 *
 * <p>매출은 별도 엔티티가 아닌 {@code Slip.slipType=OUTBOUND} 이다.
 * 목록은 {@code /slips?type=OUTBOUND} (legacy alias) 및 {@code /slips/query?slipType=OUTBOUND} 양쪽을
 * 검증하며, {@code SALES / MANAGER / MASTER} 만 허용한다.
 * {@code INVENTORY / WAREHOUSE} 는 SP-03 정책상 출고 전표 열람 불가 → R1/R2 모두 403.
 *
 * <p>권한 매트릭스 (SP-08-6-1):
 * <ul>
 *   <li>SALES — 200 허용</li>
 *   <li>MANAGER — 200 허용</li>
 *   <li>MASTER — 200 허용</li>
 *   <li>INVENTORY — 403 금지</li>
 *   <li>WAREHOUSE — 403 금지</li>
 * </ul>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipQuerySalesIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String SLIPS_PATH = "/slips";
    private static final String SLIPS_QUERY_PATH = "/slips/query";
    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Seoul"));
    private static final UUID TEST_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000002");

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

    @MockBean
    private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @MockBean
    private ArologisDispatchClient arologisDispatchClient;

    @BeforeEach
    void setupLenientMocks() {
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(
                                    id, "매출 IT 제품", "SAL-001",
                                    UUID.randomUUID(), new BigDecimal("200000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "매출 IT 제품", "SAL-001",
                        UUID.randomUUID(), new BigDecimal("200000"), "ACTIVE"));
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
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("SP0861 담당자"));
        // notificationChatRoomClient / partnerBlockClient lenient stub — 의존 흐름 변경 시 NPE 방지
        Mockito.lenient().when(notificationChatRoomClient.findChatRoomNames(ArgumentMatchers.anyString()))
                .thenReturn(java.util.Collections.emptyList());
        Mockito.lenient().when(notificationChatRoomClient.findChatRoomNames(
                        ArgumentMatchers.anyString(), ArgumentMatchers.anyString()))
                .thenReturn(java.util.Collections.emptyList());
        Mockito.lenient().when(partnerBlockClient.findAllBlockedPartnerCodes())
                .thenReturn(java.util.Collections.emptySet());
        // SP-D3 cycle 3 fix — DynamicPermissionClient lenient stub (canView/canEdit=true)
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(ArgumentMatchers.anyString(), ArgumentMatchers.anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(ArgumentMatchers.anyString(), ArgumentMatchers.anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(java.util.UUID.class),
                        ArgumentMatchers.anyString(),
                        ArgumentMatchers.any(com.samhanair.logis.security.permission.PermissionAction.class)))
                .thenReturn(true);
    }

    // ─── R1 목록 권한 가드 ───────────────────────────────────────────────────

    /**
     * R1: SALES 역할은 OUTBOUND 매출 목록을 200으로 조회할 수 있다.
     */
    @Test
    @DisplayName("R1: SALES 는 OUTBOUND 매출 목록을 200으로 조회한다")
    void testListSalesForSales() throws Exception {
        createSlip("OUTBOUND", TODAY, "SP0861-SALES-거래처");

        mockMvc.perform(get(SLIPS_PATH)
                        .param("type", "OUTBOUND")
                        .param("from", TODAY.toString())
                        .param("to", TODAY.toString())
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].slipType", is("OUTBOUND")));
    }

    /**
     * R1: MANAGER 역할은 OUTBOUND 매출 목록을 200으로 조회할 수 있다.
     */
    @Test
    @DisplayName("R1: MANAGER 는 OUTBOUND 매출 목록을 200으로 조회한다")
    void testListSalesForManager() throws Exception {
        createSlip("OUTBOUND", TODAY, "SP0861-MANAGER-거래처");

        mockMvc.perform(get(SLIPS_PATH)
                        .param("type", "OUTBOUND")
                        .param("from", TODAY.toString())
                        .param("to", TODAY.toString())
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk());
    }

    /**
     * R1: MASTER 역할은 OUTBOUND 매출 목록을 200으로 조회할 수 있다.
     */
    @Test
    @DisplayName("R1: MASTER 는 OUTBOUND 매출 목록을 200으로 조회한다")
    void testListSalesForMaster() throws Exception {
        createSlip("OUTBOUND", TODAY, "SP0861-MASTER-거래처");

        mockMvc.perform(get(SLIPS_PATH)
                        .param("type", "OUTBOUND")
                        .param("from", TODAY.toString())
                        .param("to", TODAY.toString())
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk());
    }

    /**
     * R1: INVENTORY 역할은 OUTBOUND 매출 목록 조회 시 403 을 반환한다.
     */
    @Test
    @DisplayName("R1: INVENTORY 는 OUTBOUND 매출 목록 조회 권한에서 제외된다")
    void testListSalesForbiddenForInventory() throws Exception {
        mockMvc.perform(get(SLIPS_PATH)
                        .param("type", "OUTBOUND")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isForbidden());
    }

    /**
     * R1: WAREHOUSE 역할은 OUTBOUND 매출 목록 조회 시 403 을 반환한다.
     */
    @Test
    @DisplayName("R1: WAREHOUSE 는 OUTBOUND 매출 목록 조회 권한에서 제외된다")
    void testListSalesForbiddenForWarehouse() throws Exception {
        mockMvc.perform(get(SLIPS_PATH)
                        .param("type", "OUTBOUND")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isForbidden());
    }

    // ─── R1 /slips/query 경로 권한 가드 ────────────────────────────────────────

    /**
     * R1-query: SALES 역할은 /slips/query?slipType=OUTBOUND 를 200으로 조회한다.
     */
    @Test
    @DisplayName("R1-query: SALES 는 /slips/query OUTBOUND 를 200으로 조회한다")
    void testListSalesQueryForSales() throws Exception {
        createSlip("OUTBOUND", TODAY, "SP0861-QUERY-SALES-거래처");

        mockMvc.perform(get(SLIPS_QUERY_PATH)
                        .param("slipType", "OUTBOUND")
                        .param("dateFrom", TODAY.toString())
                        .param("dateTo", TODAY.toString())
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("#881: /slips/query 담당자명은 UUID가 아닌 성명이며 벌크 resolve는 페이지당 1회다")
    void testSalesQueryResolvesSalesPersonNameWithOneBulkCall() throws Exception {
        createSlip("OUTBOUND", TODAY, "SP0881-담당자명");
        Mockito.when(userInternalClient.resolveFullNames(ArgumentMatchers.anyCollection()))
                .thenReturn(Map.of(TEST_USER_ID, "[DEV-SEED] 개발개발자"));

        MvcResult result = mockMvc.perform(get(SLIPS_QUERY_PATH)
                        .param("slipType", "OUTBOUND")
                        .param("dateFrom", TODAY.toString())
                        .param("dateTo", TODAY.toString())
                        .param("searchPartnerName", "SP0881-담당자명")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode content = objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data").path("content");
        assertThat(content).hasSize(1);
        assertThat(content.get(0).path("salesPersonName").asText())
                .isEqualTo("[DEV-SEED] 개발개발자")
                .doesNotMatch("(?i).*[0-9a-f]{8}-[0-9a-f-]{27,}.*");
        Mockito.verify(userInternalClient, Mockito.times(1))
                .resolveFullNames(ArgumentMatchers.anyCollection());
        Mockito.verify(userInternalClient, Mockito.never()).resolveFullName(ArgumentMatchers.any());
    }

    @Test
    @DisplayName("#881: user-service 벌크 장애에도 /slips/query는 200 + 담당자명 — 로 fail-open한다")
    void testSalesQueryUserServiceFailureIsFailOpen() throws Exception {
        createSlip("OUTBOUND", TODAY, "SP0881-user-service-down");
        Mockito.when(userInternalClient.resolveFullNames(ArgumentMatchers.anyCollection()))
                .thenThrow(new IllegalStateException("user-service down"));

        MvcResult result = mockMvc.perform(get(SLIPS_QUERY_PATH)
                        .param("slipType", "OUTBOUND")
                        .param("dateFrom", TODAY.toString())
                        .param("dateTo", TODAY.toString())
                        .param("searchPartnerName", "SP0881-user-service-down")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode content = objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data").path("content");
        assertThat(content).hasSize(1);
        assertThat(content.get(0).path("salesPersonName").asText()).isEqualTo("—");
        Mockito.verify(userInternalClient, Mockito.times(1))
                .resolveFullNames(ArgumentMatchers.anyCollection());
    }

    /**
     * R1-query: INVENTORY 역할은 /slips/query?slipType=OUTBOUND 를 403으로 차단한다.
     */
    @Test
    @DisplayName("R1-query: INVENTORY 는 /slips/query OUTBOUND 403 차단")
    void testListSalesQueryForbiddenForInventory() throws Exception {
        mockMvc.perform(get(SLIPS_QUERY_PATH)
                        .param("slipType", "OUTBOUND")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isForbidden());
    }

    /**
     * R1-query: WAREHOUSE 역할은 /slips/query?slipType=OUTBOUND 를 403으로 차단한다.
     */
    @Test
    @DisplayName("R1-query: WAREHOUSE 는 /slips/query OUTBOUND 403 차단")
    void testListSalesQueryForbiddenForWarehouse() throws Exception {
        mockMvc.perform(get(SLIPS_QUERY_PATH)
                        .param("slipType", "OUTBOUND")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isForbidden());
    }

    // ─── R1 slipType 미지정 시 OUTBOUND 차단 ───────────────────────────────────

    /**
     * R1: INVENTORY 는 slipType 미지정 전체 목록 조회 시 OUTBOUND 행을 포함하는 요청이
     * 403으로 차단된다 (restrictInbound → OUTBOUND → guardOutbound → 403).
     */
    @Test
    @DisplayName("R1: INVENTORY slipType 미지정 전체 조회 시 403")
    void testListInventoryTypeOmittedForbidden() throws Exception {
        mockMvc.perform(get(SLIPS_PATH)
                        .param("from", TODAY.toString())
                        .param("to", TODAY.toString())
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isForbidden());
    }

    /**
     * R1-query: WAREHOUSE slipType 미지정 시 OUTBOUND 제외 — INBOUND 만 허용 (WAREHOUSE 는 INBOUND 가능).
     */
    @Test
    @DisplayName("R1-query: WAREHOUSE slipType 미지정 시 INBOUND 행만 반환한다")
    void testListQueryWarehouseTypeOmittedSeesOnlyInbound() throws Exception {
        createSlip("OUTBOUND", TODAY, "SP0861-QUERY-WH-OUT");
        String inboundId = createSlip("INBOUND", TODAY, "SP0861-QUERY-WH-IN");
        String inboundSlipNo = slipNo(inboundId, "MASTER");

        MvcResult result = mockMvc.perform(get(SLIPS_QUERY_PATH)
                        .param("dateFrom", TODAY.toString())
                        .param("dateTo", TODAY.toString())
                        .param("page", "0")
                        .param("size", "20")
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode content = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("content");
        assertThat(content.toString()).doesNotContain("SP0861-QUERY-WH-OUT");
        assertThat(content.toString()).contains(inboundSlipNo);
        for (JsonNode item : content) {
            assertThat(item.path("slipType").asText()).isNotEqualTo("OUTBOUND");
        }
    }

    // ─── R2 상세 권한 가드 ────────────────────────────────────────────────────

    /**
     * R2: SALES 역할은 OUTBOUND 매출 상세를 200으로 조회하고 SlipDetailResponse 를 반환한다.
     */
    @Test
    @DisplayName("R2: SALES 는 OUTBOUND 상세를 200으로 조회한다")
    void testGetSalesDetailForSales() throws Exception {
        String id = createSlip("OUTBOUND", TODAY, "SP0861-DETAIL-SALES");

        mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipType", is("OUTBOUND")))
                .andExpect(jsonPath("$.data.slipNo", notNullValue()))
                .andExpect(jsonPath("$.data.partnerName", is("SP0861-DETAIL-SALES")));
    }

    @Test
    @DisplayName("잠금된 전표 상세 응답은 상태와 무관하게 lockFlag=true 를 노출한다")
    void testGetSalesDetailIncludesLockFlag() throws Exception {
        String id = createSlip("OUTBOUND", TODAY, "SP0861-LOCK-FLAG");
        var slip = slipRepository.findById(UUID.fromString(id)).orElseThrow();
        slip.lock();
        slipRepository.saveAndFlush(slip);

        mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status", is("DRAFT")))
                .andExpect(jsonPath("$.data.lockFlag", is(true)));
    }

    /**
     * R2: 단건 GET 응답에 ownerFullName 이 포함된다 (B-01 회고 — SP-08-5-5 패턴).
     */
    @Test
    @DisplayName("R2: OUTBOUND 상세 응답에 ownerFullName 이 포함된다")
    void testGetSalesDetailIncludesOwnerFullName() throws Exception {
        String id = createSlip("OUTBOUND", TODAY, "SP0861-OWNER-NAME");

        mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ownerFullName", is("SP0861 담당자")));
    }

    /**
     * R2: INVENTORY 역할은 OUTBOUND 상세 조회 시 403 을 반환한다.
     */
    @Test
    @DisplayName("R2: INVENTORY 는 OUTBOUND 상세 조회 403")
    void testGetSalesDetailForbiddenForInventory() throws Exception {
        String id = createSlip("OUTBOUND", TODAY, "SP0861-DETAIL-INV-FORBIDDEN");

        mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "INVENTORY"))
                .andExpect(status().isForbidden());
    }

    /**
     * R2: WAREHOUSE 역할은 OUTBOUND 상세 조회 시 403 을 반환한다.
     */
    @Test
    @DisplayName("R2: WAREHOUSE 는 OUTBOUND 상세 조회 403")
    void testGetSalesDetailForbiddenForWarehouse() throws Exception {
        String id = createSlip("OUTBOUND", TODAY, "SP0861-DETAIL-WH-FORBIDDEN");

        mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isForbidden());
    }

    /**
     * #1210 RED: WAREHOUSE 는 전체 상세 대신 최소 QR scan-context 로 출고전표에 도달해야 한다.
     * 현재 구현에는 endpoint 가 없으므로 RED 단계에서 404 로 실패한다.
     */
    @Test
    @DisplayName("#1210 RED: WAREHOUSE 는 출고전표 scan-context 에 도달하고 영업 정보·UUID를 받지 않는다")
    void warehouseCanReachOutboundScanContextWithoutSalesFieldsOrUuid() throws Exception {
        String id = createSlip("OUTBOUND", TODAY, "RED-SALES-PARTNER");

        mockMvc.perform(get(SLIPS_PATH + "/{id}/scan-context", id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").exists())
                .andExpect(jsonPath("$.data.slipType", is("OUTBOUND")))
                .andExpect(jsonPath("$.data.lines").isArray())
                .andExpect(jsonPath("$.data.id").doesNotExist())
                .andExpect(jsonPath("$.data.partnerName").doesNotExist())
                .andExpect(jsonPath("$.data.partnerCode").doesNotExist())
                .andExpect(jsonPath("$.data.totalAmount").doesNotExist())
                .andExpect(jsonPath("$.data.discountInfo").doesNotExist())
                .andExpect(jsonPath("$.data.collectTerm").doesNotExist())
                .andExpect(jsonPath("$.data.customerAddress").doesNotExist())
                .andExpect(jsonPath("$.data.receiverPhone").doesNotExist())
                .andExpect(jsonPath("$.data.businessNumber").doesNotExist())
                .andExpect(jsonPath("$.data.projectName").doesNotExist())
                .andExpect(jsonPath("$", notNullValue()))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
                        .string(not(containsString(TEST_USER_ID.toString()))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
                        .string(not(containsString("RED-SALES-PARTNER"))));
    }

    /** 번호 직접 진입도 목록 조회를 거치지 않고 같은 최소 계약을 사용한다. */
    @Test
    @DisplayName("#1210 RED: WAREHOUSE 는 출고전표번호로 scan-context 에 직접 도달한다")
    void warehouseCanReachOutboundScanContextBySlipNumber() throws Exception {
        String id = createSlip("OUTBOUND", TODAY, "RED-BY-NUMBER-PARTNER");
        String slipNo = slipRepository.findById(UUID.fromString(id)).orElseThrow().getSlipNo();

        mockMvc.perform(get(SLIPS_PATH + "/scan-context/by-number")
                        .param("slipNo", slipNo)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo", is(slipNo)))
                .andExpect(jsonPath("$.data.id").doesNotExist())
                .andExpect(jsonPath("$.data.partnerName").doesNotExist());
    }

    @Test
    @DisplayName("#1210 RED: INBOUND 전표 ID는 출고 scan-context에서 유형을 설명하며 거부한다")
    void inboundSlipIdIsRejectedWithOutboundOnlyReason() throws Exception {
        String id = createSlip("INBOUND", TODAY, "RED-INBOUND-SCAN-CONTEXT");

        mockMvc.perform(get(SLIPS_PATH + "/{id}/scan-context", id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", containsString("출고 스캔 문맥은 출고전표만 허용")));
    }

    @Test
    @DisplayName("#1210 RED: 입고·출고 동번호는 출고 화면에서 자동 선택하지 않는다")
    void collidingInboundAndOutboundSlipNumberIsRejected() throws Exception {
        String inboundId = createSlip("INBOUND", TODAY, "RED-COLLISION-INBOUND");
        String outboundId = createSlip("OUTBOUND", TODAY, "RED-COLLISION-OUTBOUND");
        String inboundNo = slipRepository.findById(UUID.fromString(inboundId)).orElseThrow().getSlipNo();
        String outboundNo = slipRepository.findById(UUID.fromString(outboundId)).orElseThrow().getSlipNo();
        assertThat(inboundNo).isEqualTo(outboundNo);

        mockMvc.perform(get(SLIPS_PATH + "/scan-context/by-number")
                        .param("slipNo", inboundNo)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", containsString("입고전표와 출고전표에 같은 번호")))
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    /**
     * R2: 없는 OUTBOUND 상세 조회 시 404 를 반환한다.
     */
    @Test
    @DisplayName("R2: 없는 OUTBOUND 상세 조회 시 404 반환")
    void testGetSalesDetailNotFound() throws Exception {
        mockMvc.perform(get(SLIPS_PATH + "/" + UUID.randomUUID())
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isNotFound());
    }

    // ─── 유틸 ────────────────────────────────────────────────────────────────

    private String createSlip(String slipType, LocalDate slipDate, String partnerName) throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "매출 IT 제품");
        line.put("modelName", "SAL-001");
        line.put("quantity", 2);
        line.put("unitPrice", 200000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", slipType);
        body.put("slipDate", slipDate.toString());
        body.put("sourceWarehouseId", "OUTBOUND".equals(slipType) ? UUID.randomUUID().toString() : null);
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", partnerName);
        body.put("memo", "SP-08-6-1 매출 IT");
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

    private String slipNo(String slipId, String role) throws Exception {
        MvcResult result = mockMvc.perform(get(SLIPS_PATH + "/" + slipId)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, role))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("slipNo").asText();
    }
}
