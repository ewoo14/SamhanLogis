package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
 * SP-08-5-4 C1 검수 CTA 회귀 안전 가드 IT.
 *
 * <p>SP-08-5-1/2/3 시리즈 (구매관리 R1/R2 + U1 + D1) 병합 후 검수 CTA 흐름이
 * 정상 유지되는지 검증한다.
 *
 * <p>검증 영역:
 * <ul>
 *   <li>{@code testSavedSlipListedForInspectionCta} — SAVED 전표가 {@code /slips/query?slipType=INBOUND&status=SAVED} 결과에 포함</li>
 *   <li>{@code testConfirmedSlipListedForInspectionCta} — CONFIRMED 전표가 {@code status=CONFIRMED} 결과에 포함</li>
 *   <li>{@code testInspectingSlipExcludedFromEditable} — INSPECTING 전표 PUT 수정 시 409 CONFLICT (SP-08-5-2 정합)</li>
 *   <li>{@code testInspectingSlipExcludedFromDelete} — INSPECTING 전표 DELETE 시 422 SLIP_DELETE_INSPECTION_COMPLETED (SP-08-5-3 정합)</li>
 * </ul>
 *
 * <p>외부 RestClient 모두 {@code @MockBean} lenient stub 으로 격리한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipInspectionCtaRegressionIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String SLIPS_PATH = "/slips";
    private static final String QUERY_PATH = "/slips/query";
    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Seoul"));
    private static final UUID TEST_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000054");

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
    private ArologisDispatchClient arologisDispatchClient;

    @BeforeEach
    void setupLenientMocks() {
        auditLogRepository.deleteAll();
        Mockito.lenient().when(notificationChatRoomClient.findChatRoomNames(ArgumentMatchers.anyString()))
                .thenReturn(java.util.Collections.emptyList());
        Mockito.lenient().when(notificationChatRoomClient.findChatRoomNames(
                        ArgumentMatchers.anyString(), ArgumentMatchers.anyString()))
                .thenReturn(java.util.Collections.emptyList());
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(
                                    id, "회귀 IT 제품", "REG-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "회귀 IT 제품", "REG-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
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

    // -----------------------------------------------------------------------
    // C1: 검수 CTA 목록 조회 — SAVED/CONFIRMED 전표 포함 확인
    // -----------------------------------------------------------------------

    /**
     * SAVED 전표가 {@code /slips/query?slipType=INBOUND&status=SAVED} 결과에 포함된다.
     *
     * <p>SP-08-5-1 이후 구매관리 R1-query endpoint 가 저장완료 전표를 반환하는지 확인.
     * 검수 CTA 버튼은 SAVED 상태를 대상으로 노출되므로 이 조회가 깨지면 CTA 가 사라진다.
     */
    @Test
    @DisplayName("C1-01: SAVED 전표는 /slips/query?status=SAVED 에 포함된다")
    void testSavedSlipListedForInspectionCta() throws Exception {
        // DRAFT 전표 생성 후 save() → SAVED
        String slipId = createInboundSlip("SP0854-CTA-SAVED");
        Slip slip = slipRepository.findById(UUID.fromString(slipId)).orElseThrow();
        slip.save();
        slipRepository.flush();

        MvcResult result = mockMvc.perform(get(QUERY_PATH)
                        .param("slipType", "INBOUND")
                        .param("status", "SAVED")
                        .param("dateFrom", TODAY.toString())
                        .param("dateTo", TODAY.toString())
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString();
        assertThat(body).contains("SP0854-CTA-SAVED");

        JsonNode content = objectMapper.readTree(body).path("data").path("content");
        assertThat(content.toString()).contains("SAVED");
        // SAVED 전표만 반환 확인 — slipType + status 개별 단언
        for (JsonNode item : content) {
            assertThat(item.path("slipType").asText()).isEqualTo("INBOUND");
            assertThat(item.path("status").asText()).isEqualTo("SAVED");
        }
    }

    /**
     * CONFIRMED 전표가 {@code /slips/query?slipType=INBOUND&status=CONFIRMED} 결과에 포함된다.
     *
     * <p>검수 확정 완료 후 회계 처리 CTA 가 CONFIRMED 상태를 대상으로 노출된다.
     * SP-08-5-1 이후 CONFIRMED 전표 조회가 정상 동작하는지 회귀 확인.
     */
    @Test
    @DisplayName("C1-02: CONFIRMED 전표는 /slips/query?status=CONFIRMED 에 포함된다")
    void testConfirmedSlipListedForInspectionCta() throws Exception {
        String slipId = createInboundSlip("SP0854-CTA-CONFIRMED");
        // DRAFT → SAVED → SENT → ACCEPTED → PROCESSING → INSPECTING → COMPLETED → CONFIRMED 전이
        Slip slip = slipRepository.findById(UUID.fromString(slipId)).orElseThrow();
        slip.save();
        slip.send();
        slip.accept("시스템");
        slip.process();
        slip.complete();     // PROCESSING → INSPECTING
        slip.inspect("시스템"); // INSPECTING → COMPLETED
        slip.confirm();      // COMPLETED → CONFIRMED (입고전표)
        slipRepository.flush();

        MvcResult result = mockMvc.perform(get(QUERY_PATH)
                        .param("slipType", "INBOUND")
                        .param("status", "CONFIRMED")
                        .param("dateFrom", TODAY.toString())
                        .param("dateTo", TODAY.toString())
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString();
        assertThat(body).contains("SP0854-CTA-CONFIRMED");
    }

    // -----------------------------------------------------------------------
    // C2: INSPECTING 이후 차단 — SP-08-5-2 수정 정합
    // -----------------------------------------------------------------------

    /**
     * INSPECTING 단계 전표는 {@code PUT /slips/{id}} 수정 시 409 CONFLICT 를 반환한다.
     *
     * <p>SP-08-5-2 수정 endpoint 의 {@code requireEditable()} 가드가 SP-08-5-3/4 병합 이후에도
     * 정상 동작하는지 확인. EDITABLE_STATUSES = {DRAFT, SAVED} 이므로 INSPECTING 은 차단된다.
     *
     * <p>slip-service 도메인: {@link com.samhanair.logis.slip.domain.Slip#updateHeader}
     * → {@link com.samhanair.logis.slip.domain.Slip#requireEditable()} → CONFLICT.
     */
    @Test
    @DisplayName("C2-01: INSPECTING 전표 PUT 수정은 409 CONFLICT 를 반환한다 (SP-08-5-2 정합)")
    void testInspectingSlipExcludedFromEditable() throws Exception {
        String slipId = createInboundSlip("SP0854-EDITING-INSPECTING");

        // DRAFT → SAVED → SENT → ACCEPTED → PROCESSING → INSPECTING
        Slip slip = slipRepository.findById(UUID.fromString(slipId)).orElseThrow();
        slip.save();
        slip.send();
        slip.accept("시스템");
        slip.process();
        slip.complete(); // PROCESSING → INSPECTING
        slipRepository.flush();
        entityManager.clear(); // 1차 캐시 소거 — flush 후 스테일 updatedAt 방지 (SlipDeleteIT D8 패턴)

        String freshUpdatedAt = updatedAt(slipId);

        mockMvc.perform(put(SLIPS_PATH + "/" + slipId)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "창고담당자")
                        .header(USER_ROLE_HEADER, "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                updateBody(freshUpdatedAt, "SP0854-EDITING-INSPECTING-수정시도", 5, "100000"))))
                .andExpect(status().isConflict());
    }

    /**
     * COMPLETED 단계 전표는 {@code PUT /slips/{id}} 수정 시 409 CONFLICT 를 반환한다.
     *
     * <p>INSPECTING 이후 단계 (COMPLETED, CONFIRMED 포함) 전표도 EDITABLE_STATUSES 외부이므로
     * 수정 불가. SP-08-5-2 정합 추가 회귀 케이스.
     */
    @Test
    @DisplayName("C2-02: COMPLETED 전표 PUT 수정은 409 CONFLICT 를 반환한다 (SP-08-5-2 정합)")
    void testCompletedSlipExcludedFromEditable() throws Exception {
        String slipId = createInboundSlip("SP0854-EDITING-COMPLETED");

        Slip slip = slipRepository.findById(UUID.fromString(slipId)).orElseThrow();
        slip.save();
        slip.send();
        slip.accept("시스템");
        slip.process();
        slip.complete();       // INSPECTING
        slip.inspect("시스템"); // COMPLETED
        slipRepository.flush();
        entityManager.clear(); // 1차 캐시 소거 — flush 후 스테일 updatedAt 방지 (SlipDeleteIT D8 패턴)

        String freshUpdatedAt = updatedAt(slipId);

        mockMvc.perform(put(SLIPS_PATH + "/" + slipId)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "창고담당자")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                updateBody(freshUpdatedAt, "SP0854-EDITING-COMPLETED-수정시도", 3, "100000"))))
                .andExpect(status().isConflict());
    }

    // -----------------------------------------------------------------------
    // C3: INSPECTING 이후 차단 — SP-08-5-3 삭제 정합
    // -----------------------------------------------------------------------

    /**
     * INSPECTING 단계 전표는 {@code DELETE /slips/{id}} 시 422 SLIP_DELETE_INSPECTION_COMPLETED 를 반환한다.
     *
     * <p>SP-08-5-3 삭제 endpoint 의 {@link com.samhanair.logis.slip.domain.Slip#deleteForPurchase}
     * 가드가 SP-08-5-4 병합 이후에도 정상 동작하는지 확인.
     */
    @Test
    @DisplayName("C3-01: INSPECTING 전표 DELETE 는 422 SLIP_DELETE_INSPECTION_COMPLETED 를 반환한다 (SP-08-5-3 정합)")
    void testInspectingSlipExcludedFromDelete() throws Exception {
        String slipId = createInboundSlip("SP0854-DELETE-INSPECTING");

        Slip slip = slipRepository.findById(UUID.fromString(slipId)).orElseThrow();
        slip.save();
        slip.send();
        slip.accept("시스템");
        slip.process();
        slip.complete(); // PROCESSING → INSPECTING
        slipRepository.flush();

        String updatedAt = updatedAt(slipId);

        mockMvc.perform(delete(SLIPS_PATH + "/" + slipId)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "창고담당자")
                        .header(USER_ROLE_HEADER, "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deleteBody(updatedAt))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code", is("SLIP_DELETE_INSPECTION_COMPLETED")));
    }

    /**
     * CONFIRMED 단계 전표는 {@code DELETE /slips/{id}} 시 422 SLIP_DELETE_INSPECTION_COMPLETED 를 반환한다.
     *
     * <p>CONFIRMED 는 검수 완료·확정 이후 단계이므로 삭제 불가 정책이 유지되어야 한다.
     */
    @Test
    @DisplayName("C3-02: CONFIRMED 전표 DELETE 는 422 SLIP_DELETE_INSPECTION_COMPLETED 를 반환한다 (SP-08-5-3 정합)")
    void testConfirmedSlipExcludedFromDelete() throws Exception {
        String slipId = createInboundSlip("SP0854-DELETE-CONFIRMED");

        Slip slip = slipRepository.findById(UUID.fromString(slipId)).orElseThrow();
        slip.save();
        slip.send();
        slip.accept("시스템");
        slip.process();
        slip.complete();       // INSPECTING
        slip.inspect("시스템"); // COMPLETED
        slip.confirm();        // CONFIRMED
        slipRepository.flush();

        String updatedAt = updatedAt(slipId);

        mockMvc.perform(delete(SLIPS_PATH + "/" + slipId)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_NAME_HEADER, "창고담당자")
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deleteBody(updatedAt))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code", is("SLIP_DELETE_INSPECTION_COMPLETED")));
    }

    // -----------------------------------------------------------------------
    // 헬퍼 메서드
    // -----------------------------------------------------------------------

    /**
     * INBOUND 전표를 DRAFT 상태로 생성하고 슬립 ID(UUID 문자열)를 반환한다.
     *
     * @param partnerName 거래처명 (테스트 식별자로 사용)
     * @return 생성된 전표의 UUID 문자열
     */
    private String createInboundSlip(String partnerName) throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "회귀 IT 제품");
        line.put("modelName", "REG-001");
        line.put("quantity", 2);
        line.put("unitPrice", 100000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "INBOUND");
        body.put("slipDate", TODAY.toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", partnerName);
        body.put("memo", "SP-08-5-4 회귀 IT");
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
                        SlipType.INBOUND, slipNo)
                .orElseThrow()
                .getId()
                .toString();
    }

    /**
     * 전표 상세 조회에서 {@code updatedAt} 값을 추출한다.
     *
     * @param slipId 전표 UUID 문자열
     * @return updatedAt ISO 문자열
     */
    private String updatedAt(String slipId) throws Exception {
        MvcResult result = mockMvc.perform(get(SLIPS_PATH + "/" + slipId)
                        .header(USER_ID_HEADER, TEST_USER_ID.toString())
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
        return data.path("updatedAt").asText();
    }

    /**
     * PUT 수정 요청 바디를 생성한다.
     *
     * @param updatedAt   낙관적 잠금 타임스탬프
     * @param partnerName 수정할 거래처명
     * @param quantity    수정할 수량
     * @param unitPrice   수정할 단가 (문자열)
     * @return 요청 바디 Map
     */
    private Map<String, Object> updateBody(String updatedAt, String partnerName,
                                            int quantity, String unitPrice) {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "회귀 IT 제품");
        line.put("modelName", "REG-001");
        line.put("quantity", quantity);
        line.put("unitPrice", unitPrice);

        Map<String, Object> body = new HashMap<>();
        body.put("updatedAt", updatedAt);
        body.put("partnerName", partnerName);
        body.put("memo", "SP-08-5-4 수정 시도");
        body.put("lines", List.of(line));
        return body;
    }

    /**
     * DELETE 요청 바디를 생성한다.
     *
     * @param updatedAt 낙관적 잠금 타임스탬프
     * @return 요청 바디 Map
     */
    private Map<String, Object> deleteBody(String updatedAt) {
        Map<String, Object> body = new HashMap<>();
        body.put("updatedAt", updatedAt);
        return body;
    }
}
