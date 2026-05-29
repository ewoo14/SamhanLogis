package com.samhanair.logis.partnerorder.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerSummary;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient.CatalogEntry;
import com.samhanair.logis.partnerorder.vendor.ocr.MockOcrEngine;
import com.samhanair.logis.partnerorder.vendor.ocr.OcrEngine;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * VendorOrderController 통합 테스트 — upload (MOCK OCR + parser + 단가 lookup) + confirm 4 case.
 *
 * <p>외부 client (DcConfig / Product / Inventory / Slip / PartnerAuth / PartnerLookup /
 * ProductCatalogLookup) 모두 {@code @MockBean} 격리 — Eureka 비활성 환경 5xx 회피
 * (memory feedback_it_mockbean_external_clients).
 *
 * <p>OCR 엔진: TestConfiguration 으로 {@link MockOcrEngine} 주입 (Tesseract native 미의존).
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "samhan.partner-order.ocr.enabled=true",
        "samhan.partner-order.ocr.engine=MOCK"
})
class VendorOrderControllerIT extends AbstractPostgresIT {

    private static final String MASTER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000401";
    private static final String MANAGER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000402";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private OcrEngine ocrEngine;

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
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    /** TestConfiguration — MockOcrEngine 을 OcrEngine 으로 노출. OcrEngineConfig 의 conditional bean 보다 우선. */
    @TestConfiguration
    static class MockOcrEngineTestConfig {
        @Bean
        @Primary
        OcrEngine testMockOcrEngineBean() {
            return new MockOcrEngine();
        }
    }

    @BeforeEach
    void setUp() {
        Mockito.lenient()
                .when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.anyString(), Mockito.any(PermissionAction.class)))
                .thenReturn(true);

        // OcrEngine 은 MockOcrEngine 인스턴스 — preset 등록.
        if (ocrEngine instanceof MockOcrEngine mock) {
            mock.setPresetText("AIRD", """
                    에어디자이너 발주서
                    거래처: P-A001
                    1. 헬로멀티 5kW [HM-5000] 2개 1,000,000원
                    합계: 2,000,000원
                    """);
            mock.setPresetText("JSYS", """
                    JSYSTEM order
                    Partner: P-J001
                    HM-7000 헬로멀티 7kW 1 EA 1,500,000
                    TOTAL 1,500,000
                    """);
            mock.setDefaultText("");
        }

        Mockito.lenient().when(catalogLookupClient.findByModelCodes(Mockito.anyList()))
                .thenReturn(Map.of(
                        "HM-5000", new CatalogEntry("HM-5000", "헬로멀티 5kW",
                                new BigDecimal("950000")),
                        "HM-7000", new CatalogEntry("HM-7000", "헬로멀티 7kW",
                                new BigDecimal("1500000"))));
        Mockito.lenient().when(partnerLookupClient.findByPartnerCode(Mockito.anyString()))
                .thenAnswer(inv -> {
                    String code = inv.getArgument(0);
                    if ("P-NONE".equals(code)) {
                        return Optional.empty();
                    }
                    return Optional.of(new PartnerSummary(
                            UUID.randomUUID(), code, "Test Partner", "1234567890"));
                });
        Mockito.lenient().when(dcConfigClient.fetchDcConfig(Mockito.anyString()))
                .thenReturn(Map.of("homeDiscount", 0.10));
        Mockito.lenient().when(productClient.lookup(Mockito.anyList()))
                .thenReturn(java.util.List.of());
        Mockito.lenient().when(slipServiceClient.publishFromPartnerOrder(
                        Mockito.anyMap(), Mockito.anyString()))
                .thenReturn(SlipServiceClient.PublishResult.published("STUB"));
    }

    @Test
    @WithMockUser(roles = {"MASTER"})
    void upload_air_designer_ok() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "ad.png", "image/png", "AIRD".getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(multipart("/api/v1/admin/partner-order/vendor/upload")
                        .file(file)
                        .header(HttpHeaderConstants.CALLER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.vendorName").value("에어디자이너"))
                .andExpect(jsonPath("$.data.partnerCode").value("P-A001"))
                .andExpect(jsonPath("$.data.parsedLines.length()").value(1))
                .andExpect(jsonPath("$.data.parsedLines[0].modelCode").value("HM-5000"))
                .andExpect(jsonPath("$.data.parsedLines[0].source").value("CATALOG"));
    }

    @Test
    @WithMockUser(roles = {"MANAGER"})
    void upload_jsystem_ok() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "j.png", "image/png", "JSYS".getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(multipart("/api/v1/admin/partner-order/vendor/upload")
                        .file(file)
                        .header(HttpHeaderConstants.CALLER_ID_HEADER, MANAGER_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.vendorName").value("제이시스템"))
                .andExpect(jsonPath("$.data.parsedLines[0].modelCode").value("HM-7000"));
    }

    @Test
    @WithMockUser(roles = {"MASTER"})
    void upload_unknown_vendor_returns_400() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "x.png", "image/png", "RANDOM".getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(multipart("/api/v1/admin/partner-order/vendor/upload")
                        .file(file)
                        .header(HttpHeaderConstants.CALLER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser(roles = {"MASTER"})
    void confirm_partner_not_found_returns_404() throws Exception {
        String body = """
                {"vendorName":"제이시스템","partnerCode":"P-NONE","lines":[
                  {"modelCode":"HM-7000","productName":"헬로멀티","quantity":1,"finalPrice":1500000}
                ]}
                """;
        mockMvc.perform(post("/api/v1/admin/partner-order/vendor/confirm")
                        .header(HttpHeaderConstants.CALLER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MASTER")
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isNotFound());
    }
}
