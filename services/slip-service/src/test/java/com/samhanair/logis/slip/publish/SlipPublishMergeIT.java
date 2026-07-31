package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.PartnerInternalClient.PartnerVerifyResult;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipPublishAudit;
import com.samhanair.logis.slip.domain.SlipSourceOrder;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.SlipPublishAuditRepository;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.SlipSourceOrderRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 다중 주문 → 단일 출고전표 병합 발행 통합 테스트 — Phase 2.6b D2.
 *
 * <p>케이스:
 * <ol>
 *   <li>2주문 병합 발행 → slipNo 발급 + {@code slip_source_orders} 2행</li>
 *   <li>헤더 '/' 병기 (shippingAddress="서울/부산") 그대로 저장 확인</li>
 *   <li>멱등 재시도 (같은 키 + 같은 본문) → 동일 slipNo replay (200 OK)</li>
 *   <li>같은 키 + 다른 본문 → 409 Conflict</li>
 *   <li>findBySource(비대표 ORDER_B) → 병합 전표 포함</li>
 *   <li>발행 후 slip.status == SENT (불변 전이)</li>
 * </ol>
 *
 * <p>외부 client 격리 ({@code feedback_it_mockbean_external_clients}):
 * <ul>
 *   <li>{@link ProductClient} — lookupByModel 가짜 ProductSummary 반환</li>
 *   <li>{@link InventoryClient} — lenient (slip 발행 경로에서 미호출)</li>
 *   <li>{@link PartnerInternalClient} — FOUND 반환</li>
 *   <li>{@link UserInternalClient} / {@link WarehouseInternalClient} — lenient</li>
 * </ul>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.publish.warehouse-code-map.MERGE-WH=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "app.publish.warehouse-code-map.00003=11111111-1111-1111-1111-111111111111"
})
class SlipPublishMergeIT extends AbstractPostgresIT {

    private static final UUID ORDER_A_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID ORDER_B_ID = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static final UUID RESOLVED_PARTNER_ID =
            UUID.fromString("bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb");
    private static final String WAREHOUSE_CODE = "MERGE-WH";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SlipRepository slipRepository;

    @Autowired
    private SlipSourceOrderRepository sourceOrderRepository;

