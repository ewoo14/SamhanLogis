package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.audit.repository.SlipAuditLogRepository;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.ExpandedLineDto;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
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
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * SP-08-6-2 매출 수정 direct PUT endpoint IT.
 *
 * <p>SALES/MANAGER/MASTER 가 OUTBOUND 전표를 직접 수정하는 경로를 검증한다.
 * SP-08-5-2 {@code SlipUpdateIT} (매입) 와 대칭 패턴 — 엔드포인트는 {@code PUT /slips/{id}/sales}.
 * 낙관적 잠금은 상세 조회 응답의 {@code updatedAt} 을 사용한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipSalesUpdateIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String SLIPS_PATH = "/slips";
    private static final String SALES_SUFFIX = "/sales";
    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Seoul"));
    private static final UUID TEST_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000062");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SlipRepository slipRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private SlipAuditLogRepository auditLogRepository;

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
        auditLogRepository.deleteAll();
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(
                                    id, "매출 수정 IT 제품", "SAL-UPD",
                                    UUID.randomUUID(), new BigDecimal("200000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "매출 수정 IT 제품", "SAL-UPD",
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
    }

    @Test
    @DisplayName("U1: SALES는 OUTBOUND 매출 헤더와 라인을 direct PUT으로 수정한다")
    void testUpdateSalesSuccess() throws Exception {
        String id = createSlip("OUTBOUND", "SP0862-수정전");
        String updatedAt = updatedAt(id);

        mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(updatedAt, "SP0862-수정후", 5, "180000"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipType", is("OUTBOUND")))
                .andExpect(jsonPath("$.data.partnerName", is("SP0862-수정후")))
                .andExpect(jsonPath("$.data.memo", is("SP-08-6-2 수정 메모")))
                .andExpect(jsonPath("$.data.lines[0].quantity", is(5)))
                .andExpect(jsonPath("$.data.lines[0].unitPrice", is(180000)))
                .andExpect(jsonPath("$.data.updatedAt", notNullValue()))
                // audit 최종 flush까지 포함한 최종 상태 token: 저장 flush + audit flush (초기 0 → 2)
                .andExpect(jsonPath("$.data.version").value(2));
    }

    @Test
    @DisplayName("RED-A-3: 성공 PUT 응답 token을 그대로 재사용한 두 번째 PUT도 200이다")
    void testUpdateSalesResponseTokenIsUsableForImmediateSecondPut() throws Exception {
        String id = createSlip("OUTBOUND", "SP1131-r7-version-token");
        String initialUpdatedAt = updatedAt(id);
        Map<String, Object> firstBody = updateBody(initialUpdatedAt, "SP1131-r7-first", 5, "180000");

        MvcResult first = mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(firstBody)))
                .andExpect(status().isOk())
                .andReturn();
        String responseUpdatedAt = objectMapper.readTree(first.getResponse().getContentAsByteArray())
                .path("data").path("updatedAt").asText();

        mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                updateBody(responseUpdatedAt, "SP1131-r7-second", 6, "190000"))))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("U1: stale updatedAt 요청은 409 + SLIP_OPTIMISTIC_LOCK_CONFLICT를 반환한다")
    void testUpdateSalesOptimisticLockConflict() throws Exception {
        String id = createSlip("OUTBOUND", "SP0862-락충돌");

        // "2026-01-01T00:00:00" = 실제 createdAt 보다 과거 일자 강제 stale verification
        mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                updateBody("2026-01-01T00:00:00", "SP0862-락충돌", 2, "200000"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is("SLIP_OPTIMISTIC_LOCK_CONFLICT")));
    }

    @Test
    @DisplayName("U1: INVENTORY는 매출 direct PUT 권한에서 제외된다 (403)")
    void testUpdateSalesForbiddenForInventory() throws Exception {
        assertForbiddenForRole("INVENTORY");
    }

    @Test
    @DisplayName("U1: WAREHOUSE는 매출 direct PUT 권한에서 제외된다 (403)")
    void testUpdateSalesForbiddenForWarehouse() throws Exception {
        assertForbiddenForRole("WAREHOUSE");
    }

    @Test
    @DisplayName("U1: ACCOUNTANT는 매출 direct PUT 권한에서 제외된다 (403)")
    void testUpdateSalesForbiddenForAccountant() throws Exception {
        assertForbiddenForRole("ACCOUNTANT");
    }

    @Test
    @DisplayName("U1: INBOUND 전표에 매출 수정 endpoint 호출 시 403 + SLIP_UPDATE_NON_SALES를 반환한다")
    void testUpdateSalesNonOutboundForbidden() throws Exception {
        String id = createSlip("INBOUND", "SP0862-입고전표");
        String updatedAt = updatedAt(id);

        mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(updatedAt, "SP0862-입고전표", 2, "200000"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code", is("SLIP_UPDATE_NON_SALES")));
    }

    @Test
    @DisplayName("U1: 수정 성공 시 SLIP_EDIT audit revision 1건 이상을 기록한다")
    void testUpdateSalesAuditLogRecorded() throws Exception {
        String id = createSlip("OUTBOUND", "SP0862-audit-before");
        String updatedAt = updatedAt(id);

        mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(updatedAt, "SP0862-audit-after", 6, "210000"))))
                .andExpect(status().isOk());

        var logs = auditLogRepository.findBySlipIdOrderByRevisionNoDescChangedAtDesc(OpaqueUuidTestDecoder.decode(id));
        assertThat(logs).isNotEmpty();
        assertThat(logs).extracting(log -> log.getRevisionNo()).containsOnly(1);
        assertThat(logs).anyMatch(log -> "SLIP_EDIT".equals(log.getFieldName()));
        assertThat(logs).anyMatch(log -> "영업담당자".equals(log.getActorName()));
    }

    @Test
    @DisplayName("R2: controller JSON의 신규 BUNDLE 계보가 저장 후 GET/DB 왕복에서 보존된다")
    void testUpdateSalesBundleLineageRoundTrip() throws Exception {
        String id = createSlip("OUTBOUND", "SP1131-bundle");
        MvcResult detail = mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode detailData = objectMapper.readTree(detail.getResponse().getContentAsString()).path("data");
        String updatedAt = detailData.path("updatedAt").asText();
        UUID existingLineId = OpaqueUuidTestDecoder.decode(detailData.path("lines").get(0).path("id").asText());
        UUID bundleParentId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();

        Mockito.when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(invocation -> {
                    List<UUID> ids = invocation.getArgument(0);
                    return ids.stream()
                            .map(productId -> productId.equals(bundleParentId)
                                    ? new ProductSummary(productId, "검증 BUNDLE", "BUNDLE-IT", null,
                                    UUID.randomUUID(), new BigDecimal("7000"), "ACTIVE", false,
                                    "BUNDLE-IT", "BUNDLE")
                                    : new ProductSummary(productId, "검증 구성품", "COMPONENT-IT", null,
                                    UUID.randomUUID(), new BigDecimal("1000"), "ACTIVE"))
                            .toList();
                });
        Mockito.when(productClient.expand(
                        ArgumentMatchers.eq("BUNDLE-IT"), ArgumentMatchers.any(),
                        ArgumentMatchers.any(), ArgumentMatchers.any()))
                .thenReturn(List.of(
                        new ExpandedLineDto(firstComponentId, "COMP-1", "COMP-1", "구성품 1",
                                BigDecimal.ONE, new BigDecimal("1000"), "INDOOR", true),
                        new ExpandedLineDto(secondComponentId, "COMP-2", "COMP-2", "구성품 2",
                                BigDecimal.ONE, new BigDecimal("1000"), "OUTDOOR", false)));

        Map<String, Object> first = new HashMap<>();
        first.put("lineId", existingLineId.toString());
        first.put("productId", firstComponentId.toString());
        first.put("productName", "구성품 1");
        first.put("modelName", "COMP-1");
        first.put("quantity", 1);
        first.put("unitPrice", "1000");
        first.put("parentSetModel", "BUNDLE-IT");
        first.put("setHead", true);
        first.put("bundleParentProductId", bundleParentId.toString());
        first.put("bundleParentUnitPrice", "7000");
        first.put("setOptions", Map.of("remoteExcluded", false, "materialIncluded", false));
        Map<String, Object> second = new HashMap<>(first);
        second.put("lineId", null);
        second.put("productId", secondComponentId.toString());
        second.put("productName", "구성품 2");
        second.put("modelName", "COMP-2");
        second.put("setHead", false);

        Map<String, Object> body = new HashMap<>();
        body.put("updatedAt", updatedAt);
        body.put("partnerName", "SP1131-bundle");
        body.put("lines", List.of(first, second));
        body.put("lineIdContract", true);

        mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines", hasSize(2)))
                .andExpect(jsonPath("$.data.lines[0].parentSetModel", is("BUNDLE-IT")))
                .andExpect(jsonPath("$.data.lines[1].parentSetModel", is("BUNDLE-IT")))
                .andExpect(jsonPath("$.data.lines[0].setHead", is(true)))
                .andExpect(jsonPath("$.data.lines[1].setHead", is(false)));

        MvcResult roundTrip = mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines", hasSize(2)))
                .andReturn();
        JsonNode savedLines = objectMapper.readTree(roundTrip.getResponse().getContentAsString())
                .path("data").path("lines");
        assertThat(savedLines).allMatch(line -> "BUNDLE-IT".equals(line.path("parentSetModel").asText()));
        assertThat(slipRepository.findById(OpaqueUuidTestDecoder.decode(id)).orElseThrow().getLines())
                .allMatch(line -> "BUNDLE-IT".equals(line.getParentSetModel()));
    }

    @Test
    @DisplayName("R9 RED-A GREEN: 명시 이관 후 keyless 8행 두 인스턴스의 첫 head 수량 편집은 200이다")
    void testR9MigratedKeylessMultiInstancePositiveEdit() throws Exception {
        Slip fixture = persistR9KeylessTargetFixture();
        applyR9MigrationFixturePath();

        MvcResult detail = mockMvc.perform(get(SLIPS_PATH + "/" + fixture.getId())
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode data = objectMapper.readTree(detail.getResponse().getContentAsString()).path("data");
        String updatedAt = data.path("updatedAt").asText();
        List<Map<String, Object>> lines = new java.util.ArrayList<>();
        for (JsonNode line : data.path("lines")) {
            Map<String, Object> requestLine = objectMapper.convertValue(line, Map.class);
            requestLine.put("lineId", requestLine.remove("id"));
            if (line.path("setHead").asBoolean() && lines.isEmpty()) {
                requestLine.put("quantity", 2);
            }
            lines.add(requestLine);
        }

        Map<String, Object> body = new HashMap<>();
        body.put("updatedAt", updatedAt);
        body.put("partnerName", "R9 keyless 이관 전표");
        body.put("lines", lines);
        body.put("lineIdContract", true);

        mockMvc.perform(put(SLIPS_PATH + "/" + fixture.getId() + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "개발책임자")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines", hasSize(8)));

        List<Map<String, Object>> saved = jdbcTemplate.queryForList(
                "SELECT bundle_set_options FROM slip_lines WHERE slip_id = ? "
                        + "AND is_deleted = false AND parent_set_model = 'AC060CS6PBH1SY'",
                fixture.getId());
        assertThat(saved).hasSize(8);
        assertThat(saved).allMatch(row -> row.get("bundle_set_options").toString().contains("instanceKey"));
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT bundle_set_options->>'instanceKey') FROM slip_lines "
                        + "WHERE slip_id = ? AND is_deleted = false AND parent_set_model = 'AC060CS6PBH1SY'",
                Integer.class, fixture.getId())).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM slip_lines WHERE slip_id = ? AND is_deleted = false "
                        + "AND parent_set_model = 'AC060CS6PBH1SY' AND set_head = true",
                Integer.class, fixture.getId())).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT quantity FROM slip_lines WHERE slip_id = ? AND set_head = true "
                        + "AND is_deleted = false AND parent_set_model = 'AC060CS6PBH1SY' "
                        + "ORDER BY created_at LIMIT 1",
                Integer.class, fixture.getId())).isEqualTo(2);
    }

    @Test
    @DisplayName("S2b: 매출 direct PUT 저장은 EDIT revision 을 추가하고 헤더/품목 셀 diff 를 버전 이력에 노출한다")
    void testUpdateSalesAppendsRevisionFieldChanges() throws Exception {
        String id = createSlip("OUTBOUND", "SP0862-diff-before");
        MvcResult detail = mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode data = objectMapper.readTree(detail.getResponse().getContentAsString()).path("data");
        String updatedAt = data.path("updatedAt").asText();
        String productId = data.path("lines").get(0).path("productId").asText();
        Map<String, Object> body = updateBody(updatedAt, "SP0862-diff-after", 8, "210000");
        @SuppressWarnings("unchecked")
        Map<String, Object> firstLine = (Map<String, Object>) ((List<?>) body.get("lines")).get(0);
        firstLine.put("productId", productId);

        mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());

        MvcResult revisions = mockMvc.perform(get("/slips/{id}/revisions", OpaqueUuidTestDecoder.decode(id))
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "감사자")
                        .header(USER_ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].revisionNo").value(2))
                .andExpect(jsonPath("$.data[0].revisionType").value("EDIT"))
                .andExpect(jsonPath("$.data[0].actorName").value("영업담당자"))
                .andReturn();

        JsonNode latest = objectMapper.readTree(revisions.getResponse().getContentAsByteArray())
                .path("data").get(0);
        assertThat(latest.has("actorId")).isFalse();
        assertThat(latest.path("fieldChanges")).isNotEmpty();
        assertThat(latest.path("fieldChanges").toString()).contains("\"fieldPath\":\"header.partnerName\"");
        assertThat(latest.path("fieldChanges").toString()).contains("\"beforeValue\":\"SP0862-diff-before\"");
        assertThat(latest.path("fieldChanges").toString()).contains("\"afterValue\":\"SP0862-diff-after\"");
        assertThat(latest.path("fieldChanges").toString()).contains("\"fieldPath\":\"lines[0].quantity\"");
        assertThat(latest.path("fieldChanges").toString()).contains("\"beforeValue\":\"3\"");
        assertThat(latest.path("fieldChanges").toString()).contains("\"afterValue\":\"8\"");
        assertThat(latest.path("fieldChanges").toString()).contains("\"fieldPath\":\"lines[0].specification\"");
        assertThat(latest.path("fieldChanges").toString()).contains("\"afterValue\":\"B형\"");
        assertThat(latest.path("fieldChanges").toString()).contains("\"fieldPath\":\"lines[0].note\"");
        assertThat(latest.path("fieldChanges").toString()).contains("\"afterValue\":\"매출 수정 라인\"");
    }

    @Test
    @DisplayName("U1: 감리주소만 변경해도 SLIP_EDIT audit revision 1건을 기록한다")
    void testUpdateSalesSupervisionAddressOnlyAuditLogRecorded() throws Exception {
        String id = createSlip("OUTBOUND", "SP0862-supervision-audit");
        String updatedAt = updatedAt(id);
        Map<String, Object> body = updateBody(updatedAt, "SP0862-supervision-audit", 3, "200000");

        mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());

        auditLogRepository.deleteAll();
        body.put("updatedAt", updatedAt(id));
        body.put("supervisionAddress", "서울 강남구 감리지 변경");

        mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());

        var logs = auditLogRepository.findBySlipIdOrderByRevisionNoDescChangedAtDesc(OpaqueUuidTestDecoder.decode(id));
        assertThat(logs).hasSize(1);
        // 첫 PUT 에서 slip.revisionCount=1 진입, 두 번째 PUT 시 incrementRevision → revisionNo=2
        // 핵심은 SLIP_EDIT audit 기록 여부 (supervisionAddress 단독 변경도 summarize 비교 통과)
        assertThat(logs.get(0).getRevisionNo()).isEqualTo(2);
        assertThat(logs.get(0).getFieldName()).isEqualTo("SLIP_EDIT");
    }

    @Test
    @DisplayName("U1: soft-deleted 매출 전표 수정은 404를 반환한다")
    void testUpdateSalesSoftDeletedReturns404() throws Exception {
        String id = createSlip("OUTBOUND", "SP0862-삭제됨");
        String updatedAt = updatedAt(id);
        Slip slip = slipRepository.findById(OpaqueUuidTestDecoder.decode(id)).orElseThrow();
        slip.markDeleted("test");
        slipRepository.flush();

        mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(updatedAt, "SP0862-삭제됨", 2, "200000"))))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("U1: 수량 0 라인은 422 + SLIP_UPDATE_INVALID_LINE을 반환한다")
    void testUpdateSalesInvalidLineReturns422() throws Exception {
        String id = createSlip("OUTBOUND", "SP0862-라인검증");
        String updatedAt = updatedAt(id);

        mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(updatedAt, "SP0862-라인검증", 0, "200000"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code", is("SLIP_UPDATE_INVALID_LINE")));
    }

    private void assertForbiddenForRole(String role) throws Exception {
        String id = createSlip("OUTBOUND", "SP0862-" + role);
        String updatedAt = updatedAt(id);
        Mockito.when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.eq("sales.slip.edit"),
                        ArgumentMatchers.eq(PermissionAction.UPDATE)))
                .thenReturn(false);

        mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, role + "사용자")
                        .header(USER_ROLE_HEADER, role)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(updatedAt, "SP0862-" + role, 2, "200000"))))
                .andExpect(status().isForbidden());
    }

    private Slip persistR9KeylessTargetFixture() {
        UUID slipId = UUID.fromString("a1131a9e-0000-4000-8000-000000000119");
        List<UUID> lineIds = List.of(
                UUID.fromString("ff5b90ed-21b4-465c-b463-a050d3b93c99"),
                UUID.fromString("f8a7f65d-b1e7-4c1c-99aa-40194e555cf3"),
                UUID.fromString("de3ff7c0-5354-4c4a-a29d-35231629bd89"),
                UUID.fromString("7da4e3cd-420c-4035-991b-5cad02cae3e4"),
                UUID.fromString("bdabf372-7b4f-4847-acdb-3bb62d23e4fc"),
                UUID.fromString("866aae3a-7e91-49da-9755-bd1651d4ec01"),
                UUID.fromString("6d3f40e3-dc2b-44c4-ae4e-65834cec1c70"),
                UUID.fromString("c38aed6e-250f-43ef-8661-b8ea0496fb7a"));
        List<UUID> productIds = List.of(
                UUID.fromString("699ea2b8-825a-4451-b4e3-56abf6dcde1f"),
                UUID.fromString("03f6f413-a559-44d0-a202-097b647f0d45"),
                UUID.fromString("910a1efe-fa11-4bbf-9442-ee4f8acd01be"),
                UUID.fromString("4affd72c-0638-468c-8f06-14c5e6185663"),
                UUID.fromString("699ea2b8-825a-4451-b4e3-56abf6dcde1f"),
                UUID.fromString("03f6f413-a559-44d0-a202-097b647f0d45"),
                UUID.fromString("910a1efe-fa11-4bbf-9442-ee4f8acd01be"),
                UUID.fromString("4affd72c-0638-468c-8f06-14c5e6185663"));
        jdbcTemplate.update(
                "INSERT INTO slips (id, slip_type, slip_no, slip_date, seq_no, status, "
                        + "partner_id, partner_name, source_warehouse_id, destination_warehouse_id, "
                        + "requester_id, created_at, created_by) "
                        + "VALUES (?, 'OUTBOUND', '2026/08/07-20', '2026-08-07', 20, 'DRAFT', "
                        + "?, 'R9 keyless 이관 전표', ?, ?, ?, ?, 'R9 IT')",
                slipId, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), java.sql.Timestamp.valueOf("2026-08-07 17:30:35"));
        for (int i = 0; i < lineIds.size(); i++) {
            jdbcTemplate.update(
                    "INSERT INTO slip_lines (id, slip_id, product_id, product_name, model_name, "
                            + "quantity, unit_price, line_total, created_at, created_by, set_head, "
                            + "parent_set_model, bundle_set_options) "
                            + "VALUES (?, ?, ?, ?, ?, 1, 1000, 1000, ?, 'R9 IT', ?, "
                            + "'AC060CS6PBH1SY', ?::jsonb)",
                    lineIds.get(i), slipId, productIds.get(i), "R9 구성품 " + i, "R9-COMP-" + i,
                    java.sql.Timestamp.valueOf("2026-08-07 17:30:35").toLocalDateTime()
                            .plusNanos(i * 100_000),
                    i == 0 || i == 4,
                    "{\"remoteExcluded\":false,\"materialIncluded\":false}");
        }
        return slipRepository.findById(slipId).orElseThrow();
    }

    private void applyR9MigrationFixturePath() throws Exception {
        assertThat(jdbcTemplate.queryForList(
                "SELECT id::text FROM slip_lines WHERE parent_set_model = 'AC060CS6PBH1SY' "
                        + "AND is_deleted = false ORDER BY created_at", String.class))
                .as("R9 fixture line ids")
                .containsExactly(
                        "ff5b90ed-21b4-465c-b463-a050d3b93c99",
                        "f8a7f65d-b1e7-4c1c-99aa-40194e555cf3",
                        "de3ff7c0-5354-4c4a-a29d-35231629bd89",
                        "7da4e3cd-420c-4035-991b-5cad02cae3e4",
                        "bdabf372-7b4f-4847-acdb-3bb62d23e4fc",
                        "866aae3a-7e91-49da-9755-bd1651d4ec01",
                        "6d3f40e3-dc2b-44c4-ae4e-65834cec1c70",
                        "c38aed6e-250f-43ef-8661-b8ea0496fb7a");
        ClassPathResource migration = new ClassPathResource(
                "db/migration/V119__materialize_r9_keyless_bundle_instances.sql");
        try (var input = migration.getInputStream()) {
            jdbcTemplate.execute(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
        assertThat(jdbcTemplate.queryForObject(
                "WITH groups AS (SELECT s.id, l.parent_set_model, "
                        + "COUNT(*) FILTER (WHERE COALESCE(l.set_head, false)) AS heads "
                        + "FROM slips s JOIN slip_lines l ON l.slip_id=s.id "
                        + "WHERE s.is_deleted=false AND l.is_deleted=false "
                        + "AND NULLIF(BTRIM(l.bundle_set_options->>'instanceKey'),'') IS NULL "
                        + "GROUP BY s.id,l.parent_set_model) "
                        + "SELECT COUNT(*) FROM groups WHERE heads > 1", Integer.class))
                .isZero();
    }

    private String createSlip(String slipType, String partnerName) throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "매출 수정 IT 제품");
        line.put("modelName", "SAL-UPD");
        line.put("quantity", 3);
        line.put("unitPrice", 200000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", slipType);
        body.put("slipDate", TODAY.toString());
        body.put("sourceWarehouseId", "OUTBOUND".equals(slipType) ? UUID.randomUUID().toString() : null);
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", partnerName);
        body.put("memo", "SP-08-6-2 매출 수정 IT");
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

    private String updatedAt(String id) throws Exception {
        MvcResult result = mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
        return data.path("updatedAt").asText();
    }

    private Map<String, Object> updateBody(String updatedAt, String partnerName,
                                           int quantity, String unitPrice) {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "매출 수정 IT 제품");
        line.put("modelName", "SAL-UPD");
        line.put("specification", "B형");
        line.put("quantity", quantity);
        line.put("unitPrice", unitPrice);
        line.put("note", "매출 수정 라인");

        Map<String, Object> body = new HashMap<>();
        body.put("updatedAt", updatedAt);
        body.put("partnerName", partnerName);
        body.put("partnerCode", "SAL-EDIT-001");
        body.put("memo", "SP-08-6-2 수정 메모");
        body.put("businessNumber", "101-81-25508");
        body.put("deliveryAddress", "서울 강남구 납품지");
        body.put("supervisionAddress", "서울 강남구 감리지");
        body.put("projectName", "매출 수정 프로젝트");
        body.put("recipientPhone", "010-6666-6262");
        body.put("paymentDueDate", TODAY.plusDays(30).toString());
        body.put("lines", List.of(line));
        // [D-R8-9] 정상 최신 클라이언트 재현 — 계약 마커 (매입 IT 미러).
        body.put("lineIdContract", true);
        return body;
    }
}
