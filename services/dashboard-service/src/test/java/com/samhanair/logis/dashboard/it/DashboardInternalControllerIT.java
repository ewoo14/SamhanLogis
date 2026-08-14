package com.samhanair.logis.dashboard.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.dashboard.DashboardServiceApplication;
import com.samhanair.logis.dashboard.client.AccountingClient;
import com.samhanair.logis.dashboard.client.InventoryClient;
import com.samhanair.logis.dashboard.client.PartnerClient;
import com.samhanair.logis.dashboard.client.PartnerOrderClient;
import com.samhanair.logis.dashboard.repository.KpiSnapshotRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
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
 * Internal endpoint 인증 / KPI 조회 시나리오 (4 case).
 *
 * <ol>
 *   <li>X-Internal-Token 누락 → 403 (Spring Security)</li>
 *   <li>X-Internal-Token 불일치 → 401 (InternalTokenFilter 직접 응답)</li>
 *   <li>X-Internal-Token 일치 + 빈 KPI 조회 → 200 + 빈 list</li>
 *   <li>잘못된 카테고리 enum → 400</li>
 * </ol>
 *
 * <p>4 외부 client 모두 {@code @MockBean} 격리 의무 (memory feedback_it_mockbean_external_clients).
 */
@SpringBootTest(classes = DashboardServiceApplication.class, properties = "SAMHAN_GATEWAY_ATTESTATION=test-attestation")
@AutoConfigureMockMvc
class DashboardInternalControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private KpiSnapshotRepository kpiRepository;

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
    }

    @Test
    void kpi_without_token_returns_403() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/dashboard/kpi/DAILY_SALES")
                        .param("from", LocalDate.now().minusDays(7).toString())
                        .param("to", LocalDate.now().toString()))
                .andExpect(MockMvcResultMatchers.status().isForbidden());
    }

    @Test
    void kpi_with_invalid_token_returns_401() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/dashboard/kpi/DAILY_SALES")
                        .header("X-Internal-Token", "wrong-token")
                        .param("from", LocalDate.now().minusDays(7).toString())
                        .param("to", LocalDate.now().toString()))
                .andExpect(MockMvcResultMatchers.status().isUnauthorized());
    }

    @Test
    void kpi_with_valid_token_returns_200_empty_list() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/dashboard/kpi/DAILY_SALES")
                        .header("X-Internal-Token", "test-internal-token")
                        .param("from", LocalDate.now().minusDays(7).toString())
                        .param("to", LocalDate.now().toString()))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data").isArray());
    }

    @Test
    void kpi_with_invalid_category_returns_400() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/dashboard/kpi/UNKNOWN_CATEGORY")
                        .header("X-Internal-Token", "test-internal-token")
                        .param("from", LocalDate.now().minusDays(7).toString())
                        .param("to", LocalDate.now().toString()))
                .andExpect(MockMvcResultMatchers.status().is4xxClientError());
    }
}
