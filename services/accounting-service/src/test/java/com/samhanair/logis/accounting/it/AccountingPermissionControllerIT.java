package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.editrequest.service.AccountingEditRequestService;
import com.samhanair.logis.accounting.editrequest.web.AccountingEditRequestController;
import com.samhanair.logis.accounting.realtime.AccountingRealtimeController;
import com.samhanair.logis.accounting.service.AccountService;
import com.samhanair.logis.accounting.service.BankDepositReceiptService;
import com.samhanair.logis.accounting.service.CashReceiptService;
import com.samhanair.logis.accounting.service.DailyClosingService;
import com.samhanair.logis.accounting.service.EcountAccountImporter;
import com.samhanair.logis.accounting.service.EcountReimportService;
import com.samhanair.logis.accounting.service.EcountSalesLedgerImporter;
import com.samhanair.logis.accounting.service.HometaxExportService;
import com.samhanair.logis.accounting.service.InboundTaxInvoiceAttachmentService;
import com.samhanair.logis.accounting.service.JournalExcelExportService;
import com.samhanair.logis.accounting.service.JournalService;
import com.samhanair.logis.accounting.service.LedgerImageService;
import com.samhanair.logis.accounting.service.LedgerSnapshotService;
import com.samhanair.logis.accounting.service.Mig7CashDisbursementTransformService;
import com.samhanair.logis.accounting.service.MonthEndCloseService;
import com.samhanair.logis.accounting.service.PurchaseAccountingSlipService;
import com.samhanair.logis.accounting.service.PartnerLedgerReadService;
import com.samhanair.logis.accounting.service.SalesAggregateService;
import com.samhanair.logis.accounting.service.SalesAccountingSlipService;
import com.samhanair.logis.accounting.service.StatementBatchService;
import com.samhanair.logis.accounting.service.SupplierProfileService;
import com.samhanair.logis.accounting.service.TaxInvoiceBatchFromSalesSlipsService;
import com.samhanair.logis.accounting.service.TaxInvoiceEmitService;
import com.samhanair.logis.accounting.service.TaxInvoiceInboundService;
import com.samhanair.logis.accounting.service.TaxInvoiceService;
import com.samhanair.logis.accounting.service.TrialBalanceService;
import com.samhanair.logis.accounting.report.TrialBalanceReportController;
import com.samhanair.logis.accounting.report.TrialBalanceSummaryService;
import com.samhanair.logis.accounting.web.AccountController;
import com.samhanair.logis.accounting.web.AccountingReportController;
import com.samhanair.logis.accounting.web.CashReceiptController;
import com.samhanair.logis.accounting.web.DailyClosingController;
import com.samhanair.logis.accounting.web.EcountAccountImportController;
import com.samhanair.logis.accounting.web.EcountReimportController;
import com.samhanair.logis.accounting.web.JournalController;
import com.samhanair.logis.accounting.web.Mig11SalesLedgerImportController;
import com.samhanair.logis.accounting.web.Mig7CashDisbursementTransformController;
import com.samhanair.logis.accounting.web.MonthEndCloseController;
import com.samhanair.logis.accounting.web.PurchaseAccountingSlipController;
import com.samhanair.logis.accounting.web.SalesAccountingSlipController;
import com.samhanair.logis.accounting.web.SupplierProfileController;
import com.samhanair.logis.accounting.web.TaxInvoiceController;
import com.samhanair.logis.accounting.web.TaxInvoiceInboundController;
import com.samhanair.logis.accounting.web.TrialBalanceController;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** SP-D6-7 accounting-service @RequirePermission slice 테스트. */
@WebMvcTest(
        controllers = {
                AccountController.class,
                AccountingEditRequestController.class,
                AccountingRealtimeController.class,
                AccountingReportController.class,
                CashReceiptController.class,
                DailyClosingController.class,
                EcountAccountImportController.class,
                EcountReimportController.class,
                JournalController.class,
                Mig7CashDisbursementTransformController.class,
                Mig11SalesLedgerImportController.class,
                MonthEndCloseController.class,
                PurchaseAccountingSlipController.class,
                SalesAccountingSlipController.class,
                SupplierProfileController.class,
                TaxInvoiceController.class,
                TaxInvoiceInboundController.class,
                TrialBalanceReportController.class,
                TrialBalanceController.class
        },
        properties = "spring.application.name=accounting-service")
