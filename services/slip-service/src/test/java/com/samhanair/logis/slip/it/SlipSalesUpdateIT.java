package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.audit.repository.SlipAuditLogRepository;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.domain.Slip;
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
                // @Version 낙관적 잠금: saveAndFlush 후 version +1 보장 (초기 0 → 1)
                .andExpect(jsonPath("$.data.version").value(1));
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

        var logs = auditLogRepository.findBySlipIdOrderByRevisionNoDescChangedAtDesc(UUID.fromString(id));
        assertThat(logs).isNotEmpty();
        assertThat(logs).extracting(log -> log.getRevisionNo()).containsOnly(1);
        assertThat(logs).anyMatch(log -> "SLIP_EDIT".equals(log.getFieldName()));
        assertThat(logs).anyMatch(log -> "영업담당자".equals(log.getActorName()));
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

        var logs = auditLogRepository.findBySlipIdOrderByRevisionNoDescChangedAtDesc(UUID.fromString(id));
        assertThat(logs).hasSize(1);
        assertThat(logs.get(0).getRevisionNo()).isEqualTo(1);
        assertThat(logs.get(0).getFieldName()).isEqualTo("SLIP_EDIT");
    }

    @Test
    @DisplayName("U1: soft-deleted 매출 전표 수정은 404를 반환한다")
    void testUpdateSalesSoftDeletedReturns404() throws Exception {
        String id = createSlip("OUTBOUND", "SP0862-삭제됨");
        String updatedAt = updatedAt(id);
        Slip slip = slipRepository.findById(UUID.fromString(id)).orElseThrow();
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
        mockMvc.perform(put(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, role + "사용자")
                        .header(USER_ROLE_HEADER, role)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(updatedAt, "SP0862-" + role, 2, "200000"))))
                .andExpect(status().isForbidden());
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
        return body;
    }
}
