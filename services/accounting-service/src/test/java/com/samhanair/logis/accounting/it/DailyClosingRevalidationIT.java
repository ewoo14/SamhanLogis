package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ApplicablePrice;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.accounting.client.AuthAccountLookupClient;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.CodefClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.EcountRemoteImportClient;
import com.samhanair.logis.accounting.client.EmployeeLookupClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.NotificationClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ProductAliasClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.ProductLabelMatch;
import com.samhanair.logis.accounting.client.ProductSummary;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.client.codef.EasyCodefClient;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipLine;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 일별 마감 detail 재검증 HTTP 통합 테스트.
 *
 * <p>S2c 계약: TAX_INVOICE 와 전표(SALES_SLIP·PURCHASE_SLIP) 3소스가 동일한 재검증 DTO
 * 6필드를 MockMvc 직렬화 계층에서 노출해야 한다 (spec §6.6.3).
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@MockitoSettings(strictness = Strictness.LENIENT)
@Transactional
class DailyClosingRevalidationIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private TaxInvoiceRepository taxInvoiceRepository;
    @Autowired private SalesAccountingSlipRepository salesAccountingSlipRepository;
    @Autowired private PurchaseAccountingSlipRepository purchaseAccountingSlipRepository;

    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private SlipQueryClient slipQueryClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private CodefClient codefClient;
    @MockBean private EasyCodefClient easyCodefClient;
    @MockBean private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    @MockBean private AuthAccountLookupClient authAccountLookupClient;
    @MockBean private EcountRemoteImportClient ecountRemoteImportClient;
    @MockBean private EmployeeLookupClient employeeLookupClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private ProductAliasClient productAliasClient;
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    private static final LocalDate DATE = LocalDate.of(2026, 7, 13);
    private static final UUID PARTNER_ID = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee01");
    private static final UUID AM_PRODUCT_ID = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee11");
    private static final UUID AJ_PRODUCT_ID = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee12");
    private static final String ACCOUNTANT_ID = "00000000-0000-0000-0000-000000000101";

    @BeforeEach
    void stubExternalClients() {
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(anyList()))
                .thenReturn(Map.of(PARTNER_ID, new PartnerSummary(
                        PARTNER_ID, "P-RV", "재검증거래처", "111-22-33333", "서울")));
        lenient().when(productClient.resolveByLabelBulk(anyList()))
                .thenReturn(Map.of());
        lenient().when(productClient.lookup(anyList())).thenAnswer(invocation -> {
            java.util.List<UUID> ids = invocation.getArgument(0);
            return ids.stream().map(id -> new ProductSummary(
                    id, "테스트품목", "TEST-MODEL", null, null, "ACTIVE",
                    AM_PRODUCT_ID.equals(id) ? "commercialMulti" : "homemulti")).toList();
        });
        lenient().when(productClient.priceChangeDefaultVariants()).thenReturn(Map.of(
                "homemulti", false,
                "singleSets", false,
                "commercialMulti", false,
                "oldProducts", false));
        lenient().when(productClient.applicablePrices(anyList(), any(LocalDate.class)))
                .thenReturn(Map.of(
                        AM_PRODUCT_ID, new ApplicablePrice(new BigDecimal("100000"), new BigDecimal("70000"), DATE),
                        AJ_PRODUCT_ID, new ApplicablePrice(new BigDecimal("100000"), new BigDecimal("70000"), DATE)));
        lenient().when(productClient.fixedDiscountRates(anyList()))
                .thenReturn(Map.of(
                        AM_PRODUCT_ID, new BigDecimal("45.00"),
                        AJ_PRODUCT_ID, new BigDecimal("45.00")));
        lenient().when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(anyString()))
                .thenReturn(java.util.List.of());
    }

    @Test
    @DisplayName("TAX_INVOICE daily detail — 재검증 6필드를 HTTP JSON으로 노출한다")
    void taxInvoiceDailyDetailExposesRevalidationFields() throws Exception {
        seedIssuedTaxInvoice();
        Mockito.when(productClient.resolveByLabelBulk(anyList())).thenReturn(Map.of(
                "AM160NXVHHH1 [AM상업멀티]", ProductLabelMatch.matched(AM_PRODUCT_ID, "AM160NXVHHH1"),
                "미등록서비스품목", ProductLabelMatch.notFound()));

        mockMvc.perform(get("/accounting/closings/daily")
                        .param("date", DATE.toString())
                        .param("sourceKind", "TAX_INVOICE")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.productSummaries[0].productName").value("AM160NXVHHH1 [AM상업멀티]"))
                .andExpect(jsonPath("$.data.productSummaries[0].modelName").value("AM160NXVHHH1"))
                .andExpect(jsonPath("$.data.productSummaries[0].releasePrice").value(100000))
                .andExpect(jsonPath("$.data.productSummaries[0].deliveryPrice").value(70000))
                .andExpect(jsonPath("$.data.productSummaries[0].expectedRate").value(45))
                .andExpect(jsonPath("$.data.productSummaries[0].actualRate").value(45))
                .andExpect(jsonPath("$.data.productSummaries[0].verified").value(true))
                .andExpect(jsonPath("$.data.productSummaries[0].revalidationStatus").value("VERIFIED"))
                .andExpect(jsonPath("$.data.productSummaries[1].productName").value("미등록서비스품목"))
                .andExpect(jsonPath("$.data.productSummaries[1].modelName").doesNotExist())
                .andExpect(jsonPath("$.data.productSummaries[1].releasePrice").doesNotExist())
                .andExpect(jsonPath("$.data.productSummaries[1].deliveryPrice").doesNotExist())
                .andExpect(jsonPath("$.data.productSummaries[1].expectedRate").doesNotExist())
                .andExpect(jsonPath("$.data.productSummaries[1].actualRate").doesNotExist())
                .andExpect(jsonPath("$.data.productSummaries[1].verified").doesNotExist())
                .andExpect(jsonPath("$.data.productSummaries[1].revalidationStatus").value("NOT_FOUND"));
    }

    @Test
    @DisplayName("SALES_SLIP daily detail — 전표 경로도 재검증 6필드를 HTTP JSON으로 노출한다")
    void salesSlipDailyDetailExposesRevalidationFields() throws Exception {
        seedPostedSalesSlip();
        Mockito.when(productClient.resolveByLabelBulk(anyList())).thenReturn(
                Map.of("AJ040RXH4BC1 [AJ홈멀티]", ProductLabelMatch.matched(AJ_PRODUCT_ID, "AJ040RXH4BC1")));

        mockMvc.perform(get("/accounting/closings/daily")
                        .param("date", DATE.toString())
                        .param("sourceKind", "SALES_SLIP")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.productSummaries[0].productName").value("AJ040RXH4BC1 [AJ홈멀티]"))
                .andExpect(jsonPath("$.data.productSummaries[0].releasePrice").value(100000))
                .andExpect(jsonPath("$.data.productSummaries[0].deliveryPrice").value(70000))
                .andExpect(jsonPath("$.data.productSummaries[0].expectedRate").value(45))
                .andExpect(jsonPath("$.data.productSummaries[0].actualRate").value(45))
                .andExpect(jsonPath("$.data.productSummaries[0].verified").value(true))
                .andExpect(jsonPath("$.data.productSummaries[0].revalidationStatus").value("VERIFIED"));
    }

    @Test
    @DisplayName("PURCHASE_SLIP daily detail — 매입전표 경로도 재검증 6필드를 HTTP JSON으로 노출한다")
    void purchaseSlipDailyDetailExposesRevalidationFields() throws Exception {
        seedPostedPurchaseSlip();
        Mockito.when(productClient.resolveByLabelBulk(anyList())).thenReturn(
                Map.of("AM160NXVHHH1 [상업멀티]", ProductLabelMatch.matched(AM_PRODUCT_ID, "AM160NXVHHH1")));

        mockMvc.perform(get("/accounting/closings/daily")
                        .param("date", DATE.toString())
                        .param("kind", "PURCHASE")
                        .param("sourceKind", "PURCHASE_SLIP")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.productSummaries[0].productName").value("AM160NXVHHH1 [상업멀티]"))
                .andExpect(jsonPath("$.data.productSummaries[0].releasePrice").value(100000))
                .andExpect(jsonPath("$.data.productSummaries[0].deliveryPrice").value(70000))
                .andExpect(jsonPath("$.data.productSummaries[0].expectedRate").value(45))
                .andExpect(jsonPath("$.data.productSummaries[0].actualRate").value(45))
                .andExpect(jsonPath("$.data.productSummaries[0].verified").value(true))
                .andExpect(jsonPath("$.data.productSummaries[0].revalidationStatus").value("VERIFIED"));
    }

    @Test
    @DisplayName("daily detail — accounting.reports VIEW 미보유 role 은 403")
    void dailyDetailRequiresAccountingReportsViewPermission() throws Exception {
        denyRequirePermission("accounting.reports", PermissionAction.VIEW);

        mockMvc.perform(get("/accounting/closings/daily")
                        .param("date", DATE.toString())
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    private void seedIssuedTaxInvoice() {
        SalesAccountingSlip sourceSlip = SalesAccountingSlip.createDraft(
                "SAS-HTTP-RV-SOURCE", DATE, PARTNER_ID, "P-RV", "재검증거래처",
                SalesTaxType.TAXABLE, "S2c HTTP IT");
        SalesAccountingSlipLine knownSource = SalesAccountingSlipLine.create(
                sourceSlip, 1, "MIG4", "AM160NXVHHH1 [AM상업멀티]", "AM160NXVHHH1",
                "commercialMulti", BigDecimal.ONE, new BigDecimal("50000"),
                new BigDecimal("50000"), new BigDecimal("5000"), new BigDecimal("55000"));
        SalesAccountingSlipLine unknownSource = SalesAccountingSlipLine.create(
                sourceSlip, 2, "SERVICE", "미등록서비스품목", null, null,
                BigDecimal.ONE, new BigDecimal("10000"), new BigDecimal("10000"),
                new BigDecimal("1000"), new BigDecimal("11000"));
        TaxInvoice invoice = TaxInvoice.createDraftFromSalesSlips(
                "TI-HTTP-RV-001", DATE, PARTNER_ID, "P-RV", "재검증거래처", "111-22-33333",
                java.util.List.of(knownSource, unknownSource), "it");
        invoice.issue("2026/07/13-QA1", "it");
        taxInvoiceRepository.saveAndFlush(invoice);
    }

    private void seedPostedSalesSlip() {
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft(
                "SAS-HTTP-RV-001", DATE, PARTNER_ID, "P-RV", "재검증거래처",
                SalesTaxType.TAXABLE, "S2c HTTP IT");
        SalesAccountingSlipLine line = SalesAccountingSlipLine.create(
                slip, 1, "MIG4", "AJ040RXH4BC1 [AJ홈멀티]", "AJ040RXH4BC1", "homemulti", BigDecimal.ONE,
                new BigDecimal("50000"), new BigDecimal("50000"), new BigDecimal("5000"),
                new BigDecimal("55000"));
        slip.getLines().add(line);
        ReflectionTestUtils.setField(slip, "status", SalesSlipStatus.POSTED);
        ReflectionTestUtils.setField(slip, "totalSupplyAmount", new BigDecimal("50000"));
        ReflectionTestUtils.setField(slip, "totalVatAmount", new BigDecimal("5000"));
        ReflectionTestUtils.setField(slip, "totalAmount", new BigDecimal("55000"));
        ReflectionTestUtils.setField(slip, "postedBy", "it");
        ReflectionTestUtils.setField(slip, "postedAt", java.time.LocalDateTime.now());
        salesAccountingSlipRepository.saveAndFlush(slip);
    }

    private void seedPostedPurchaseSlip() {
        PurchaseAccountingSlip slip = PurchaseAccountingSlip.createDraft(
                "PAS-HTTP-RV-001", DATE, PARTNER_ID, "P-RV", "재검증거래처",
                SalesTaxType.TAXABLE, "S2c HTTP IT");
        PurchaseAccountingSlipLine line = PurchaseAccountingSlipLine.create(
                slip, 1, "MIG4", "AM160NXVHHH1 [상업멀티]", BigDecimal.ONE,
                new BigDecimal("50000"), new BigDecimal("50000"), new BigDecimal("5000"),
                new BigDecimal("55000"));
        slip.getLines().add(line);
        ReflectionTestUtils.setField(slip, "status", PurchaseSlipStatus.POSTED);
        ReflectionTestUtils.setField(slip, "totalSupplyAmount", new BigDecimal("50000"));
        ReflectionTestUtils.setField(slip, "totalVatAmount", new BigDecimal("5000"));
        ReflectionTestUtils.setField(slip, "totalAmount", new BigDecimal("55000"));
        ReflectionTestUtils.setField(slip, "postedBy", "it");
        ReflectionTestUtils.setField(slip, "postedAt", java.time.LocalDateTime.now());
        purchaseAccountingSlipRepository.saveAndFlush(slip);
    }
}