@Import({
        PermissionSecurityAutoConfiguration.class,
        AccountingPermissionControllerIT.TestSecurityConfig.class,
        AccountingPermissionControllerIT.TestMeterConfig.class
})
class AccountingPermissionControllerIT {

    private static final String SERVICE_NAME = "accounting-service";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final UUID ID = UUID.fromString("00000000-0000-0000-0000-000000000777");

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private PartnerLedgerReadService partnerLedgerReadService;
    @MockBean private AccountService accountService;
    @MockBean private AccountingEditRequestService editRequestService;
    @MockBean private BankDepositReceiptService bankDepositReceiptService;
    @MockBean private CashReceiptService cashReceiptService;
    @MockBean private DailyClosingService dailyClosingService;
    @MockBean private EcountAccountImporter accountImporter;
    @MockBean private EcountReimportService reimportService;
    @MockBean private EcountSalesLedgerImporter salesLedgerImporter;
    @MockBean private HometaxExportService hometaxExportService;
    @MockBean private InboundTaxInvoiceAttachmentService inboundAttachmentService;
    @MockBean private JournalExcelExportService journalExcelExportService;
    @MockBean private JournalService journalService;
    @MockBean private LedgerImageService ledgerImageService;
    @MockBean private LedgerSnapshotService ledgerSnapshotService;
    @MockBean private Mig7CashDisbursementTransformService cashDisbursementTransformService;
    @MockBean private MonthEndCloseService monthEndCloseService;
    @MockBean private PurchaseAccountingSlipService purchaseAccountingSlipService;
    @MockBean private RealtimeBroker realtimeBroker;
    @MockBean private SalesAggregateService salesAggregateService;
    @MockBean private SalesAccountingSlipService salesAccountingSlipService;
    @MockBean private StatementBatchService statementBatchService;
    @MockBean private SupplierProfileService supplierProfileService;
    @MockBean private TaxInvoiceBatchFromSalesSlipsService batchFromSalesSlipsService;
    @MockBean private TaxInvoiceEmitService taxInvoiceEmitService;
    @MockBean private TaxInvoiceInboundService taxInvoiceInboundService;
    @MockBean private TaxInvoiceService taxInvoiceService;
    @MockBean private TrialBalanceService trialBalanceService;
    @MockBean private TrialBalanceSummaryService trialBalanceSummaryService;
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(editRequestService.listPendingForRole(any())).thenReturn(List.of());
        lenient().when(editRequestService.listByEntity(any())).thenReturn(List.of());
        lenient().when(hometaxExportService.export(any(), any())).thenReturn("xlsx".getBytes());
        lenient().when(hometaxExportService.exportSplitFile(any(), any(Integer.class))).thenReturn("xlsx".getBytes());
        lenient().when(hometaxExportService.listExclusions()).thenReturn(List.of());
        lenient().when(hometaxExportService.listHistory(any(), any(), any())).thenReturn(Page.empty());
        lenient().when(journalExcelExportService.export(any(), any(), any())).thenReturn("xlsx".getBytes());
        lenient().when(realtimeBroker.subscribe(any())).thenReturn(new SseEmitter(0L));
    }

    @ParameterizedTest(name = "{0} grant")
    @MethodSource("endpoints")
    void migratedEndpoint_withGrant_isNotForbidden(EndpointCase endpoint) throws Exception {
        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().is(not(403)));
    }

    @ParameterizedTest(name = "{0} deny")
    @MethodSource("endpoints")
    void migratedEndpoint_withoutGrant_returns403AndIncrementsCounter(EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(eq(ID), eq(endpoint.page()), eq(endpoint.action()))).thenReturn(false);
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action())).isEqualTo(before + 1.0);
    }

    static Stream<EndpointCase> endpoints() {
        return Stream.of(
                endpoint("accounts tree", "accounting.accounts", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/accounts")),
                endpoint("journal list", "accounting.journals", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/journals")
                                .param("from", "2026-05-01")
                                .param("to", "2026-05-27")),
                endpoint("journal realtime", "accounting.journals.realtime", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/journals/{id}/realtime", ID)),
                endpoint("journal export", "accounting.journals", PermissionAction.DOWNLOAD, "ACCOUNTANT",
                        () -> get("/accounting/journals/export.xlsx")
                                .param("from", "2026-05-01")
                                .param("to", "2026-05-27")),
                endpoint("trial balance", "accounting.balances", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/balances").param("period", "202605")),
                endpoint("trial balance report alias", "accounting.balances", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/reports/trial-balance").param("period", "202605")),
                endpoint("trial balance summary", "accounting.balances", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/reports/trial-balance/summary")
                                .param("from", "2026-05-01")
                                .param("to", "2026-05-31")
                                .param("granularity", "MONTH")),
                endpoint("tax invoice list", "accounting.tax-invoice.list", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/tax-invoices")),
                endpoint("tax invoice print", "accounting.tax-invoice.list", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/tax-invoices/{id}/print", ID)),
                endpoint("tax invoice cancel", "accounting.tax-invoice.cancel", PermissionAction.UPDATE, "MANAGER",
                        () -> post("/accounting/tax-invoices/{id}/cancel", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"reason\":\"취소 사유 충분\"}")),
                endpoint("tax invoice realtime", "accounting.tax-invoice.realtime", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/tax-invoices/{id}/realtime", ID)),
                endpoint("tax invoice inbound", "accounting.tax-invoice.inbound.manage", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/admin/tax-invoices/inbound")),
                endpoint("hometax export history", "accounting.hometax-export", PermissionAction.VIEW, "MANAGER",
                        () -> get("/accounting/hometax-export/history")),
                endpoint("hometax export xlsx", "accounting.hometax-export", PermissionAction.DOWNLOAD, "MANAGER",
                        () -> get("/accounting/tax-invoice/hometax-export")
                                .param("from", "2026-05-01")
                                .param("to", "2026-05-27")),
                endpoint("accounting reports sales aggregate", "accounting.reports", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/sales/aggregate")
                                .param("from", "2026-05-01")
                                .param("to", "2026-05-27")),
                endpoint("accounting partner ledger", "accounting.partner-ledger", PermissionAction.PRINT, "ACCOUNTANT",
                        () -> get("/accounting/journals/ledger-data")
                                .param("partnerCode", "P-001")
                                .param("from", "2026-05-01")
                                .param("to", "2026-05-27")),
                endpoint("accounting partner ledger history", "accounting.partner-ledger", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/journals/ledger-history")
                                .param("partnerCode", "P-001")
                                .param("from", "2026-05-01")
                                .param("to", "2026-05-27")),
                endpoint("sales slip partner ledger balance", "sales.slip.list", PermissionAction.VIEW, "SALES",
                        () -> get("/accounting/journals/sales-slip-ledger")
                                .param("partnerCode", "P-001")
                                .param("from", "2026-05-01")
                                .param("to", "2026-05-01")),
                endpoint("accounting partner ledger restore", "accounting.partner-ledger", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/journals/ledger-history/{batchNo}/restore", "LEDGER-20260801-000001")),
                endpoint("accounting statement batch", "accounting.statement-batch", PermissionAction.PRINT, "ACCOUNTANT",
                        () -> get("/accounting/statements/batch-data")
                                .param("from", "2026-05-01")
                                .param("to", "2026-05-27")),
                endpoint("daily closing list", "accounting.daily-closing", PermissionAction.VIEW, "MANAGER",
                        () -> get("/accounting/daily-closings")
                                .param("from", "2026-05-01")
                                .param("to", "2026-05-27")),
                endpoint("daily closing unlock", "accounting.daily-closing.unlock", PermissionAction.UPDATE, "MANAGER",
                        () -> patch("/accounting/daily-closings/{date}/lock", "2026-05-27")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"locked\":false}")),
                endpoint("period close list", "accounting.period-close", PermissionAction.VIEW, "MANAGER",
                        () -> get("/accounting/closings")),
                endpoint("period close reverse", "accounting.period-close.reverse", PermissionAction.UPDATE, "MANAGER",
                        () -> post("/accounting/closings/{id}/reverse", ID)),
                endpoint("cash receipt create", "accounting.cash-receipts", PermissionAction.CREATE, "ACCOUNTANT",
                        () -> post("/accounting/cash-receipts")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {
                                          "amount": 1000.00,
                                          "transactionDate": "2026-07-04"
                                        }
                                        """)),
                endpoint("cash receipt from bank transactions", "accounting.cash-receipts", PermissionAction.UPDATE, "ACCOUNTANT",
                        () -> post("/accounting/cash-receipts/from-bank-transactions")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {
                                          "transactions": [
                                            {
                                              "bankAccountLabel": "S3 권한 테스트 계좌",
                                              "transactedAt": "2026-07-04T09:00:00",
                                              "amount": 1000.00,
                                              "externalRef": "S3-PERM-001"
                                            }
                                          ],
                                          "transactionDate": "2026-07-04"
                                        }
                                        """)),
                endpoint("cash receipt list", "accounting.cash-receipts", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/cash-receipts")),
                endpoint("cash receipt get one", "accounting.cash-receipts", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/cash-receipts/{id}", ID)),
                endpoint("cash receipt update", "accounting.cash-receipts", PermissionAction.UPDATE, "ACCOUNTANT",
                        () -> patch("/accounting/cash-receipts/{id}", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {
                                          "amount": 1500.00,
                                          "transactionDate": "2026-07-04"
                                        }
                                        """)),
                endpoint("cash receipt confirm", "accounting.cash-receipts", PermissionAction.UPDATE, "ACCOUNTANT",
                        () -> post("/accounting/cash-receipts/{id}/confirm", ID)),
                endpoint("cash receipt cancel", "accounting.cash-receipts", PermissionAction.UPDATE, "ACCOUNTANT",
                        () -> post("/accounting/cash-receipts/{id}/cancel", ID)),
                endpoint("cash receipt delete draft", "accounting.cash-receipts", PermissionAction.DELETE, "ACCOUNTANT",
                        () -> delete("/accounting/cash-receipts/{id}", ID)),
                endpoint("sales accounting slip", "accounting.sales-slip.accounting", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/admin/sales-slips")),
                endpoint("purchase accounting slip", "accounting.purchase-slip.accounting", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/admin/purchase-slips")),
                endpoint("supplier profile list", "accounting.supplier-profiles", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/accounting/supplier-profiles")),
                endpoint("edit request dashboard", "accounting.edit-requests.decide", PermissionAction.VIEW, "MANAGER",
                        () -> get("/accounting/edit-requests").param("targetRole", "MANAGER")),
                endpoint("ecount account import", "ecount.mig2.account", PermissionAction.CREATE, "MANAGER",
                        () -> multipart("/admin/accounts/imports/ecount")
                                .file("file", "code,name\n100,현금\n".getBytes())),
                endpoint("mig7 cash disbursement transform", "ecount.mig7.cash-disbursement", PermissionAction.CREATE, "MANAGER",
                        () -> post("/admin/accounting/cash-disbursements/transform-from-staging")),
                endpoint("mig11 sales ledger import", "ecount.mig11.sales-ledger", PermissionAction.CREATE, "MANAGER",
                        () -> multipart("/admin/accounting/sales-ledger/imports/ecount")
                                .file("file", "xlsx".getBytes())),
                endpoint("ecount reimport", "ecount.reimport", PermissionAction.CREATE, "MANAGER",
                        () -> post("/admin/ecount/reimport/{slice}", "mig2-account"))
        );
    }

    private static EndpointCase endpoint(
            String name, String page, PermissionAction action, String role,
            Supplier<MockHttpServletRequestBuilder> request) {
        return new EndpointCase(name, page, action, role, request);
    }

    private static MockHttpServletRequestBuilder withActor(MockHttpServletRequestBuilder request, String role) {
        return request
                .header(USER_ID_HEADER, ID.toString())
                .header(USER_NAME_HEADER, "테스터")
                .header(ROLE_HEADER, role);
    }

    private double deniedCount(String page, String role, PermissionAction action) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME,
                "page", page,
                "role", role,
                "action", action.name()
        ).count();
    }

    record EndpointCase(
            String name,
            String page,
            PermissionAction action,
            String role,
            Supplier<MockHttpServletRequestBuilder> request) {

        @Override
        public String toString() {
            return name;
        }
    }

    @TestConfiguration
    @EnableMethodSecurity
    static class TestSecurityConfig {

        @Bean
        SecurityFilterChain testSecurityFilterChain(
                HttpSecurity http,
                com.fasterxml.jackson.databind.ObjectMapper objectMapper) throws Exception {
            http
                    .csrf(AbstractHttpConfigurer::disable)
                    .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .addFilterBefore(new com.samhanair.logis.accounting.config.HeaderAuthenticationFilter(objectMapper),
                            UsernamePasswordAuthenticationFilter.class);
            return http.build();
        }
    }

    @TestConfiguration
    static class TestMeterConfig {

        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }
    }
}
