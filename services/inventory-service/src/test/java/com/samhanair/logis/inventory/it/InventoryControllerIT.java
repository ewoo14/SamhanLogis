package com.samhanair.logis.inventory.it;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.security.permission.PermissionAction;
import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
 * Plan §4 권한 매트릭스 + 입고/출고 핵심 시나리오. ApiGateway 가 X-User-Id / X-User-Role 헤더를
 * 주입하므로 IT 에서도 동일 헤더로 호출. {@link com.samhanair.logis.inventory.config.HeaderAuthenticationFilter}
 * 이 헤더 → SecurityContext 변환.
 *
 * <p>BE endpoint (정확):
 * <ul>
 *   <li>{@code GET    /inventory/warehouses}                       — 인증된 모든 역할, List 반환</li>
 *   <li>{@code POST   /inventory/warehouses}                       — MASTER/MANAGER/DEVELOPER (201)</li>
 *   <li>{@code POST   /inventory/lots/inbound}                     — MASTER/MANAGER/WAREHOUSE/INVENTORY (201)</li>
 *   <li>{@code POST   /inventory/deduct}                           — MASTER/MANAGER/DEVELOPER/SALES/WAREHOUSE/INVENTORY (200)</li>
 *   <li>{@code GET    /inventory/stocks/export.xlsx}                — 잔량 행에 품목코드/품목명 포함,
 *       productId UUID 미노출 (#907 재수렴 R 발견 2)</li>
 * </ul>
 *
 * <p>모든 응답은 ApiResponse 래핑이라 jsonPath 는 {@code $.data.*} 로 접근.
 * 미인증/권한 부족은 모두 403 (HeaderAuthenticationFilter 가 인증 미설정 → ExceptionTranslationFilter default → 403).
 *
 * <p>{@link ProductClient} 는 product-service 호출이라 IT 에서 mock — `requireExists` no-op,
 * `lookup` 은 빈 결과 (테스트에서 lookup 호출 안 함).
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class InventoryControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @MockBean
    private ProductClient productClient;

    private UUID hqWarehouseId;

    @Test
    void malformedConverterWarehouseIdentifier_returns400ApiResponse() throws Exception {
        mockMvc.perform(get("/inventory/warehouses/not-a-valid-opaque-id")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("요청 파라미터 형식이 올바르지 않습니다."))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("not-a-valid-opaque-id"))));
    }

    @BeforeEach
    void setUp() {
        Mockito.lenient().when(dynamicPermissionClient.canView(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);

        hqWarehouseId = warehouseRepository.findByCode("HQ-001")
                .orElseThrow(() -> new IllegalStateException(
                        "HQ-001 시드 누락 — V2__seed_inventory_warehouses.sql 확인"))
                .getId();

        // ProductClient.requireExists 는 ProductSummary 를 반환 (void 아님) →
        // when().thenReturn() 패턴으로 mock. lookup 도 동일하게 임의 ProductSummary 반환.
        Mockito.lenient().when(productClient.requireExists(Mockito.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트 제품", "TEST-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
        Mockito.lenient().when(productClient.lookup(Mockito.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품", "TEST-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.lookupAllowMissing(Mockito.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품", "TEST-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
    }

    @Test
    void unauthenticated_get_returns403() throws Exception {
        // 헤더 없이 요청 → HeaderAuthenticationFilter 가 인증 미설정 → 403.
        mockMvc.perform(get("/inventory/warehouses"))
                .andExpect(status().isForbidden());
    }

    @Test
    void salesRole_postWarehouse_returns403() throws Exception {
        // SALES 는 창고 등록 불가 (MASTER/MANAGER/DEVELOPER 만).
        Map<String, Object> body = new HashMap<>();
        body.put("code", "SALES-FAIL-001");
        body.put("name", "SALES 가 만들면 안 됨");
        body.put("type", "HEADQUARTERS");
        body.put("displayOrder", 999);

        mockMvc.perform(post("/inventory/warehouses")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    @Test
    void managerRole_postWarehouse_returns201_thenList_includesIt() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("code", "MGR-NEW-001");
        body.put("name", "매니저가 등록한 신규 창고");
        body.put("type", "VEHICLE");
        body.put("address", "서울시 송파");
        body.put("displayOrder", 500);
        body.put("description", "테스트용 차량창고");

        // ApiResponse<T> 래핑 → jsonPath 는 $.data.*.
        MvcResult result = mockMvc.perform(post("/inventory/warehouses")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(notNullValue()))
                .andExpect(jsonPath("$.data.code").value("MGR-NEW-001"))
                .andReturn();

        String createdId = objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // 조회는 SALES 도 가능. List 반환이라 $.data[?(@.id=='...')] 형식.
        mockMvc.perform(get("/inventory/warehouses")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.id=='" + createdId + "')].code").exists());
    }

    @Test
    void warehouseRole_inbound_thenDeduct_succeeds() throws Exception {
        UUID productId = UUID.randomUUID();

        // 1) WAREHOUSE 권한으로 입고 — 100개, 단가 100,000. POST /inventory/lots/inbound → 201.
        Map<String, Object> inboundBody = new HashMap<>();
        inboundBody.put("productId", productId.toString());
        inboundBody.put("warehouseId", hqWarehouseId.toString());
        inboundBody.put("quantity", 100);
        inboundBody.put("unitCost", 100000);
        inboundBody.put("lotNo", "FIFO-RECV-001");
        inboundBody.put("sourceContext", sourceContext());

        mockMvc.perform(post("/inventory/lots/inbound")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(inboundBody)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(notNullValue()));

        // 2) WAREHOUSE 권한으로 출고 — 30개. FIFO 로 첫 번째 lot 에서 차감. POST /inventory/deduct → 200.
        Map<String, Object> deductBody = new HashMap<>();
        deductBody.put("productId", productId.toString());
        deductBody.put("warehouseId", hqWarehouseId.toString());
        deductBody.put("quantity", 30);
        deductBody.put("note", "FIFO 출고 검증");
        deductBody.put("sourceContext", sourceContext());

        mockMvc.perform(post("/inventory/deduct")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deductBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(notNullValue()));
    }

    @Test
    void deduct_insufficientStock_returns409() throws Exception {
        // 재고 부족 시나리오는 balance 는 존재하되 lot 합계만 모자란 경우 — 먼저 10개 입고로
        // balance 를 생성하고 그 다음 50개 출고 시도 → BusinessException(CONFLICT) → 409.
        // (balance 자체가 없으면 NOT_FOUND 404 반환되므로 CONFLICT 시나리오가 되려면 입고 필요.)
        UUID productId = UUID.randomUUID();

        Map<String, Object> inboundBody = new HashMap<>();
        inboundBody.put("productId", productId.toString());
        inboundBody.put("warehouseId", hqWarehouseId.toString());
        inboundBody.put("quantity", 10);
        inboundBody.put("unitCost", 100000);
        inboundBody.put("lotNo", "INSUFFICIENT-PRE-001");
        inboundBody.put("sourceContext", sourceContext());

        mockMvc.perform(post("/inventory/lots/inbound")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(inboundBody)))
                .andExpect(status().isCreated());

        Map<String, Object> deductBody = new HashMap<>();
        deductBody.put("productId", productId.toString());
        deductBody.put("warehouseId", hqWarehouseId.toString());
        deductBody.put("quantity", 50);
        deductBody.put("note", "재고 부족 시나리오 (10개만 있는데 50개 요청)");
        deductBody.put("sourceContext", sourceContext());

        mockMvc.perform(post("/inventory/deduct")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deductBody)))
                .andExpect(status().isConflict());
    }

    // ----- 다중 제품 일괄 잔량 조회 (Sales Form Polish 슬라이스) -----

    @Test
    void batchBalances_salesRole_returns200WithMultipleProducts() throws Exception {
        // SALES 가 영업 견적 단계에서 사용 — 모든 role 조회 가능. 입고 후 batch 조회 시 데이터 반환.
        UUID productA = UUID.randomUUID();
        UUID productB = UUID.randomUUID();

        // productA 만 사전 입고. productB 는 입고 안 한 상태 → balance 없음 → balances 빈 리스트.
        Map<String, Object> inboundBody = new HashMap<>();
        inboundBody.put("productId", productA.toString());
        inboundBody.put("warehouseId", hqWarehouseId.toString());
        inboundBody.put("quantity", 12);
        inboundBody.put("unitCost", 100000);
        inboundBody.put("lotNo", "BATCH-LOOKUP-001");
        inboundBody.put("sourceContext", sourceContext());

        mockMvc.perform(post("/inventory/lots/inbound")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(inboundBody)))
                .andExpect(status().isCreated());

        Map<String, Object> batchBody = new HashMap<>();
        batchBody.put("productIds", List.of(productA.toString(), productB.toString()));

        mockMvc.perform(post("/inventory/balances/batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(batchBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                // 입력 순서 보존 — productA 먼저
                .andExpect(jsonPath("$.data[0].productId").value(productA.toString()))
                .andExpect(jsonPath("$.data[0].balances[0].warehouseCode").value("HQ-001"))
                .andExpect(jsonPath("$.data[0].balances[0].availableQty").value(12))
                .andExpect(jsonPath("$.data[0].balances[0].warehouseType").value("HEADQUARTERS"))
                // productB 는 row 없음 → 빈 리스트
                .andExpect(jsonPath("$.data[1].productId").value(productB.toString()))
                .andExpect(jsonPath("$.data[1].balances.length()").value(0));
    }

    @Test
    void batchBalances_unauthenticated_returns403() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("productIds", List.of(UUID.randomUUID().toString()));

        mockMvc.perform(post("/inventory/balances/batch")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    @Test
    void batchBalances_emptyProductIds_returns400() throws Exception {
        // Bean Validation @NotEmpty → 400.
        Map<String, Object> body = new HashMap<>();
        body.put("productIds", List.of());

        mockMvc.perform(post("/inventory/balances/batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void batchBalances_overLimit_returns400() throws Exception {
        // 101건 → @Size(max=100) 위반 → 400.
        List<String> tooMany = IntStream.range(0, 101)
                .mapToObj(i -> UUID.randomUUID().toString())
                .toList();
        Map<String, Object> body = new HashMap<>();
        body.put("productIds", tooMany);

        mockMvc.perform(post("/inventory/balances/batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void salesRole_inbound_returns403() throws Exception {
        // SALES 는 입고 불가 (MASTER/MANAGER/WAREHOUSE/INVENTORY 만).
        UUID productId = UUID.randomUUID();
        Map<String, Object> body = new HashMap<>();
        body.put("productId", productId.toString());
        body.put("warehouseId", hqWarehouseId.toString());
        body.put("quantity", 10);
        body.put("unitCost", 100000);
        body.put("lotNo", "SALES-FAIL-001");
        body.put("sourceContext", sourceContext());

        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class),
                        Mockito.eq("inventory.stock-balance"),
                        Mockito.eq(PermissionAction.CREATE)))
                .thenReturn(false);

        mockMvc.perform(post("/inventory/lots/inbound")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    // ──────────────────────────── #907 재수렴 R — 발견 2 ────────────────────────────

    /**
     * GET /inventory/stocks/export.xlsx — 잔량 행에 품목코드/품목명이 포함된다.
     *
     * <p>기존 컬럼(창고코드/창고명/가용/예약/총수량)만으로는 몇백 행이 어느 품목의 재고인지
     * 구분할 수 없었다. {@code StockBalanceResponse} 는 productId(UUID)만 갖고 있어
     * {@link ProductClient}(product-service internal batch lookup)로 productId → productCode/명을
     * 해석해야 한다. 여기서는 클래스 공통 stub(productCode=null)을 이 테스트 전용으로 override —
     * 실제 productCode 가 시트에 나타나는지 검증한다.
     */
    @Test
    void exportStocksXlsx_includesProductCodeAndName_forEachBalanceRow() throws Exception {
        UUID productA = UUID.randomUUID();
        String productCodeMarker = "PRD-OPUS-9";
        String productNameMarker = "OPUS재수렴R재고품목9";
        Mockito.lenient().when(productClient.lookupAllowMissing(Mockito.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, productNameMarker, "MOD-9",
                                    productCodeMarker, UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });

        Map<String, Object> inboundBody = new HashMap<>();
        inboundBody.put("productId", productA.toString());
        inboundBody.put("warehouseId", hqWarehouseId.toString());
        inboundBody.put("quantity", 7);
        inboundBody.put("unitCost", 100000);
        inboundBody.put("lotNo", "EXPORT-PRODCODE-001");
        inboundBody.put("sourceContext", sourceContext());

        mockMvc.perform(post("/inventory/lots/inbound")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(inboundBody)))
                .andExpect(status().isCreated());

        MvcResult result = mockMvc.perform(get("/inventory/stocks/export.xlsx")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn();

        try (Workbook wb = new XSSFWorkbook(
                new ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
            Sheet sheet = wb.getSheetAt(0);
            org.assertj.core.api.Assertions.assertThat(sheetContainsText(sheet, productCodeMarker))
                    .as("시트에 품목코드 '%s' 포함", productCodeMarker)
                    .isTrue();
            org.assertj.core.api.Assertions.assertThat(sheetContainsText(sheet, productNameMarker))
                    .as("시트에 품목명 '%s' 포함", productNameMarker)
                    .isTrue();
        }
    }

    /** UUID 를 시트에 노출하면 안 된다 — productId 문자열 자체가 셀에 나타나지 않아야 한다. */
    @Test
    void exportStocksXlsx_doesNotExposeProductIdUuid() throws Exception {
        UUID productA = UUID.randomUUID();
        Mockito.lenient().when(productClient.lookupAllowMissing(Mockito.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "UUID비공개테스트품목9", "MOD-9",
                                    "PRD-UUIDCHK-9", UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });

        Map<String, Object> inboundBody = new HashMap<>();
        inboundBody.put("productId", productA.toString());
        inboundBody.put("warehouseId", hqWarehouseId.toString());
        inboundBody.put("quantity", 3);
        inboundBody.put("unitCost", 100000);
        inboundBody.put("lotNo", "EXPORT-UUIDCHK-001");
        inboundBody.put("sourceContext", sourceContext());

        mockMvc.perform(post("/inventory/lots/inbound")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(inboundBody)))
                .andExpect(status().isCreated());

        MvcResult result = mockMvc.perform(get("/inventory/stocks/export.xlsx")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn();

        try (Workbook wb = new XSSFWorkbook(
                new ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
            Sheet sheet = wb.getSheetAt(0);
            org.assertj.core.api.Assertions.assertThat(sheetContainsText(sheet, productA.toString()))
                    .as("productId UUID 문자열이 시트에 노출되면 안 됨")
                    .isFalse();
        }
    }

    @Test
    void exportStocksXlsx_partialMissing_keepsFoundMetadataAndMarksOnlyMissingRow() throws Exception {
        Warehouse warehouse = createIsolatedWarehouse("PARTIAL");
        UUID existingProductId = UUID.randomUUID();
        UUID missingProductId = UUID.randomUUID();
        inboundBalance(existingProductId, warehouse.getId(), 7, "SOL1051-PARTIAL-EXISTING");
        inboundBalance(missingProductId, warehouse.getId(), 4, "SOL1051-PARTIAL-MISSING");

        Mockito.when(productClient.lookupAllowMissing(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        existingProductId, "정상 품목 P1", "MODEL-P1", "SOL1051-P1",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE")));

        MvcResult result = exportWarehouse(warehouse.getId(), status().isOk());

        try (Workbook wb = new XSSFWorkbook(
                new ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
            Sheet sheet = wb.getSheetAt(0);
            org.assertj.core.api.Assertions.assertThat(sheet.getLastRowNum()).isEqualTo(2);

            Row existingRow = findRowByCellText(sheet, 0, "SOL1051-P1");
            org.assertj.core.api.Assertions.assertThat(existingRow.getCell(1).getStringCellValue())
                    .isEqualTo("정상 품목 P1");
            assertQuantities(existingRow, 7);

            Row missingRow = findRowByCellText(sheet, 0, "참조 끊김");
            org.assertj.core.api.Assertions.assertThat(missingRow.getCell(1).getStringCellValue())
                    .isEqualTo("제품 마스터 없음");
            assertQuantities(missingRow, 4);
            org.assertj.core.api.Assertions.assertThat(sheetContainsText(sheet, existingProductId.toString()))
                    .isFalse();
            org.assertj.core.api.Assertions.assertThat(sheetContainsText(sheet, missingProductId.toString()))
                    .isFalse();
        }
    }

    @Test
    void exportStocksXlsx_allMissing_marksEveryRowAndKeepsActualQuantities() throws Exception {
        Warehouse warehouse = createIsolatedWarehouse("ALL-MISSING");
        inboundBalance(UUID.randomUUID(), warehouse.getId(), 11, "SOL1051-ALL-MISSING-1");
        inboundBalance(UUID.randomUUID(), warehouse.getId(), 13, "SOL1051-ALL-MISSING-2");
        Mockito.when(productClient.lookupAllowMissing(Mockito.anyList())).thenReturn(List.of());

        MvcResult result = exportWarehouse(warehouse.getId(), status().isOk());

        try (Workbook wb = new XSSFWorkbook(
                new ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
            Sheet sheet = wb.getSheetAt(0);
            org.assertj.core.api.Assertions.assertThat(sheet.getLastRowNum()).isEqualTo(2);
            List<Double> totalQuantities = IntStream.rangeClosed(1, sheet.getLastRowNum())
                    .mapToObj(sheet::getRow)
                    .peek(row -> {
                        org.assertj.core.api.Assertions.assertThat(row.getCell(0).getStringCellValue())
                                .isEqualTo("참조 끊김");
                        org.assertj.core.api.Assertions.assertThat(row.getCell(1).getStringCellValue())
                                .isEqualTo("제품 마스터 없음");
                    })
                    .map(row -> row.getCell(6).getNumericCellValue())
                    .sorted()
                    .toList();
            org.assertj.core.api.Assertions.assertThat(totalQuantities).containsExactly(11.0, 13.0);
        }
    }

    @Test
    void exportStocksXlsx_productServiceFailure_returnsInternalErrorInsteadOfBlankWorkbook()
            throws Exception {
        Warehouse warehouse = createIsolatedWarehouse("SERVICE-FAILURE");
        inboundBalance(UUID.randomUUID(), warehouse.getId(), 5, "SOL1051-SERVICE-FAILURE");
        Mockito.when(productClient.lookupAllowMissing(Mockito.anyList()))
                .thenThrow(new BusinessException(ErrorCode.INTERNAL_ERROR, "product-service 호출 실패"));

        MvcResult result = exportWarehouse(warehouse.getId(), status().isInternalServerError());

        org.assertj.core.api.Assertions.assertThat(objectMapper.readTree(
                        result.getResponse().getContentAsByteArray()).path("code").asText())
                .isEqualTo("INTERNAL_ERROR");
    }

    @Test
    void exportStocksXlsx_productService4xx_returnsInvalidInputInsteadOfMissingMarker()
            throws Exception {
        Warehouse warehouse = createIsolatedWarehouse("INVALID-INPUT");
        inboundBalance(UUID.randomUUID(), warehouse.getId(), 6, "SOL1051-INVALID-INPUT");
        Mockito.when(productClient.lookupAllowMissing(Mockito.anyList()))
                .thenThrow(new BusinessException(ErrorCode.INVALID_INPUT, "존재하지 않는 제품 ID"));

        MvcResult result = exportWarehouse(warehouse.getId(), status().isBadRequest());

        org.assertj.core.api.Assertions.assertThat(objectMapper.readTree(
                        result.getResponse().getContentAsByteArray()).path("code").asText())
                .isEqualTo("INVALID_INPUT");
    }

    /** 시트 전체(모든 row/cell)에서 문자열 셀 값이 정확히 일치하는 셀이 있는지 확인. */
    private boolean sheetContainsText(Sheet sheet, String text) {
        for (Row row : sheet) {
            for (Cell cell : row) {
                if (cell.getCellType() == CellType.STRING && text.equals(cell.getStringCellValue())) {
                    return true;
                }
            }
        }
        return false;
    }

    private Warehouse createIsolatedWarehouse(String suffix) {
        String token = UUID.randomUUID().toString().substring(0, 8);
        return warehouseRepository.saveAndFlush(Warehouse.create(
                "SOL1051-" + token,
                "SOL1051 " + suffix + " 창고",
                WarehouseType.HEADQUARTERS,
                null,
                9_999,
                null));
    }

    private void inboundBalance(UUID productId, UUID warehouseId, int quantity, String lotNo)
            throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("productId", productId.toString());
        body.put("warehouseId", warehouseId.toString());
        body.put("quantity", quantity);
        body.put("unitCost", 100000);
        body.put("lotNo", lotNo);
        body.put("sourceContext", sourceContext());

        mockMvc.perform(post("/inventory/lots/inbound")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());
    }

    private MvcResult exportWarehouse(
            UUID warehouseId,
            org.springframework.test.web.servlet.ResultMatcher expectedStatus) throws Exception {
        return mockMvc.perform(get("/inventory/stocks/export.xlsx")
                        .param("warehouseId", warehouseId.toString())
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(expectedStatus)
                .andReturn();
    }

    private Row findRowByCellText(Sheet sheet, int cellIndex, String text) {
        return IntStream.rangeClosed(1, sheet.getLastRowNum())
                .mapToObj(sheet::getRow)
                .filter(row -> text.equals(row.getCell(cellIndex).getStringCellValue()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("시트에서 값을 찾을 수 없음: " + text));
    }

    private void assertQuantities(Row row, int expected) {
        org.assertj.core.api.Assertions.assertThat(row.getCell(4).getNumericCellValue())
                .isEqualTo(expected);
        org.assertj.core.api.Assertions.assertThat(row.getCell(5).getNumericCellValue())
                .isZero();
        org.assertj.core.api.Assertions.assertThat(row.getCell(6).getNumericCellValue())
                .isEqualTo(expected);
    }

    private static Map<String, Object> sourceContext() {
        return Map.of("sourceOperationId", UUID.randomUUID().toString(),
                "slipId", UUID.randomUUID().toString(), "slipRevision", 1);
    }
}
