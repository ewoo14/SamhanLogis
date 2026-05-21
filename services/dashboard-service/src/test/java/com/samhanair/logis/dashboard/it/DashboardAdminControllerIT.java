package com.samhanair.logis.dashboard.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.dashboard.DashboardServiceApplication;
import com.samhanair.logis.dashboard.client.AccountingClient;
import com.samhanair.logis.dashboard.client.InventoryClient;
import com.samhanair.logis.dashboard.client.PartnerClient;
import com.samhanair.logis.dashboard.client.PartnerOrderClient;
import com.samhanair.logis.dashboard.client.PartnerSummary;
import com.samhanair.logis.dashboard.repository.KpiSnapshotRepository;
import com.samhanair.logis.dashboard.repository.RealTimeStockRepository;
import com.samhanair.logis.dashboard.repository.SalesAggregateRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * Admin endpoint 시나리오 (5 case).
 *
 * <ol>
 *   <li>KPI 조회 (MANAGER 권한) — 200 + 빈 list</li>
 *   <li>realtime-stock — 200 + 빈 list (warehouseCode null 시 전체 조회)</li>
 *   <li>sales-aggregate — 200 + 빈 list</li>
 *   <li>refresh — 200 + RefreshResult (H2/skeleton 환경에서 fail-soft 가능, 200 자체는 보장)</li>
 *   <li>잘못된 from/to (from > to) → 400</li>
 * </ol>
 *
 * <p>4 외부 client 모두 {@code @MockBean} 격리 의무.
 */
@SpringBootTest(classes = DashboardServiceApplication.class)
@AutoConfigureMockMvc
class DashboardAdminControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private KpiSnapshotRepository kpiRepository;
    @Autowired
    private RealTimeStockRepository stockRepository;
    @Autowired
    private SalesAggregateRepository salesRepository;

    @MockBean
    private InventoryClient inventoryClient;
    @MockBean
    private AccountingClient accountingClient;
    @MockBean
    private PartnerOrderClient partnerOrderClient;
    @MockBean
    private PartnerClient partnerClient;

    @BeforeEach
    void cleanup() {
        lenient().when(inventoryClient.findStock(any(), any())).thenReturn(Optional.empty());
        lenient().when(accountingClient.sumSalesByPartner(any(), any(), any())).thenReturn(BigDecimal.ZERO);
        lenient().when(partnerOrderClient.countOrdersByPartner(any(), any(), any())).thenReturn(0);
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        kpiRepository.deleteAll();
        stockRepository.deleteAll();
        salesRepository.deleteAll();
    }

    @Test
    void kpi_list_returns_200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/dashboard/kpi")
                        .header("X-User-Id", "test-admin")
                        .header("X-User-Role", "MANAGER")
                        .param("from", LocalDate.now().minusDays(7).toString())
                        .param("to", LocalDate.now().toString()))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true));
    }

    @Test
    void realtime_stock_returns_200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/dashboard/realtime-stock")
                        .header("X-User-Id", "test-admin")
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data").isArray());
    }

    @Test
    void sales_aggregate_returns_200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/dashboard/sales-aggregate")
                        .header("X-User-Id", "test-admin")
                        .header("X-User-Role", "MANAGER")
                        .param("from", LocalDate.now().minusDays(7).toString())
                        .param("to", LocalDate.now().toString())
                        .param("interval", "DAILY"))
                .andExpect(MockMvcResultMatchers.status().isOk());
    }

    /**
     * PR #94 W4 후속 fix (QA Q-W4-2 채택) — partnerCode 입력 시 service-side resolve.
     * partnerClient mock 응답 활성 케이스에서 200 + 정상 동작 검증.
     */
    @Test
    void sales_aggregate_with_partner_code_returns_200() throws Exception {
        UUID resolvedId = UUID.randomUUID();
        lenient().when(partnerClient.findByCode(eq("PA-0001")))
                .thenReturn(Optional.of(new PartnerSummary(resolvedId, "PA-0001", "테스트거래처")));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/dashboard/sales-aggregate")
                        .header("X-User-Id", "test-admin")
                        .header("X-User-Role", "MANAGER")
                        .param("from", LocalDate.now().minusDays(7).toString())
                        .param("to", LocalDate.now().toString())
                        .param("interval", "DAILY")
                        .param("partnerCode", "PA-0001"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true));
    }

    /**
     * partnerCode 가 미존재 (resolver empty) 시 400 응답 — UUID 비공개 가드 일관.
     */
    @Test
    void sales_aggregate_with_unknown_partner_code_returns_400() throws Exception {
        // mock default = Optional.empty (BeforeEach 에서 설정)
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/dashboard/sales-aggregate")
                        .header("X-User-Id", "test-admin")
                        .header("X-User-Role", "MANAGER")
                        .param("from", LocalDate.now().minusDays(7).toString())
                        .param("to", LocalDate.now().toString())
                        .param("interval", "DAILY")
                        .param("partnerCode", "PA-NONEXISTENT"))
                .andExpect(MockMvcResultMatchers.status().isBadRequest());
    }

    @Test
    void refresh_returns_200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/dashboard/refresh")
                        .header("X-User-Id", "test-admin")
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true));
    }

    @Test
    void ecount_mig_ops_dashboard_returns_200_on_v1_gateway_target_path() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/dashboard/ecount-mig")
                        .header("X-User-Id", "test-admin")
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.transformStatus").isArray());
    }

    @Test
    void kpi_with_from_after_to_returns_400() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/dashboard/kpi")
                        .header("X-User-Id", "test-admin")
                        .header("X-User-Role", "MANAGER")
                        .param("from", LocalDate.now().toString())
                        .param("to", LocalDate.now().minusDays(7).toString()))
                .andExpect(MockMvcResultMatchers.status().isBadRequest());
    }
}
