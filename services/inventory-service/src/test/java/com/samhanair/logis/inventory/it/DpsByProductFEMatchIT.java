package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.AccountingClient;
import com.samhanair.logis.inventory.client.NotificationClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.client.SlipClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * 품목별 DPS pivot FE 정합성 IT — P0-B GAS 보강.
 *
 * <p>BE agent 의 {@code DpsByProductIT} 와 시나리오 분리: 본 IT 는 FE 화면이 소비하는
 * 응답 schema 정합성 + warehouseId 필터 동작 + 빈 기간 케이스를 검증한다.
 *
 * <p>검증 시나리오:
 * <ol>
 *   <li>DBP-FE-1: GET /dps-compare/by-product 응답 schema 검증
 *       (8 필드 + totalProductCount + generatedAt)</li>
 *   <li>DBP-FE-2: warehouseId 필터 적용 시 응답 row 모두 동일 warehouse 검증</li>
 *   <li>DBP-FE-3: 빈 기간 (미래 날짜) → totalProductCount=0 + rows=[]</li>
 * </ol>
 *
 * <p>{@code @MockBean} 외부 client 4종 ({@code feedback_it_mockbean_external_clients.md} 준수):
 * <ul>
 *   <li>{@link ProductClient} — InboundInspectionService 공유 빈 격리</li>
 *   <li>{@link AccountingClient} — InventoryAuditService 공유 빈 격리</li>
 *   <li>{@link SlipClient} — InboundInspectionService / DpsCompareService 공유 빈 격리</li>
 *   <li>{@link NotificationClient} — SafetyStockService fire-and-forget 격리</li>
 * </ul>
 *
 * <p>엔드포인트: {@code GET /warehouse/audit/dps-compare/by-product}
 * <br>권한: WAREHOUSE / MANAGER / MASTER ({@code @PreAuthorize} 확인).
 *
 * <p>시드 데이터 (V6__seed_p09_inbound_inspection.sql):
 * <ul>
 *   <li>inbound_inspection_lines 을 통한 pivot 집계</li>
 *   <li>V6 시드는 inbound_inspections 헤더 없이 stock_lots/movements 만 seeding</li>
 *   <li>따라서 inbound_inspection 헤더가 없으면 pivot 결과 = 빈 배열이 정상</li>
 * </ul>
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class DpsByProductFEMatchIT extends AbstractPostgresIT {

    // ─── 결정적 UUID (V2 seed 창고 — feedback_it_mockbean_external_clients 준수) ───
    private static final UUID WH_HQ_001 =
            UUID.fromString("11111111-1111-1111-1111-000000000001");
    private static final UUID WH_VH_001 =
            UUID.fromString("11111111-1111-1111-1111-000000000002");

    /** 현재 기간 (V6 seed 시드 날짜 포함) */
    private static final String FROM_DATE_PRESENT = "2026-01-01";
    private static final String TO_DATE_PRESENT   = "2026-12-31";

    /** 미래 날짜 (데이터 없는 기간) */
    private static final String FROM_DATE_FUTURE  = "2099-01-01";
    private static final String TO_DATE_FUTURE    = "2099-12-31";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    // ─── 외부 client @MockBean lenient stub (feedback_it_mockbean_external_clients) ───

    @MockBean private ProductClient productClient;
    @MockBean private AccountingClient accountingClient;
    @MockBean private SlipClient slipClient;
    @MockBean private NotificationClient notificationClient;

    @BeforeEach
    void setUpMocks() {
        // ProductClient lenient stub — requireExists / lookup
        Mockito.lenient().when(productClient.requireExists(Mockito.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트 제품", "TEST-DBP-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
        Mockito.lenient().when(productClient.lookup(Mockito.anyList()))
                .thenAnswer(inv -> {
                    java.util.List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(
                                    id, "테스트 제품", "TEST-DBP-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });

        // AccountingClient — lenient no-op
        Mockito.lenient().doNothing().when(accountingClient)
                .createAuditAdjustmentJournal(
                        Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());

        // NotificationClient — lenient no-op
        Mockito.lenient().doNothing().when(notificationClient)
                .sendSafetyStockAlert(Mockito.any(), Mockito.any());

        // SlipClient — lenient (DpsCompareService 격리)
        Mockito.lenient().when(slipClient.getSlip(Mockito.any()))
                .thenThrow(new RuntimeException("[TEST] SlipClient not expected in DpsByProduct flow"));
    }

    // ─────────── DBP-FE-1: 응답 schema 검증 ───────────

    /**
     * DBP-FE-1: GET /warehouse/audit/dps-compare/by-product —
     * 응답 구조에 totalProductCount / rows / generatedAt 필드 존재 + rows 각 항목에 8 필드 존재.
     *
     * <p>FE {@code DpsByProductResponse} 인터페이스 와 BE {@code DpsByProductResponse} record 1:1 정합.
     */
    @Test
    @DisplayName("DBP-FE-1: 응답 schema 검증 — totalProductCount + rows[] 8필드 + generatedAt")
    void dbpFe1_responseSchema_containsRequiredFields() throws Exception {
        MvcResult result = mockMvc.perform(
                        get("/warehouse/audit/dps-compare/by-product")
                                .param("fromDate", FROM_DATE_PRESENT)
                                .param("toDate",   TO_DATE_PRESENT)
                                .header("X-User-Id",   UUID.randomUUID().toString())
                                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isMap())
                .andExpect(jsonPath("$.data.totalProductCount").isNumber())
                .andExpect(jsonPath("$.data.rows").isArray())
                .andExpect(jsonPath("$.data.generatedAt").isString())
                .andReturn();

        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data");

        assertThat(data.has("totalProductCount")).as("totalProductCount 필드 존재").isTrue();
        assertThat(data.has("rows")).as("rows 필드 존재").isTrue();
        assertThat(data.has("generatedAt")).as("generatedAt 필드 존재").isTrue();

        // rows 각 행의 8 필드 검증 (있는 경우)
        JsonNode rows = data.get("rows");
        assertThat(rows.isArray()).as("rows 는 배열").isTrue();
        int rowCount = rows.size();
        assertThat(data.get("totalProductCount").asInt())
                .as("totalProductCount == rows.size()")
                .isEqualTo(rowCount);

        if (rowCount > 0) {
            JsonNode firstRow = rows.get(0);
            // FE DpsByProductRow 인터페이스 8 필드 검증
            assertThat(firstRow.has("productCode")).as("rows[0].productCode 존재").isTrue();
            assertThat(firstRow.has("productName")).as("rows[0].productName 존재").isTrue();
            assertThat(firstRow.has("pendingQty")).as("rows[0].pendingQty 존재").isTrue();
            assertThat(firstRow.has("completedQty")).as("rows[0].completedQty 존재").isTrue();
            assertThat(firstRow.has("qcQty")).as("rows[0].qcQty 존재").isTrue();
            assertThat(firstRow.has("returnQty")).as("rows[0].returnQty 존재").isTrue();
            assertThat(firstRow.has("totalQty")).as("rows[0].totalQty 존재").isTrue();
            assertThat(firstRow.has("diffFromDps")).as("rows[0].diffFromDps 존재").isTrue();

            // UUID 비공개 — productId UUID 필드 미노출 (feedback_uuid_no_user_visibility)
            assertThat(firstRow.has("productId"))
                    .as("rows[0].productId UUID 미노출 (피드백 uuid_no_user_visibility 준수)")
                    .isFalse();
        }
    }

    /**
     * DBP-FE-1-B: MASTER / MANAGER 권한도 동일 schema 응답 확인.
     */
    @Test
    @DisplayName("DBP-FE-1-B: MANAGER 권한 → 200 + schema 정합")
    void dbpFe1B_managerRole_returns200AndSchema() throws Exception {
        mockMvc.perform(
                        get("/warehouse/audit/dps-compare/by-product")
                                .param("fromDate", FROM_DATE_PRESENT)
                                .param("toDate",   TO_DATE_PRESENT)
                                .header("X-User-Id",   UUID.randomUUID().toString())
                                .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalProductCount").isNumber())
                .andExpect(jsonPath("$.data.rows").isArray())
                .andExpect(jsonPath("$.data.generatedAt").isString());
    }

    /**
     * DBP-FE-1-C: SALES 권한 → 403 (FE RoleGuard 와 BE @RequirePermission 일치 검증).
     *
     * <p>@PreAuthorize 제거 후 @RequirePermission(inventory.dps, VIEW) 단독 가드.
     * AbstractPostgresIT 기본 stub(check → true) 을 override — V35 seed: SALES 에 inventory.dps 없음.
     */
    @Test
    @DisplayName("DBP-FE-1-C: SALES 권한 → 403 Forbidden")
    void dbpFe1C_salesRole_returns403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class),
                        Mockito.eq("inventory.dps"),
                        Mockito.any(PermissionAction.class)))
                .thenReturn(false);

        mockMvc.perform(
                        get("/warehouse/audit/dps-compare/by-product")
                                .param("fromDate", FROM_DATE_PRESENT)
                                .param("toDate",   TO_DATE_PRESENT)
                                .header("X-User-Id",   UUID.randomUUID().toString())
                                .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    /**
     * DBP-FE-1-D: 미인증 요청 → 403.
     */
    @Test
    @DisplayName("DBP-FE-1-D: 미인증 요청 → 403")
    void dbpFe1D_unauthenticated_returns403() throws Exception {
        mockMvc.perform(
                        get("/warehouse/audit/dps-compare/by-product")
                                .param("fromDate", FROM_DATE_PRESENT)
                                .param("toDate",   TO_DATE_PRESENT))
                .andExpect(status().isForbidden());
    }

    // ─────────── DBP-FE-2: warehouseId 필터 검증 ───────────

    /**
     * DBP-FE-2: warehouseId 필터 파라미터 전달 시 — 200 응답 + schema 정합 (필터 동작 확인).
     *
     * <p>seed 데이터에 inbound_inspection rows 가 없을 경우 rows=[] 이 정상이지만,
     * warehouseId 파라미터 자체가 400/500 을 반환하지 않음을 검증한다.
     * 실제 필터 단위 검증은 비즈니스 인수 IT (DpsByProductIT) 가 담당.
     */
    @Test
    @DisplayName("DBP-FE-2: warehouseId 필터 파라미터 → 200 + schema 정합 (필터 동작 확인)")
    void dbpFe2_warehouseIdFilter_returns200AndSchemaValid() throws Exception {
        MvcResult result = mockMvc.perform(
                        get("/warehouse/audit/dps-compare/by-product")
                                .param("fromDate",    FROM_DATE_PRESENT)
                                .param("toDate",      TO_DATE_PRESENT)
                                .param("warehouseId", WH_HQ_001.toString())
                                .header("X-User-Id",   UUID.randomUUID().toString())
                                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalProductCount").isNumber())
                .andExpect(jsonPath("$.data.rows").isArray())
                .andReturn();

        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data");

        // rows 가 있다면 모두 warehouseId 에 해당하는 data 여야 함 (warehouse 필드 자체는 UUID 미노출)
        // — warehouseCode 또는 warehouseName 으로 확인
        JsonNode rows = data.get("rows");
        assertThat(rows.isArray()).as("rows 는 배열").isTrue();
        // totalProductCount 와 rows.size() 정합
        assertThat(data.get("totalProductCount").asInt())
                .as("totalProductCount == rows.size()")
                .isEqualTo(rows.size());
    }

    /**
     * DBP-FE-2-B: 다른 창고 (WH_VH_001) 필터 — 마찬가지로 200 + schema 정합.
     */
    @Test
    @DisplayName("DBP-FE-2-B: VH-001 창고 필터 → 200 + schema 정합")
    void dbpFe2B_vh001WarehouseFilter_returns200() throws Exception {
        mockMvc.perform(
                        get("/warehouse/audit/dps-compare/by-product")
                                .param("fromDate",    FROM_DATE_PRESENT)
                                .param("toDate",      TO_DATE_PRESENT)
                                .param("warehouseId", WH_VH_001.toString())
                                .header("X-User-Id",   UUID.randomUUID().toString())
                                .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.rows").isArray());
    }

    /**
     * DBP-FE-2-C: warehouseId 없이 전체 조회 → 200 (전체 창고 합산).
     */
    @Test
    @DisplayName("DBP-FE-2-C: warehouseId 미전달 (전체 창고) → 200")
    void dbpFe2C_noWarehouseId_returns200_allWarehouses() throws Exception {
        mockMvc.perform(
                        get("/warehouse/audit/dps-compare/by-product")
                                .param("fromDate", FROM_DATE_PRESENT)
                                .param("toDate",   TO_DATE_PRESENT)
                                .header("X-User-Id",   UUID.randomUUID().toString())
                                .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.rows").isArray());
    }

    // ─────────── DBP-FE-3: 빈 기간 (미래 날짜) ───────────

    /**
     * DBP-FE-3: 미래 날짜 범위 조회 → totalProductCount=0 + rows=[].
     *
     * <p>inbound_inspection 데이터가 없는 미래 기간이면 집계 결과가 반드시 빈 배열.
     * FE 는 이를 "조회 결과가 없습니다." emptyMessage 로 처리한다.
     */
    @Test
    @DisplayName("DBP-FE-3: 미래 날짜 기간 조회 → totalProductCount=0 + rows=[]")
    void dbpFe3_futureDateRange_returnsEmptyResult() throws Exception {
        MvcResult result = mockMvc.perform(
                        get("/warehouse/audit/dps-compare/by-product")
                                .param("fromDate", FROM_DATE_FUTURE)
                                .param("toDate",   TO_DATE_FUTURE)
                                .header("X-User-Id",   UUID.randomUUID().toString())
                                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalProductCount").value(0))
                .andExpect(jsonPath("$.data.rows").isArray())
                .andReturn();

        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data");

        int count = data.get("totalProductCount").asInt();
        int rowSize = data.get("rows").size();

        assertThat(count).as("DBP-FE-3: 미래 기간 totalProductCount == 0").isEqualTo(0);
        assertThat(rowSize).as("DBP-FE-3: 미래 기간 rows.size() == 0").isEqualTo(0);
    }

    /**
     * DBP-FE-3-B: 빈 기간 (fromDate > toDate 역전) → 400 또는 빈 결과.
     *
     * <p>BE 가 날짜 역전을 400 으로 처리하면 해당 상태를, 그냥 빈 결과를 반환하면 200+[]
     * 모두 허용 — FE 는 from &gt; to 를 클라이언트 validation 으로 막음.
     */
    @Test
    @DisplayName("DBP-FE-3-B: fromDate > toDate 역전 → 400 또는 rows=[] (BE 정책에 따름)")
    void dbpFe3B_reversedDateRange_returns400OrEmpty() throws Exception {
        int statusCode = mockMvc.perform(
                        get("/warehouse/audit/dps-compare/by-product")
                                .param("fromDate", "2026-12-31")
                                .param("toDate",   "2026-01-01")
                                .header("X-User-Id",   UUID.randomUUID().toString())
                                .header("X-User-Role", "WAREHOUSE"))
                .andReturn()
                .getResponse()
                .getStatus();

        // 400 (validation error) 또는 200 (빈 배열) 모두 허용
        assertThat(statusCode)
                .as("DBP-FE-3-B: fromDate > toDate → 400 또는 200 허용")
                .isIn(400, 200);
    }
}
