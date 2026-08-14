package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.permission.PermissionAction;
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
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
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
 * SP-08-6-3 출고 전표 soft delete endpoint IT.
 *
 * <p>SALES / MANAGER / MASTER 가 OUTBOUND 전표를 {@code updatedAt} 낙관적 잠금으로
 * 삭제하는 경로를 잠근다. 비-OUTBOUND, 이미 삭제됨, 권한 없음, stale 잠금, 출고 진행 단계
 * 등 9 케이스를 검증한다.
 *
 * <p>정책 결정 (OutboundShipping):
 * 삭제 허용 조건은 {@code Slip.status ∈ {DRAFT, SAVED}} 로 제한한다.
 * SENT 이후 단계는 422 {@code SLIP_DELETE_SALES_SHIPPED} 를 반환한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipSalesDeleteIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String SLIPS_PATH = "/slips";
    private static final String SALES_SUFFIX = "/sales";
    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Seoul"));
    private static final UUID TEST_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000063");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SlipRepository slipRepository;

    @Autowired
    private SlipAuditLogRepository auditLogRepository;

    @PersistenceContext
    private EntityManager entityManager;

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
                                    id, "매출 삭제 IT 제품", "SAL-DEL",
                                    UUID.randomUUID(), new BigDecimal("200000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "매출 삭제 IT 제품", "SAL-DEL",
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
    @DisplayName("D1: SALES 는 OUTBOUND 출고 전표를 soft delete 한다")
    void testDeleteSalesSuccess() throws Exception {
        String id = createSlip("OUTBOUND", "SP0863-삭제전");
        String updatedAt = updatedAt(id);

        mockMvc.perform(delete(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deleteBody(updatedAt))))
                .andExpect(status().isOk());

        // @Transactional 환경: DELETE 후 1차 캐시에 isDeleted=true 엔티티가 남아
        // @SQLRestriction 이 우회될 수 있으므로 flush() + clear() 로 캐시 완전 소거
        slipRepository.flush();
        entityManager.clear();

        // @SQLRestriction(is_deleted=false) 로 인해 삭제된 행은 새 SELECT 에서 필터링 → 404
        mockMvc.perform(get(SLIPS_PATH + "/" + id)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("D2: stale updatedAt 요청은 409 + SLIP_OPTIMISTIC_LOCK_CONFLICT 를 반환한다")
    void testDeleteSalesOptimisticLockConflict() throws Exception {
        String id = createSlip("OUTBOUND", "SP0863-락충돌");

        mockMvc.perform(delete(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deleteBody("2026-01-01T00:00:00"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is("SLIP_OPTIMISTIC_LOCK_CONFLICT")));
    }

    @Test
    @DisplayName("D3: soft-deleted 전표 재삭제는 404 를 반환한다")
    void testDeleteSalesAlreadyDeletedReturns404() throws Exception {
        String id = createSlip("OUTBOUND", "SP0863-이미삭제");
        String updatedAt = updatedAt(id);
        Slip slip = slipRepository.findById(UUID.fromString(id)).orElseThrow();
        slip.deleteForSales("test");
        slipRepository.flush();
        // deleteForSales() 후 1차 캐시 소거 — @SQLRestriction 이 후속 findById 에 정상 적용되도록
        entityManager.clear();

        mockMvc.perform(delete(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deleteBody(updatedAt))))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("D4: INVENTORY 는 매출 soft delete 권한에서 제외된다")
    void testDeleteSalesForbiddenForInventory() throws Exception {
        assertForbiddenForRole("INVENTORY");
    }

    @Test
    @DisplayName("D5: WAREHOUSE 는 매출 soft delete 권한에서 제외된다")
    void testDeleteSalesForbiddenForWarehouse() throws Exception {
        assertForbiddenForRole("WAREHOUSE");
    }

    @Test
    @DisplayName("D6: ACCOUNTANT 는 매출 soft delete 권한에서 제외된다")
    void testDeleteSalesForbiddenForAccountant() throws Exception {
        assertForbiddenForRole("ACCOUNTANT");
    }

    @Test
    @DisplayName("D7: INBOUND 전표는 매출 delete endpoint 에서 403 SLIP_DELETE_NON_SALES 를 반환한다")
    void testDeleteSalesNonOutboundForbidden() throws Exception {
        String id = createSlip("INBOUND", "SP0863-입고전표");
        String updatedAt = updatedAt(id);

        mockMvc.perform(delete(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deleteBody(updatedAt))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code", is("SLIP_DELETE_NON_SALES")));
    }

    @Test
    @DisplayName("D8: SENT 이후 단계 전표는 422 SLIP_DELETE_SALES_SHIPPED 를 반환한다")
    void testDeleteSalesShippedReturns422() throws Exception {
        String id = createSlip("OUTBOUND", "SP0863-출고진행");

        // DRAFT → SAVED → SENT 전이
        Slip slip = slipRepository.findById(UUID.fromString(id)).orElseThrow();
        slip.save();
        slip.send();
        slipRepository.flush();

        // updatedAt 갱신 후 다시 가져옴
        String freshUpdatedAt = updatedAt(id);

        mockMvc.perform(delete(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deleteBody(freshUpdatedAt))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code", is("SLIP_DELETE_SALES_SHIPPED")));
    }

    @Test
    @DisplayName("D9: 삭제 성공 시 SLIP_DELETE audit revision 1건을 기록한다")
    void testDeleteSalesAuditLogRecorded() throws Exception {
        String id = createSlip("OUTBOUND", "SP0863-audit-del");
        String updatedAt = updatedAt(id);

        mockMvc.perform(delete(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "영업담당자")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deleteBody(updatedAt))))
                .andExpect(status().isOk());

        // @SQLRestriction 으로 slip 이 숨겨지지만 audit log 는 별도 테이블 조회 가능
        var logs = auditLogRepository.findBySlipIdOrderByRevisionNoDescChangedAtDesc(UUID.fromString(id));
        assertThat(logs).isNotEmpty();
        assertThat(logs).allSatisfy(log -> assertThat(log.getRevisionNo()).isGreaterThanOrEqualTo(1));
        assertThat(logs).anyMatch(log -> "SLIP_DELETE".equals(log.getFieldName()));
        assertThat(logs).anyMatch(log -> "영업담당자".equals(log.getActorName()));
    }

    // -----------------------------------------------------------------------
    // 헬퍼 메서드
    // -----------------------------------------------------------------------

    private void assertForbiddenForRole(String role) throws Exception {
        String id = createSlip("OUTBOUND", "SP0863-" + role);
        String updatedAt = updatedAt(id);
        Mockito.when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.eq("sales.slip.edit"),
                        ArgumentMatchers.eq(PermissionAction.DELETE)))
                .thenReturn(false);

        mockMvc.perform(delete(SLIPS_PATH + "/" + id + SALES_SUFFIX)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, role + "사용자")
                        .header(USER_ROLE_HEADER, role)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deleteBody(updatedAt))))
                .andExpect(status().isForbidden());
    }

    private String createSlip(String slipType, String partnerName) throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "매출 삭제 IT 제품");
        line.put("modelName", "SAL-DEL");
        line.put("quantity", 3);
        line.put("unitPrice", 200000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", slipType);
        body.put("slipDate", TODAY.toString());
        body.put("sourceWarehouseId", "OUTBOUND".equals(slipType) ? UUID.randomUUID().toString() : null);
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", partnerName);
        body.put("memo", "SP-08-6-3 매출 삭제 IT");
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

    private Map<String, Object> deleteBody(String updatedAt) {
        Map<String, Object> body = new HashMap<>();
        body.put("updatedAt", updatedAt);
        return body;
    }
}
