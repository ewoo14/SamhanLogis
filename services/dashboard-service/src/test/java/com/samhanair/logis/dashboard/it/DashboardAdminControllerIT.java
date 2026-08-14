package com.samhanair.logis.dashboard.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.dashboard.DashboardServiceApplication;
import com.samhanair.logis.dashboard.client.AccountingClient;
import com.samhanair.logis.dashboard.client.InventoryClient;
import com.samhanair.logis.dashboard.client.PartnerClient;
import com.samhanair.logis.dashboard.client.PartnerOrderClient;
import com.samhanair.logis.dashboard.client.PartnerSummary;
import com.samhanair.logis.dashboard.repository.KpiSnapshotRepository;
import com.samhanair.logis.dashboard.repository.RealTimeStockRepository;
import com.samhanair.logis.dashboard.repository.SalesAggregateRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import io.micrometer.core.instrument.MeterRegistry;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

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
@SpringBootTest(classes = DashboardServiceApplication.class, properties = "SAMHAN_GATEWAY_ATTESTATION=test-attestation")
@AutoConfigureMockMvc
class DashboardAdminControllerIT extends AbstractPostgresIT {

    private static final String SERVICE_NAME = "dashboard-service";
    private static final String ACCOUNT_ID = "00000000-0000-0000-0000-000000000501";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private MeterRegistry meterRegistry;
    @Autowired
    private KpiSnapshotRepository kpiRepository;
    @Autowired
    private RealTimeStockRepository stockRepository;
    @Autowired
    private SalesAggregateRepository salesRepository;
    @Autowired
    private RequestMappingHandlerMapping requestMappingHandlerMapping;

    @MockBean
    private InventoryClient inventoryClient;
    @MockBean
    private AccountingClient accountingClient;
    @MockBean
    private PartnerOrderClient partnerOrderClient;
    @MockBean
    private PartnerClient partnerClient;
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void cleanup() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(inventoryClient.findStock(any(), any())).thenReturn(Optional.empty());
        lenient().when(accountingClient.sumSalesByPartner(any(), any(), any())).thenReturn(BigDecimal.ZERO);
        lenient().when(accountingClient.fetchPrometheusMetrics()).thenReturn("");
        lenient().when(partnerOrderClient.countOrdersByPartner(any(), any(), any())).thenReturn(0);
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        kpiRepository.deleteAll();
        stockRepository.deleteAll();
        salesRepository.deleteAll();
    }

    @Test
    void kpi_list_returns_200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/dashboard/kpi")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-Samhan-Gateway-Attestation", "test-attestation")
                        .header("X-User-Role", "MANAGER")
                        .param("from", LocalDate.now().minusDays(7).toString())
                        .param("to", LocalDate.now().toString()))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true));
    }

    @Test
    void realtime_stock_returns_200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/dashboard/realtime-stock")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-Samhan-Gateway-Attestation", "test-attestation")
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data").isArray());
    }

    @Test
    void sales_aggregate_returns_200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/dashboard/sales-aggregate")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-Samhan-Gateway-Attestation", "test-attestation")
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
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-Samhan-Gateway-Attestation", "test-attestation")
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
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-Samhan-Gateway-Attestation", "test-attestation")
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
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-Samhan-Gateway-Attestation", "test-attestation")
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true));
    }

    @Test
    void ecount_mig_ops_dashboard_returns_200_on_v1_gateway_target_path() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/dashboard/ecount-mig")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-Samhan-Gateway-Attestation", "test-attestation")
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.transformStatus").isArray());
    }

    @Test
    void ecount_mig_ops_dashboard_allows_accountant_view() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/dashboard/ecount-mig")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-Samhan-Gateway-Attestation", "test-attestation")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true));
    }

    @Test
    void old_admin_ecount_mig_ops_path_is_removed() throws Exception {
        boolean mapped = requestMappingHandlerMapping.getHandlerMethods().keySet().stream()
                .flatMap(info -> info.getPathPatternsCondition().getPatterns().stream())
                .anyMatch(pattern -> "/admin/dashboard/ecount-mig".equals(pattern.getPatternString()));

        assertThat(mapped).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("permissionGuardedEndpoints")
    void permissionGuardedEndpoints_withoutMatrixGrant_return403AndIncrementCounter(
            String name, String role, String pageCode, PermissionAction action, MockHttpServletRequestBuilder request) throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(pageCode), eq(action))).thenReturn(false);
        double before = deniedCount(pageCode, role, action.name());

        mockMvc.perform(withActor(request, role))
                .andExpect(MockMvcResultMatchers.status().isForbidden());

        assertThat(deniedCount(pageCode, role, action.name())).isEqualTo(before + 1.0);
    }

    @Test
    void kpi_with_from_after_to_returns_400() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/dashboard/kpi")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-Samhan-Gateway-Attestation", "test-attestation")
                        .header("X-User-Role", "MANAGER")
                        .param("from", LocalDate.now().toString())
                        .param("to", LocalDate.now().minusDays(7).toString()))
                .andExpect(MockMvcResultMatchers.status().isBadRequest());
    }

    private static Stream<Arguments> permissionGuardedEndpoints() {
        LocalDate today = LocalDate.now();
        LocalDate from = today.minusDays(7);
        return Stream.of(
                Arguments.of("dashboard kpi", "MANAGER", "dashboard.admin", PermissionAction.VIEW,
                        MockMvcRequestBuilders.get("/admin/dashboard/kpi")
                                .param("from", from.toString())
                                .param("to", today.toString())),
                Arguments.of("dashboard realtime stock", "MANAGER", "dashboard.admin", PermissionAction.VIEW,
                        MockMvcRequestBuilders.get("/admin/dashboard/realtime-stock")),
                Arguments.of("dashboard sales aggregate", "MANAGER", "dashboard.admin", PermissionAction.VIEW,
                        MockMvcRequestBuilders.get("/admin/dashboard/sales-aggregate")
                                .param("from", from.toString())
                                .param("to", today.toString())
                                .param("interval", "DAILY")),
                Arguments.of("dashboard refresh", "MANAGER", "dashboard.admin", PermissionAction.UPDATE,
                        MockMvcRequestBuilders.post("/admin/dashboard/refresh")),
                Arguments.of("dashboard ecount mig ops", "ACCOUNTANT", "ecount.mig.ops-dashboard", PermissionAction.VIEW,
                        MockMvcRequestBuilders.get("/dashboard/ecount-mig"))
        );
    }

    private static MockHttpServletRequestBuilder withActor(
            MockHttpServletRequestBuilder request,
            String role) {
        return request
                .header("X-User-Id", ACCOUNT_ID)
                .header("X-Samhan-Gateway-Attestation", "test-attestation")
                .header("X-User-Role", role);
    }

    private double deniedCount(String page, String role, String action) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME,
                "page", page,
                "role", role,
                "action", action
        ).count();
    }
}
