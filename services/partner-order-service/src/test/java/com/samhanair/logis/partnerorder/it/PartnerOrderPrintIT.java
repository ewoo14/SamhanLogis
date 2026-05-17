package com.samhanair.logis.partnerorder.it;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.audit.repository.PartnerOrderAuditLogRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 주문 인쇄 HTML endpoint 계약을 검증한다.
 *
 * <p>인쇄 응답은 브라우저 새 탭에서 바로 인쇄할 수 있는 HTML 이며, 내부 UUID 를 본문에 노출하지 않는다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class PartnerOrderPrintIT extends AbstractPostgresIT {

    private static final String PARTNER_CODE_HEADER = "X-Partner-Code";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PartnerOrderRepository orderRepository;

    @Autowired
    private SlipPublishOutboxRepository outboxRepository;

    @Autowired
    private PartnerOrderAuditLogRepository auditLogRepository;

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
        auditLogRepository.deleteAll();
        outboxRepository.deleteAll();
        orderRepository.deleteAll();
    }

    @Test
    @WithMockUser(username = "sales", roles = {"SALES"})
    void testPrintSuccessHtmlReturns200() throws Exception {
        saveOrder("2026/05/17-41", "P-PRINT-A", "1010101010", false);

        mockMvc.perform(get("/api/v1/partner-orders/{id}/print", "2026-05-17-41"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(containsString("charset=UTF-8")));
    }

    @Test
    @WithMockUser(username = "sales", roles = {"SALES"})
    void testPrintNotFoundReturns404() throws Exception {
        mockMvc.perform(get("/api/v1/partner-orders/{id}/print", "2026-05-17-404"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_NOT_FOUND"));
    }

    @Test
    @WithMockUser(username = "sales", roles = {"SALES"})
    void testPrintSoftDeletedReturns404() throws Exception {
        saveOrder("2026/05/17-42", "P-PRINT-B", "2020202020", true);

        mockMvc.perform(get("/api/v1/partner-orders/{id}/print", "2026-05-17-42"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_NOT_FOUND"));
    }

    @Test
    @WithMockUser(username = "partner-user", roles = {"PARTNER"})
    void testPrintPartnerRoleSeesOwnOrderOnly() throws Exception {
        saveOrder("2026/05/17-43", "P-PRINT-OWN", "3030303030", false);
        saveOrder("2026/05/17-44", "P-PRINT-OTHER", "4040404040", false);

        mockMvc.perform(get("/api/v1/partner-orders/{id}/print", "2026-05-17-43")
                        .header(HttpHeaderConstants.CALLER_ID_HEADER, "partner-user")
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "PARTNER")
                        .header(PARTNER_CODE_HEADER, "P-PRINT-OWN"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/partner-orders/{id}/print", "2026-05-17-44")
                        .header(HttpHeaderConstants.CALLER_ID_HEADER, "partner-user")
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "PARTNER")
                        .header(PARTNER_CODE_HEADER, "P-PRINT-OWN"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    @WithMockUser(username = "manager", roles = {"MANAGER"})
    void testPrintHtmlContentContainsOrderNumber() throws Exception {
        saveOrder("2026/05/17-45", "P-PRINT-C", "5050505050", false);

        mockMvc.perform(get("/api/v1/partner-orders/{id}/print", "2026-05-17-45"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("2026/05/17-45")))
                .andExpect(content().string(containsString("P-PRINT-C")))
                .andExpect(content().string(containsString("실외기")))
                .andExpect(content().string(containsString("240,000")))
                .andExpect(content().string(containsString("합계")));
    }

    private void saveOrder(String orderNo, String partnerCode, String bizCode, boolean deleted) {
        PartnerOrder order = PartnerOrder.create(
                partnerCode,
                bizCode,
                orderNo,
                "IT-SP0844-PRINT-" + orderNo,
                BigDecimal.ZERO);
        order.markSlipPublished("S-" + orderNo.replace("/", "").replace("-", ""));
        order.updateHeader(partnerCode, bizCode, LocalDate.of(2026, 5, 30), "인쇄 IT 요청사항");
        order.addLine(PartnerOrderLine.create(
                UUID.randomUUID(),
                "AJ040RXH4BC1",
                "실외기",
                "homemulti",
                2,
                new BigDecimal("120000"),
                "현장 납품"));
        if (deleted) {
            order.softDeleteCascade("it");
        }
        orderRepository.saveAndFlush(order);
    }
}
