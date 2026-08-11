package com.samhanair.logis.slip.estimate.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.realtime.EstimateListRealtime;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import jakarta.persistence.EntityManager;
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
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
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
    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private EntityManager entityManager;
    @SpyBean
    private CollectionRealtimePublisher collectionRealtimePublisher;

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
        var created = objectMapper.readTree(result.getResponse().getContentAsString()).get("data");
        String id = created.get("id").asText();
        String estimateNo = created.get("estimateNo").asText();

        mockMvc.perform(get("/slips/estimates/" + id)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(id))
                .andExpect(jsonPath("$.data.totalSupply").isNumber())
                .andExpect(jsonPath("$.data.totalVat").isNumber());

        mockMvc.perform(get("/slips/estimates/" + estimateNo.replace("/", "-"))
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(id))
                .andExpect(jsonPath("$.data.estimateNo").value(estimateNo));
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
     * 언제든지 전환 정책 — DRAFT 견적을 send/accept 없이 곧바로 출고전표 전환.
     * 2026-06-09 개발책임자: "견적서나 주문서는 언제든지 출고전표로 전환할 수 있어야 한다."
     */
    @Test
    @DisplayName("언제든지 전환: DRAFT 견적 직접 convert → 200 QUOTE_CONVERTED (send/accept 생략)")
    void convertFromDraft_directly() throws Exception {
        MvcResult created = mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildCreateRequest())))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // DRAFT 그대로 convert (send/accept 없이) → 200 + CONVERTED
        mockMvc.perform(post("/slips/estimates/" + id + "/convert")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("QUOTE_CONVERTED"))
                .andExpect(jsonPath("$.data.convertedSlipId").isNotEmpty());

        // 재전환 시도 → 409 CONFLICT (이미 변환됨)
        mockMvc.perform(post("/slips/estimates/" + id + "/convert")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isConflict());
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
        updateBody.put("lineIdContract", true); // [D-R8-9] 정상 최신 클라이언트 재현

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

    @Test
    @DisplayName("견적 삭제 후 목록은 삭제 메타를 포함하고 복원은 활성행으로 되돌린다")
    void delete_listIncludesDeletedMetadata_andRestoreReactivates() throws Exception {
        MvcResult created = mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Name", "작성자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildCreateRequest())))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(delete("/slips/estimates/{id}", id)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Name", "이운영"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/slips/estimates")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .param("size", "50")
                        .param("includeDeleted", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].id").value(id))
                .andExpect(jsonPath("$.data.content[0].isDeleted").value(true))
                .andExpect(jsonPath("$.data.content[0].deletedByName").value("이운영"))
                .andExpect(jsonPath("$.data.content[0].deletedAt").exists());

        mockMvc.perform(post("/slips/estimates/{id}/restore", id)
                        .header("X-User-Id", SALES_ACCOUNT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(id))
                .andExpect(jsonPath("$.data.isDeleted").value(false))
                .andExpect(jsonPath("$.data.deletedByName").doesNotExist());
    }

    @Test
    @DisplayName("견적 목록 status 필터는 native enum name 문자열로 QUOTE_CONVERTED를 조회한다")
    void list_statusFilterConverted_returnsConvertedRows() throws Exception {
        MvcResult created = mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildCreateRequest())))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();
        mockMvc.perform(post("/slips/estimates/{id}/convert", id)
                        .header("X-User-Id", SALES_ACCOUNT_ID))
                .andExpect(status().isOk());

        mockMvc.perform(get("/slips/estimates")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .param("status", "QUOTE_CONVERTED")
                        .param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(id))
                .andExpect(jsonPath("$.data.content[0].status").value("QUOTE_CONVERTED"));
    }

    @Test
    @DisplayName("삭제 견적 복원 시 같은 견적번호 활성행이 있으면 409를 반환한다")
    void restore_whenActiveEstimateReusesNumber_returns409() throws Exception {
        MvcResult created = mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildCreateRequest())))
                .andExpect(status().isCreated())
                .andReturn();
        var data = objectMapper.readTree(created.getResponse().getContentAsString()).get("data");
        String id = data.get("id").asText();
        String estimateNo = data.get("estimateNo").asText();

        mockMvc.perform(delete("/slips/estimates/{id}", id)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Name", "이운영"))
                .andExpect(status().isOk());
        entityManager.flush();
        jdbcTemplate.update("""
                INSERT INTO estimates
                    (id, estimate_no, estimate_date, seq_no, status,
                     total_supply, total_vat, total_amount, requester_id, version,
                     created_at, created_by, is_deleted)
                VALUES
                    (?::uuid, ?, DATE '2026-05-11', 99, 'QUOTE_DRAFT',
                     0, 0, 0, ?, 0,
                     NOW(), ?, FALSE)
                """,
                UUID.randomUUID().toString(), estimateNo, SALES_ACCOUNT_ID, SALES_ACCOUNT_ID);

        mockMvc.perform(post("/slips/estimates/{id}/restore", id)
                        .header("X-User-Id", SALES_ACCOUNT_ID))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("견적 삭제와 복원은 견적 목록 realtime 변경 이벤트를 발화한다")
    void deleteAndRestore_publishEstimateListChanged() throws Exception {
        MvcResult created = mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildCreateRequest())))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(delete("/slips/estimates/{id}", id)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Name", "이운영"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/estimates/{id}/restore", id)
                        .header("X-User-Id", SALES_ACCOUNT_ID))
                .andExpect(status().isOk());

        verify(collectionRealtimePublisher).publishChange(
                eq(EstimateListRealtime.CHANNEL_ID),
                eq(EstimateListRealtime.EVENT_CHANGED),
                ArgumentMatchers.<Map<String, Object>>argThat(
                        payload -> "DELETED".equals(payload.get("changeType"))));
        verify(collectionRealtimePublisher).publishChange(
                eq(EstimateListRealtime.CHANNEL_ID),
                eq(EstimateListRealtime.EVENT_CHANGED),
                ArgumentMatchers.<Map<String, Object>>argThat(
                        payload -> "RESTORED".equals(payload.get("changeType"))));
    }

    /**
     * CONVERTED 견적 delete→restore 회귀 (PR #759 STEP4 적대검증 M2, 2026-07-07).
     *
     * <p>개발책임자 결정 — "CONVERTED 견적도 삭제 가능(상태 무관, 목록 tombstone 처리이며
     * {@code converted_slip_id}/전표 원장은 건드리지 않는다)"
     * ({@link com.samhanair.logis.slip.estimate.service.EstimateService#delete} Javadoc) 이
     * 안전함을 값 검증으로 고정한다.
     * {@link com.samhanair.logis.slip.estimate.service.EstimateService#delete}/{@link
     * com.samhanair.logis.slip.estimate.service.EstimateService#restore} 는
     * {@code slipConverter}({@code EstimateToSlipConverter})나
     * {@code SlipRepository} 를 전혀 참조하지 않고, {@code converted_slip_id} 는 logical FK
     * ({@code V13__add_estimate.sql} — {@code REFERENCES} 미선언)이므로 물리적 cascade 경로 자체가
     * 없다 — 이 테스트는 그 무연쇄성을 코드 리뷰가 아닌 실행 값으로 고정한다.
     *
     * <p>검증 순서: 생성 → convert(CONVERTED 전이 + Slip(OUTBOUND DRAFT) 실제 발행) → 변환 직후
     * Slip 행 스냅샷 캡처 → delete(상태 무관 허용) → 목록 includeDeleted 에 삭제행으로 노출되면서
     * status/convertedSlipId 보존 → restore → status/convertedSlipId 보존 + Slip 행이 스냅샷과
     * 완전 동일(is_deleted/status/version/deleted_at/modified_at 전부 무변화).
     */
    @Test
    @DisplayName("CONVERTED 견적 삭제→복원은 상태무관 허용되며 status/convertedSlipId 보존 + Slip 테이블 무연쇄")
    void deleteAndRestore_convertedEstimate_preservesStatusAndSlipTableUntouched() throws Exception {
        // 1) 생성 → 즉시 변환 (DRAFT → CONVERTED). productClient 등 외부 RestClient 만 MockBean 이고
        //    SlipRepository/OutboundCutoffGuard/SlipNumberService 는 실 빈 + 실 DB 이므로 Slip(OUTBOUND
        //    DRAFT) 이 slips 테이블에 실제로 발행된다.
        MvcResult created = mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Name", "작성자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(buildCreateRequest())))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        MvcResult converted = mockMvc.perform(post("/slips/estimates/{id}/convert", id)
                        .header("X-User-Id", SALES_ACCOUNT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("QUOTE_CONVERTED"))
                .andExpect(jsonPath("$.data.convertedSlipId").isNotEmpty())
                .andReturn();
        String convertedSlipId = objectMapper.readTree(converted.getResponse().getContentAsString())
                .get("data").get("convertedSlipId").asText();
        assertThat(convertedSlipId).isNotBlank();

        // 변환 직후 Slip 행 스냅샷 — delete/restore 전체에 걸쳐 이 값과 계속 동일해야 "무연쇄".
        // (entityManager.flush() 로 convert() 가 영속화한 Slip 을 물리 INSERT 로 내보낸 뒤 조회 —
        //  restore_whenActiveEstimateReusesNumber_returns409 와 동일한 flush+raw SQL 조합 패턴.)
        entityManager.flush();
        Map<String, Object> slipSnapshotBeforeDelete = jdbcTemplate.queryForMap(
                "SELECT is_deleted, status, version, deleted_at, modified_at FROM slips WHERE id = ?::uuid",
                convertedSlipId);

        // 2) delete — CONVERTED 도 삭제 허용(상태 무관). 출고전표 원장 미접촉이 정책.
        mockMvc.perform(delete("/slips/estimates/{id}", id)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Name", "이운영"))
                .andExpect(status().isOk());

        // 3) 목록 includeDeleted 노출 — 삭제행이면서 CONVERTED 상태/convertedSlipId 를 그대로 보존.
        mockMvc.perform(get("/slips/estimates")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .param("size", "50")
                        .param("includeDeleted", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].id").value(id))
                .andExpect(jsonPath("$.data.content[0].isDeleted").value(true))
                .andExpect(jsonPath("$.data.content[0].status").value("QUOTE_CONVERTED"))
                .andExpect(jsonPath("$.data.content[0].convertedSlipId").value(convertedSlipId))
                .andExpect(jsonPath("$.data.content[0].deletedByName").value("이운영"));

        entityManager.flush();
        Map<String, Object> slipSnapshotAfterDelete = jdbcTemplate.queryForMap(
                "SELECT is_deleted, status, version, deleted_at, modified_at FROM slips WHERE id = ?::uuid",
                convertedSlipId);
        assertThat(slipSnapshotAfterDelete).isEqualTo(slipSnapshotBeforeDelete);

        // 4) restore — status/convertedSlipId 보존 확인.
        mockMvc.perform(post("/slips/estimates/{id}/restore", id)
                        .header("X-User-Id", SALES_ACCOUNT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(id))
                .andExpect(jsonPath("$.data.isDeleted").value(false))
                .andExpect(jsonPath("$.data.status").value("QUOTE_CONVERTED"))
                .andExpect(jsonPath("$.data.convertedSlipId").value(convertedSlipId))
                .andExpect(jsonPath("$.data.deletedByName").doesNotExist());

        // Slip 테이블 무연쇄 — restore 이후에도 변환 직후 스냅샷과 완전히 동일(행 자체를 전혀 건드리지
        // 않음: is_deleted/status/version/deleted_at/modified_at 전부 무변화).
        entityManager.flush();
        Map<String, Object> slipSnapshotAfterRestore = jdbcTemplate.queryForMap(
                "SELECT is_deleted, status, version, deleted_at, modified_at FROM slips WHERE id = ?::uuid",
                convertedSlipId);
        assertThat(slipSnapshotAfterRestore).isEqualTo(slipSnapshotBeforeDelete);
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
    @DisplayName("GREEN-A-1: V37 기본 지정 세트 견적 저장")
    void createEstimate_backfilledBundle_savesExpandedLines() throws Exception {
        UUID setId = UUID.randomUUID();
        ProductSummary setSummary = new ProductSummary(setId, "상업멀티 22HP 세트", "AM220AXVHHR1SY", null,
                null, new BigDecimal("15242370"), null, false, "AM220AXVHHR1SY", "BUNDLE");
        Mockito.when(productClient.lookup(ArgumentMatchers.anyList())).thenReturn(List.of(setSummary));
        Mockito.when(productClient.expand(ArgumentMatchers.eq("AM220AXVHHR1SY"), ArgumentMatchers.any(),
                        ArgumentMatchers.any(), ArgumentMatchers.any()))
                .thenReturn(List.of(
                        new ExpandedLineDto(UUID.randomUUID(), "AM100AXVHHR1", "AM100AXVHHR1", "실내기",
                                BigDecimal.ONE, new BigDecimal("4560050"), "INDOOR", true),
                        new ExpandedLineDto(UUID.randomUUID(), "AM120AXVHHR1", "AM120AXVHHR1", "실외기",
                                BigDecimal.ONE, new BigDecimal("5280000"), "OUTDOOR", false)));

        Map<String, Object> lineReq = new HashMap<>();
        lineReq.put("productId", setId.toString());
        lineReq.put("quantity", 1);
        lineReq.put("unitPrice", "15242370");
        Map<String, Object> body = new HashMap<>();
        body.put("partnerName", "GREEN-A 견적 거래처");
        body.put("lines", List.of(lineReq));

        mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.lines.length()").value(2))
                .andExpect(jsonPath("$.data.lines[0].productName").value("실내기"))
                .andExpect(jsonPath("$.data.lines[1].productName").value("실외기"));
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
