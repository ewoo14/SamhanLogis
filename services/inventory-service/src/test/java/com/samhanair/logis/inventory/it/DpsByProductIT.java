package com.samhanair.logis.inventory.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.NotificationClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.SlipClient;
import com.samhanair.logis.inventory.client.SlipServiceClient;
import com.samhanair.logis.inventory.domain.InboundInspection;
import com.samhanair.logis.inventory.domain.InboundInspectionLine;
import com.samhanair.logis.inventory.repository.InboundInspectionRepository;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 품목별 DPS 입고내역 pivot 분석 통합 테스트 — P0-B GAS 보강.
 *
 * <p>테스트 대상 endpoint:
 * {@code GET /warehouse/audit/dps-compare/by-product?fromDate=&toDate=&warehouseId=}
 *
 * <p>외부 RestClient 격리 (@MockBean 의무):
 * <ul>
 *   <li>{@link ProductClient} — product-service 호출 격리</li>
 *   <li>{@link SlipClient} — slip-service 단건 조회 격리</li>
 *   <li>{@link SlipServiceClient} — slip-service 출고 목록 조회 격리</li>
 *   <li>{@link NotificationClient} — notification-service 격리</li>
 * </ul>
 *
 * <p>TC 목록:
 * <ol>
 *   <li>TC-1: 빈 DB → totalProductCount=0</li>
 *   <li>TC-2: 5 상품 × 4 단계 seed → pivot row 5건 + 단계별 SUM 검증</li>
 *   <li>TC-3: warehouseId 지정 — 존재하지 않는 창고 → 404</li>
 *   <li>TC-4: diffFromDps 계산 — 현재 슬라이스에서 0 반환 확인</li>
 *   <li>TC-5: WAREHOUSE ROLE 통과, SALES ROLE → 403</li>
 * </ol>
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class DpsByProductIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/warehouse/audit/dps-compare/by-product";
    private static final String FROM = "2026-01-01";
    private static final String TO   = "2026-12-31";

    @Autowired private MockMvc mockMvc;
    @Autowired private InboundInspectionRepository inspectionRepository;

    /** 외부 RestClient 격리 — Eureka 비활성 환경에서 500 방지 (memory feedback_it_mockbean_external_clients). */
    @MockBean private ProductClient productClient;
    @MockBean private SlipClient slipClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private NotificationClient notificationClient;

    // ─────────────────────────────────────────────────────────────────────────
    // TC-1: 빈 DB → totalProductCount = 0
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("TC-1: 검수 데이터 없음 → totalProductCount=0, rows=[]")
    void tc1_emptyDb_returnsTotalProductCountZero() throws Exception {
        mockMvc.perform(get(BASE_URL)
                        .param("fromDate", FROM)
                        .param("toDate", TO)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalProductCount").value(0))
                .andExpect(jsonPath("$.data.rows").isArray())
                .andExpect(jsonPath("$.data.rows.length()").value(0))
                .andExpect(jsonPath("$.data.generatedAt").exists());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-2: 5 상품 × 4 단계 seed → pivot row 5건 + 단계별 SUM 검증
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("TC-2: 5 상품 × 4 단계 seed → pivot row 5건 + 단계별 SUM 검증")
    void tc2_fiveProducts_fourStages_pivotRowsFive() throws Exception {
        // 상품 A — PENDING (대기) 10개
        seedInspection("MODEL-A", "상품A", "PENDING", 10, null, null);
        // 상품 B — COMPLETED (완료) 20개, 불량 3개
        seedInspection("MODEL-B", "상품B", "COMPLETED", 20, 20, 3);
        // 상품 C — CANCELED (반품) 5개
        seedInspection("MODEL-C", "상품C", "CANCELED", 5, null, null);
        // 상품 D — COMPLETED 완료 15개, 불량 0개
        seedInspection("MODEL-D", "상품D", "COMPLETED", 15, 15, 0);
        // 상품 E — PENDING 대기 8개
        seedInspection("MODEL-E", "상품E", "PENDING", 8, null, null);

        // ORDER BY model_code ASC → MODEL-A[0] / MODEL-B[1] / MODEL-C[2] / MODEL-D[3] / MODEL-E[4]
        // (JsonPath filter [?(...)] 식은 array 반환 → .value(int) 비교 실패. 인덱스 직접 식 사용.)
        mockMvc.perform(get(BASE_URL)
                        .param("fromDate", FROM)
                        .param("toDate", TO)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalProductCount").value(5))
                .andExpect(jsonPath("$.data.rows.length()").value(5))
                // MODEL-A [0]: pendingQty=10, completedQty=0, qcQty=0, returnQty=0, totalQty=10
                .andExpect(jsonPath("$.data.rows[0].productCode").value("MODEL-A"))
                .andExpect(jsonPath("$.data.rows[0].pendingQty").value(10))
                .andExpect(jsonPath("$.data.rows[0].completedQty").value(0))
                .andExpect(jsonPath("$.data.rows[0].totalQty").value(10))
                // MODEL-B [1]: completedQty=17 (20-3), qcQty=3, returnQty=0, totalQty=20
                .andExpect(jsonPath("$.data.rows[1].productCode").value("MODEL-B"))
                .andExpect(jsonPath("$.data.rows[1].completedQty").value(17))
                .andExpect(jsonPath("$.data.rows[1].qcQty").value(3))
                .andExpect(jsonPath("$.data.rows[1].returnQty").value(0))
                // MODEL-C [2]: returnQty=-5 (반품 음수 표현), totalQty=-5
                .andExpect(jsonPath("$.data.rows[2].productCode").value("MODEL-C"))
                .andExpect(jsonPath("$.data.rows[2].returnQty").value(-5))
                .andExpect(jsonPath("$.data.rows[2].pendingQty").value(0))
                // MODEL-D [3]: completedQty=15, qcQty=0
                .andExpect(jsonPath("$.data.rows[3].productCode").value("MODEL-D"))
                .andExpect(jsonPath("$.data.rows[3].completedQty").value(15))
                .andExpect(jsonPath("$.data.rows[3].qcQty").value(0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-3: warehouseId 필터 — 존재하지 않는 창고 → 404
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("TC-3: 존재하지 않는 warehouseId 지정 → 404")
    void tc3_nonExistentWarehouseId_returns404() throws Exception {
        UUID unknownWarehouseId = UUID.randomUUID();

        mockMvc.perform(get(BASE_URL)
                        .param("fromDate", FROM)
                        .param("toDate", TO)
                        .param("warehouseId", unknownWarehouseId.toString())
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isNotFound());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-4: diffFromDps 계산 — 현재 슬라이스에서 0 반환 확인
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("TC-4: diffFromDps = 0 (DPS 엑셀 연동 Step-2 확장 전 기본값)")
    void tc4_diffFromDps_isZero() throws Exception {
        // DPS 기준 100, 자체 95 시나리오 — 현재 슬라이스는 자체 집계만 제공, diffFromDps = 0
        seedInspection("MODEL-DIFF", "차이검증상품", "COMPLETED", 100, 95, 0);

        mockMvc.perform(get(BASE_URL)
                        .param("fromDate", FROM)
                        .param("toDate", TO)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath(
                        "$.data.rows[?(@.productCode=='MODEL-DIFF')].diffFromDps").value(0))
                .andExpect(jsonPath(
                        "$.data.rows[?(@.productCode=='MODEL-DIFF')].completedQty").value(95));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-5: WAREHOUSE ROLE 통과, SALES ROLE → 403
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("TC-5: WAREHOUSE ROLE → 200, SALES ROLE → 403")
    void tc5_warehouseRolePasses_salesRoleForbidden() throws Exception {
        // WAREHOUSE → 200
        mockMvc.perform(get(BASE_URL)
                        .param("fromDate", FROM)
                        .param("toDate", TO)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());

        // SALES → 403
        mockMvc.perform(get(BASE_URL)
                        .param("fromDate", FROM)
                        .param("toDate", TO)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 헬퍼 메서드
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 테스트용 InboundInspection + InboundInspectionLine 한 쌍을 DB 에 seed 한다.
     *
     * @param modelCode    모델코드 (품번)
     * @param productName  제품명
     * @param status       검수 헤더 상태 (PENDING / COMPLETED / CANCELED)
     * @param expectedQty  슬립 기준 수량
     * @param inspectedQty 실제 검수 수량 (COMPLETED 일 때 non-null)
     * @param defectQty    불량 수량 (COMPLETED 일 때 non-null, 없으면 0)
     */
    private void seedInspection(String modelCode, String productName, String status,
                                 int expectedQty, Integer inspectedQty, Integer defectQty) {
        InboundInspection inspection = InboundInspection.create(UUID.randomUUID(), "SEED-" + modelCode);

        // 도메인 메서드로 상태 전이 (setter 직접 호출 금지)
        if ("COMPLETED".equals(status)) {
            InboundInspectionLine line = InboundInspectionLine.create(
                    inspection, UUID.randomUUID(), modelCode, productName, expectedQty);
            inspection.addLine(line);
            inspection.recordInspectorId("system");
            int dQty = defectQty != null ? defectQty : 0;
            line.recordResult(
                    inspectedQty != null ? inspectedQty : expectedQty,
                    dQty,
                    dQty > 0 ? "테스트 불량" : null);
            inspection.complete();
        } else if ("CANCELED".equals(status)) {
            InboundInspectionLine line = InboundInspectionLine.create(
                    inspection, UUID.randomUUID(), modelCode, productName, expectedQty);
            inspection.addLine(line);
            inspection.cancel();
        } else {
            // PENDING
            InboundInspectionLine line = InboundInspectionLine.create(
                    inspection, UUID.randomUUID(), modelCode, productName, expectedQty);
            inspection.addLine(line);
        }

        // saveAndFlush — native query 가 1차 캐시 우회하므로 즉시 DB write 필요
        inspectionRepository.saveAndFlush(inspection);
    }
}