    @Autowired
    private SlipPublishAuditRepository auditRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setupMocks() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        Mockito.lenient().when(productClient.lookupByModel(ArgumentMatchers.anyString()))
                .thenAnswer(inv -> new ProductSummary(
                        UUID.randomUUID(), "테스트 제품", inv.getArgument(0, String.class),
                        UUID.randomUUID(), new BigDecimal("50000"), "ACTIVE"));
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenReturn(List.of());
        Mockito.lenient().when(partnerInternalClient.verifyPartnerCode(ArgumentMatchers.anyString()))
                .thenReturn(PartnerVerifyResult.found(Optional.of(RESOLVED_PARTNER_ID)));
    }

    // ---- 케이스 1: 2주문 병합 발행 → slipNo + slip_source_orders 2행 ----

    @Test
    void 두_주문을_단일_전표로_병합_발행하고_slip_source_orders_2행을_기록한다() throws Exception {
        // sourceOrderLineId 를 line 에 포함하여 DB 저장 여부 단언 (QA S-2)
        UUID lineASourceId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID lineBSourceId = UUID.fromString("22222222-2222-2222-2222-222222222222");

        Map<String, Object> sourceOrderA = new LinkedHashMap<>();
        sourceOrderA.put("partnerOrderId", ORDER_A_ID.toString());
        sourceOrderA.put("orderNo", "2026/05/31-001");

        Map<String, Object> sourceOrderB = new LinkedHashMap<>();
        sourceOrderB.put("partnerOrderId", ORDER_B_ID.toString());
        sourceOrderB.put("orderNo", "2026/05/31-002");

        Map<String, Object> line1 = new LinkedHashMap<>();
        line1.put("lineNo", 1);
        line1.put("productCode", "MODEL-MERGE-1");
        line1.put("productName", "병합 테스트 제품1");
        line1.put("qty", "2");
        line1.put("unitPriceVat", 110000);
        line1.put("sourceOrderLineId", lineASourceId.toString());

        Map<String, Object> line2 = new LinkedHashMap<>();
        line2.put("lineNo", 2);
        line2.put("productCode", "MODEL-MERGE-2");
        line2.put("productName", "병합 테스트 제품2");
        line2.put("qty", "3");
        line2.put("unitPriceVat", 55000);
        line2.put("sourceOrderLineId", lineBSourceId.toString());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sourceOrders", List.of(sourceOrderA, sourceOrderB));
        body.put("ioDate", "20260531");
        body.put("partnerId", RESOLVED_PARTNER_ID.toString());
        body.put("partnerCode", "P0001");
        body.put("partnerName", "거래처A");
        body.put("warehouseCode", WAREHOUSE_CODE);
        body.put("shippingAddress", "서울");
        body.put("receiverPhone", "010-1234-5678");
        body.put("paymentDueLabel", "익월말");
        body.put("discountInfo", null);
        body.put("memo", null);
        body.put("lines", List.of(line1, line2));

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", "case1-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.slipNo").isNotEmpty())
                .andExpect(jsonPath("$.data.sourceType").value("PARTNER_ORDER"))
                .andExpect(jsonPath("$.data.idempotentReplay").value(false))
                .andReturn();

        UUID slipId = readSlipId(result);

        // (1) slip_source_orders 2행 검증
        List<SlipSourceOrder> sources = sourceOrderRepository.findAllBySlipId(slipId);
        assertThat(sources).hasSize(2);
        assertThat(sources).extracting(SlipSourceOrder::getOrderNo)
                .containsExactlyInAnyOrder("2026/05/31-001", "2026/05/31-002");
        assertThat(sources).extracting(SlipSourceOrder::getPartnerOrderId)
                .containsExactlyInAnyOrder(ORDER_A_ID, ORDER_B_ID);

        // (2) W-3: slip.source_id == 대표(첫) 주문 UUID DB 단언 (QA W-3 / S-3)
        Slip slip = slipRepository.findById(slipId).orElseThrow();
        assertThat(slip.getSourceId())
                .as("slip.source_id 는 대표(첫) 주문 ORDER_A_ID 여야 함")
                .isEqualTo(ORDER_A_ID.toString());

        // (3) S-5: slip.partner_code 스냅샷 단언
        assertThat(slip.getPartnerCode())
                .as("slip.partner_code 는 요청의 partnerCode 스냅샷이어야 함")
                .isEqualTo("P0001");

        // (4) S-2: slip_lines.source_order_line_id DB 저장 단언 (JDBC 직접 조회 — LAZY 초기화 방지)
        List<UUID> savedSourceLineIds = jdbcTemplate.queryForList(
                        "SELECT source_order_line_id FROM slip_lines WHERE slip_id = ? AND is_deleted = FALSE",
                        UUID.class, slipId)
                .stream().filter(id -> id != null).toList();
        assertThat(savedSourceLineIds)
                .as("slip_lines.source_order_line_id 가 요청의 sourceOrderLineId 로 저장되어야 함")
                .containsExactlyInAnyOrder(lineASourceId, lineBSourceId);
    }

    // ---- 케이스 2: 헤더 '/' 병기 그대로 저장 ----

    @Test
    void 헤더_슬래시_병기_shippingAddress가_그대로_저장된다() throws Exception {
        String idemKey = "case2-slash";
        Map<String, Object> body = mergeBody(
                ORDER_A_ID.toString(), "2026/05/31-A",
                ORDER_B_ID.toString(), "2026/05/31-B",
                "P0001", "거래처A", WAREHOUSE_CODE,
                "서울/부산", idemKey);

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        UUID slipId = readSlipId(result);
        Slip slip = slipRepository.findById(slipId).orElseThrow();
        assertThat(slip.getShippingAddress()).isEqualTo("서울/부산");
    }

    // ---- 케이스 3: 멱등 재시도 → 동일 slipNo replay ----

    @Test
    void 같은_키와_같은_본문_멱등_재시도는_같은_slipNo를_반환한다() throws Exception {
        String idemKey = "case3-idem";
        Map<String, Object> body = mergeBody(
                ORDER_A_ID.toString(), "2026/05/31-idem-A",
                ORDER_B_ID.toString(), "2026/05/31-idem-B",
                "P0001", "거래처A", WAREHOUSE_CODE,
                "서울", idemKey);

        // 1차 호출 — 201
        MvcResult first = mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String firstSlipNo = readSlipNo(first);

        // 2차 호출 — 200 replay
        MvcResult second = mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.idempotentReplay").value(true))
                .andReturn();
        String secondSlipNo = readSlipNo(second);

        assertThat(secondSlipNo).isEqualTo(firstSlipNo);

        UUID slipId = readSlipId(first);

        // (1) slip_source_orders 는 1차 때만 2행 저장 — 2차 replay 시 재삽입 없음
        assertThat(sourceOrderRepository.findAllBySlipId(slipId))
                .as("멱등 재시도 후 slip_source_orders 행 수는 2건 유지 (재삽입 없음)")
                .hasSize(2);

        // (2) W-4: SlipPublishAudit 1건 유지 — 멱등 재시도 시 audit 재삽입 없음 (QA W-4)
        List<SlipPublishAudit> audits = auditRepository.findAllBySlipIdAndIsDeletedFalse(slipId);
        assertThat(audits)
                .as("멱등 replay 후 SlipPublishAudit 는 1건이어야 함 (재삽입 없음)")
                .hasSize(1);

        // (3) audit.sourceId == 대표 주문 UUID (QA S-4)
        assertThat(audits.get(0).getSourceId())
                .as("SlipPublishAudit.sourceId 는 대표(첫) 주문 ORDER_A_ID 여야 함")
                .isEqualTo(ORDER_A_ID.toString());
    }

    // ---- 케이스 4: 같은 키 + 다른 본문 → 409 ----

    @Test
    void 같은_키_다른_본문은_409_Conflict를_반환한다() throws Exception {
        String idemKey = "case4-conflict";
        Map<String, Object> body1 = mergeBody(
                ORDER_A_ID.toString(), "2026/05/31-conf-A",
                ORDER_B_ID.toString(), "2026/05/31-conf-B",
                "P0001", "거래처A", WAREHOUSE_CODE,
                "서울", idemKey);

        mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body1)))
                .andExpect(status().isCreated());

        // 라인 수량 변경 → 다른 본문
        Map<String, Object> body2 = mergeBody(
                ORDER_A_ID.toString(), "2026/05/31-conf-A",
                ORDER_B_ID.toString(), "2026/05/31-conf-B",
                "P0001", "거래처A", WAREHOUSE_CODE,
                "서울", idemKey);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines2 = (List<Map<String, Object>>) body2.get("lines");
        lines2.get(0).put("qty", "999");

        mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body2)))
                .andExpect(status().isConflict());
    }

    // ---- 케이스 5: findBySource(비대표 ORDER_B) → 병합 전표 포함 ----

    @Test
    void findBySource_비대표_주문으로_조회해도_병합_전표가_반환된다() throws Exception {
        String idemKey = "case5-source";
        Map<String, Object> body = mergeBody(
                ORDER_A_ID.toString(), "2026/05/31-src-A",
                ORDER_B_ID.toString(), "2026/05/31-src-B",
                "P0001", "거래처A", WAREHOUSE_CODE,
                "서울", idemKey);

        MvcResult merged = mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String mergedSlipNo = readSlipNo(merged);

        // ORDER_B 는 비대표(sourceOrders[1]) → slip.source_id 에는 ORDER_A 만 들어감
        // findBySource 가 slip_source_orders UNION 으로 ORDER_B 도 잡아야 함
        mockMvc.perform(get("/api/v1/slips/by-source")
                        .param("sourceType", "PARTNER_ORDER")
                        .param("sourceId", ORDER_B_ID.toString())
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(result -> {
                    JsonNode data = objectMapper.readTree(
                            result.getResponse().getContentAsString()).get("data");
                    assertThat(data.isArray()).isTrue();
                    boolean found = false;
                    for (JsonNode item : data) {
                        if (mergedSlipNo.equals(item.get("slipNo").asText())) {
                            found = true;
                            break;
                        }
                    }
                    assertThat(found)
                            .as("비대표 주문 ORDER_B 로 findBySource 조회 시 병합 전표(%s)가 포함되어야 함", mergedSlipNo)
                            .isTrue();
                });
    }

    // ---- 케이스 6: 발행 후 slip.status == SENT ----

    @Test
    void 병합_발행_후_전표_상태는_SENT로_불변_전이된다() throws Exception {
        String idemKey = "case6-sent";
        Map<String, Object> body = mergeBody(
                ORDER_A_ID.toString(), "2026/05/31-sent-A",
                ORDER_B_ID.toString(), "2026/05/31-sent-B",
                "P0001", "거래처A", WAREHOUSE_CODE,
                "서울", idemKey);

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        UUID slipId = readSlipId(result);
        Slip slip = slipRepository.findById(slipId).orElseThrow();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.SENT);
        assertThat(slip.getPartnerId()).isEqualTo(RESOLVED_PARTNER_ID);
    }

    @Test
    void 동일_코드가_재사용되어도_병합요청의_거래처_UUID를_전표에_보존한다() throws Exception {
        UUID historicalPartnerId = UUID.fromString("11111111-2222-4333-8444-555555555555");
        Map<String, Object> body = mergeBody(
                ORDER_A_ID.toString(), "2026/05/31-identity-A",
                ORDER_B_ID.toString(), "2026/05/31-identity-B",
                "REUSED-CODE-X", "거래처A", WAREHOUSE_CODE,
                "서울", "case-identity-preserve");
        body.put("partnerId", historicalPartnerId.toString());

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", "case-identity-preserve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        Slip slip = slipRepository.findById(readSlipId(result)).orElseThrow();
        assertThat(slip.getPartnerId())
                .as("코드 재조회 결과가 아니라 병합 시 확정한 거래처 UUID를 보존해야 함")
                .isEqualTo(historicalPartnerId);
    }

    @Test
    void mergePublish_missingPartnerIdentity_doesNotCreateAnything() throws Exception {
        String primaryOrderId = UUID.randomUUID().toString();
        String idemKey = "merge-partner-identity-required";
        Map<String, Object> body = mergeBody(
                primaryOrderId, "2026/05/31-fail-A",
                UUID.randomUUID().toString(), "2026/05/31-fail-B",
                "P-MISSING", "거래처 없음", WAREHOUSE_CODE,
                "서울", idemKey);
        body.remove("partnerId");

        mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());

        assertThat(slipRepository.findAllBySourceTypeAndSourceIdAndIsDeletedFalse(
                com.samhanair.logis.slip.domain.SlipSourceType.PARTNER_ORDER, primaryOrderId))
                .isEmpty();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM slips WHERE idempotency_key = ?", Integer.class, idemKey))
                .isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM slip_source_orders WHERE partner_order_id = ?",
                Integer.class, UUID.fromString(primaryOrderId)))
                .isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM slip_publish_audit WHERE source_id = ?",
                Integer.class, primaryOrderId))
                .isZero();
    }

    // ---- helpers ----

    /**
     * 2주문 병합 발행 요청 본문 빌더.
     *
     * @param orderAId    첫 번째 주문 UUID 문자열 (대표 주문)
     * @param orderANo    첫 번째 주문번호
     * @param orderBId    두 번째 주문 UUID 문자열 (비대표 주문)
     * @param orderBNo    두 번째 주문번호
     * @param partnerCode 거래처 코드
     * @param partnerName 거래처명
     * @param warehouseCode 창고 코드
     * @param shippingAddress 배송지 (FE 확정 병기값)
     * @param idemKey     Idempotency-Key (body 바깥에서도 헤더로 사용하나 fingerprint 계산용)
     * @return 요청 본문 Map
     */
    @Test
    void 배포전_병합멱등키_배송주소없는_재시도는_기존전표를_replay한다() throws Exception {
        String idemKey = "legacy-merge-replay";
        Map<String, Object> body = mergeBody(
                ORDER_A_ID.toString(), "2026/05/31-legacy-A",
                ORDER_B_ID.toString(), "2026/05/31-legacy-B",
                "P0001", "테스트 거래처", WAREHOUSE_CODE, null, idemKey);

        MvcResult first = mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID slipId = readSlipId(first);
        jdbcTemplate.update("UPDATE slip_publish_audit SET request_fingerprint = ? WHERE slip_id = ?",
                legacyMergeFingerprint(body), slipId);

        mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.idempotentReplay").value(true))
                .andExpect(jsonPath("$.data.slipId").value(slipId.toString()));
    }

    @Test
    void 배포전_병합멱등키에_새배송주소를_넣은_재시도는_409다() throws Exception {
        String idemKey = "legacy-merge-conflict";
        Map<String, Object> body = mergeBody(
                ORDER_A_ID.toString(), "2026/05/31-legacy-conflict-A",
                ORDER_B_ID.toString(), "2026/05/31-legacy-conflict-B",
                "P0001", "테스트 거래처", WAREHOUSE_CODE, null, idemKey);

        MvcResult first = mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID slipId = readSlipId(first);
        jdbcTemplate.update("UPDATE slip_publish_audit SET request_fingerprint = ? WHERE slip_id = ?",
                legacyMergeFingerprint(body), slipId);

        body.put("deliveryAddress", "서울시 강남구 새 병합 배송지 2");
        mockMvc.perform(post("/api/v1/slips/from-orders-merge")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict());
    }

    private Map<String, Object> mergeBody(
            String orderAId, String orderANo,
            String orderBId, String orderBNo,
            String partnerCode, String partnerName,
            String warehouseCode, String shippingAddress,
            @SuppressWarnings("unused") String idemKey) {

        Map<String, Object> sourceOrderA = new LinkedHashMap<>();
        sourceOrderA.put("partnerOrderId", orderAId);
        sourceOrderA.put("orderNo", orderANo);

        Map<String, Object> sourceOrderB = new LinkedHashMap<>();
        sourceOrderB.put("partnerOrderId", orderBId);
        sourceOrderB.put("orderNo", orderBNo);

        Map<String, Object> line1 = new LinkedHashMap<>();
        line1.put("lineNo", 1);
        line1.put("productCode", "MODEL-MERGE-1");
        line1.put("productName", "병합 테스트 제품1");
        line1.put("qty", "2");
        line1.put("unitPriceVat", 110000);

        Map<String, Object> line2 = new LinkedHashMap<>();
        line2.put("lineNo", 2);
        line2.put("productCode", "MODEL-MERGE-2");
        line2.put("productName", "병합 테스트 제품2");
        line2.put("qty", "3");
        line2.put("unitPriceVat", 55000);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sourceOrders", List.of(sourceOrderA, sourceOrderB));
        body.put("ioDate", "20260531");
        body.put("partnerId", RESOLVED_PARTNER_ID.toString());
        body.put("partnerCode", partnerCode);
        body.put("partnerName", partnerName);
        body.put("warehouseCode", warehouseCode);
        body.put("shippingAddress", shippingAddress);
        body.put("receiverPhone", "010-1234-5678");
        body.put("paymentDueLabel", "익월말");
        body.put("discountInfo", null);
        body.put("memo", null);
        body.put("lines", List.of(line1, line2));
        return body;
    }

    private UUID readSlipId(MvcResult result) throws Exception {
        return UUID.fromString(
                objectMapper.readTree(result.getResponse().getContentAsString())
                        .get("data").get("slipId").asText());
    }

    @SuppressWarnings("unchecked")
    private String legacyMergeFingerprint(Map<String, Object> body) throws Exception {
        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("kind", "ORDERS_MERGE");
        canonical.put("sourceOrders", ((List<Map<String, Object>>) body.get("sourceOrders")).stream()
                .map(order -> order.get("partnerOrderId").toString()).sorted().toList());
        canonical.put("ioDate", body.get("ioDate"));
        canonical.put("partnerId", body.get("partnerId"));
        canonical.put("warehouseCode", body.get("warehouseCode"));
        canonical.put("partnerCode", body.get("partnerCode"));
        canonical.put("paymentDueLabel", body.get("paymentDueLabel"));
        canonical.put("discountInfo", body.get("discountInfo"));
        canonical.put("memo", body.get("memo"));
        canonical.put("lines", ((List<Map<String, Object>>) body.get("lines")).stream().map(line -> {
            Map<String, Object> canonicalLine = new LinkedHashMap<>();
            canonicalLine.put("productCode", line.get("productCode"));
            canonicalLine.put("qty", line.get("qty"));
            canonicalLine.put("spec", line.get("spec"));
            canonicalLine.put("unitPriceVat", line.get("unitPriceVat"));
            canonicalLine.put("supplyAmount", line.get("supplyAmount"));
            canonicalLine.put("vatAmount", line.get("vatAmount"));
            canonicalLine.put("remarks", line.get("remarks"));
            return canonicalLine;
        }).toList());
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(objectMapper.writeValueAsString(canonical).getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte value : digest) {
            hex.append(String.format("%02x", value));
        }
        return hex.toString();
    }

    private String readSlipNo(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("slipNo").asText();
    }
}
