package com.samhanair.logis.partnerorder.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 주문 상세 endpoint 의 순수 상세 DTO 계약을 검증한다.
 *
 * <p>상세 응답은 사용자 표시용 주문번호와 거래처 코드만 노출하며, 라인 UUID 는 응답하지 않는다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class PartnerOrderDetailIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PartnerOrderRepository orderRepository;

    @MockBean
    private DcConfigClient dcConfigClient;
    @MockBean
    private ProductClient productClient;
    @MockBean
    private InventoryClient inventoryClient;
    @MockBean
    private SlipServiceClient slipServiceClient;
    @MockBean
    private PartnerAuthClient partnerAuthClient;
    @MockBean
    private PartnerLookupClient partnerLookupClient;
    @MockBean
    private ProductCatalogLookupClient catalogLookupClient;

    @BeforeEach
    void setUp() {
        orderRepository.deleteAll();
    }

    @Test
    @WithMockUser(username = "owner", roles = {"SALES"})
    void detail_by_order_number_returns_header_and_lines() throws Exception {
        saveOrder("2026/05/07-1", "P-DETAIL-A", "1010101010", false);

        mockMvc.perform(get("/api/v1/partner-orders/{id}", "2026-05-07-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderNumber").value("2026/05/07-1"))
                .andExpect(jsonPath("$.data.partnerCode").value("P-DETAIL-A"))
                .andExpect(jsonPath("$.data.partnerName").value("P-DETAIL-A"))
                .andExpect(jsonPath("$.data.lines.length()").value(1))
                .andExpect(jsonPath("$.data.lines[0].productName").value("실외기"))
                .andExpect(jsonPath("$.data.lines[0].id").doesNotExist());
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void detail_not_found_returns_404_catalog_code() throws Exception {
        mockMvc.perform(get("/api/v1/partner-orders/{id}", "2026-05-07-404"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_NOT_FOUND"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void detail_soft_deleted_order_is_excluded() throws Exception {
        saveOrder("2026/05/07-2", "P-DETAIL-B", "2020202020", true);

        mockMvc.perform(get("/api/v1/partner-orders/{id}", "2026-05-07-2"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_NOT_FOUND"));
    }

    @Test
    @WithMockUser(username = "other-user", roles = {"SALES"})
    void detail_sales_role_can_read_other_user_order_for_internal_operations() throws Exception {
        saveOrder("2026/05/07-3", "P-DETAIL-C", "3030303030", false);

        mockMvc.perform(get("/api/v1/partner-orders/{id}", "2026-05-07-3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderNumber").value("2026/05/07-3"));
    }

    private void saveOrder(String orderNo, String partnerCode, String bizCode, boolean deleted) {
        PartnerOrder order = PartnerOrder.create(
                partnerCode,
                bizCode,
                orderNo,
                "IT-SP0841-DETAIL-" + orderNo,
                BigDecimal.ZERO);
        order.markSlipPublished("S-" + orderNo.replace("/", "").replace("-", ""));
        order.addLine(PartnerOrderLine.create(
                UUID.randomUUID(),
                "AJ040RXH4BC1",
                "실외기",
                "homemulti",
                2,
                new BigDecimal("120000"),
                "현장 납품"));
        if (deleted) {
            order.markDeleted("it");
        }
        orderRepository.saveAndFlush(order);
    }
}
