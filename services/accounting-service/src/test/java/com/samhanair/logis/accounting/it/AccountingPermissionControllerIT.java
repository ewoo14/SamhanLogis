package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
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
import com.samhanair.logis.accounting.service.DailyClosingService;
import com.samhanair.logis.accounting.service.EcountAccountImporter;
import com.samhanair.logis.accounting.service.EcountReimportService;
import com.samhanair.logis.accounting.service.EcountSalesLedgerImporter;
import com.samhanair.logis.accounting.service.HometaxExportService;
import com.samhanair.logis.accounting.service.InboundTaxInvoiceAttachmentService;
import com.samhanair.logis.accounting.service.JournalExcelExportService;
import com.samhanair.logis.accounting.service.JournalService;
import com.samhanair.logis.accounting.service.LedgerImageService;
import com.samhanair.logis.accounting.service.Mig7CashDisbursementTransformService;
import com.samhanair.logis.accounting.service.MonthEndCloseService;
import com.samhanair.logis.accounting.service.PurchaseAccountingSlipService;
import com.samhanair.logis.accounting.service.SalesAggregateService;
import com.samhanair.logis.accounting.service.SalesAccountingSlipService;
import com.samhanair.logis.accounting.service.StatementBatchService;
import com.samhanair.logis.accounting.service.SupplierProfileService;
import com.samhanair.logis.accounting.service.TaxInvoiceBatchFromSalesSlipsService;
import com.samhanair.logis.accounting.service.TaxInvoiceEmitService;
import com.samhanair.logis.accounting.service.TaxInvoiceInboundService;
import com.samhanair.logis.accounting.service.TaxInvoiceService;
import com.samhanair.logis.accounting.service.TrialBalanceService;
import com.samhanair.logis.accounting.web.AccountController;
import com.samhanair.logis.accounting.web.AccountingReportController;
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
    @MockBean private AccountService accountService;
    @MockBean private AccountingEditRequestService editRequestService;
    @MockBean private DailyClosingService dailyClosingService;
    @MockBean private EcountAccountImporter accountImporter;
    @MockBean private EcountReimportService reimportService;
    @MockBean private EcountSalesLedgerImporter salesLedgerImporter;
    @MockBean private HometaxExportService hometaxExportService;
    @MockBean private InboundTaxInvoiceAttachmentService inboundAttachmentService;
    @MockBean private JournalExcelExportService journalExcelExportService;
    @MockBean private JournalService journalService;
    @MockBean private LedgerImageService ledgerImageService;
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
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
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
        if ("VIEW".equals(endpoint.action())) {
            when(dynamicPermissionClient.canView(endpoint.role(), endpoint.page())).thenReturn(false);
        } else {
            when(dynamicPermissionClient.canEdit(endpoint.role(), endpoint.page())).thenReturn(false);
        }
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action())).isEqualTo(before + 1.0);
    }

    static Stream<EndpointCase> endpoints() {
        return Stream.of(
                endpoint("accounts tree", "accounting.accounts", "VIEW", "ACCOUNTANT",
                        () -> get("/accounting/accounts")),
                endpoint("journal list", "accounting.journals", "VIEW", "ACCOUNTANT",
                        () -> get("/accounting/journals")
                                .param("from", "2026-05-01")
                                .param("to", "2026-05-27")),
                endpoint("journal realtime", "accounting.journals.realtime", "VIEW", "ACCOUNTANT",
                        () -> get("/accounting/journals/{id}/realtime", ID)),
                endpoint("trial balance", "accounting.balances.trial-balance", "VIEW", "ACCOUNTANT",
                        () -> get("/accounting/balances").param("period", "202605")),
                endpoint("tax invoice list", "accounting.tax-invoice.list", "VIEW", "ACCOUNTANT",
                        () -> get("/accounting/tax-invoices")),
                endpoint("tax invoice cancel", "accounting.tax-invoice.cancel", "EDIT", "MANAGER",
                        () -> post("/accounting/tax-invoices/{id}/cancel", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"reason\":\"취소 사유 충분\"}")),
                endpoint("tax invoice realtime", "accounting.tax-invoice.realtime", "VIEW", "ACCOUNTANT",
                        () -> get("/accounting/tax-invoices/{id}/realtime", ID)),
                endpoint("tax invoice inbound", "accounting.tax-invoice.inbound.manage", "VIEW", "ACCOUNTANT",
                        () -> get("/admin/tax-invoices/inbound")),
                endpoint("hometax export history", "accounting.hometax-export", "VIEW", "MANAGER",
                        () -> get("/accounting/hometax-export/history")),
                endpoint("daily closing list", "accounting.daily-closing", "VIEW", "MANAGER",
                        () -> get("/api/v1/accounting/daily-closings")
                                .param("from", "2026-05-01")
                                .param("to", "2026-05-27")),
                endpoint("daily closing unlock", "accounting.daily-closing.unlock", "EDIT", "MASTER",
                        () -> patch("/api/v1/accounting/daily-closings/{date}/lock", "2026-05-27")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"locked\":false}")),
                endpoint("period close list", "accounting.period-close", "VIEW", "MANAGER",
                        () -> get("/accounting/closings")),
                endpoint("period close reverse", "accounting.period-close.reverse", "EDIT", "MASTER",
                        () -> post("/accounting/closings/{id}/reverse", ID)),
                endpoint("sales accounting slip", "accounting.sales-slip.accounting", "VIEW", "ACCOUNTANT",
                        () -> get("/admin/sales-slips")),
                endpoint("purchase accounting slip", "accounting.purchase-slip.accounting", "VIEW", "ACCOUNTANT",
                        () -> get("/admin/purchase-slips")),
                endpoint("supplier profile list", "accounting.supplier-profiles", "VIEW", "ACCOUNTANT",
                        () -> get("/api/v1/accounting/supplier-profiles")),
                endpoint("edit request dashboard", "accounting.edit-requests.decide", "VIEW", "MANAGER",
                        () -> get("/accounting/edit-requests").param("targetRole", "MANAGER")),
                endpoint("ecount account import", "ecount.mig2.account", "EDIT", "MANAGER",
                        () -> multipart("/admin/accounts/imports/ecount")
                                .file("file", "code,name\n100,현금\n".getBytes())),
                endpoint("mig7 cash disbursement transform", "ecount.mig7.cash-disbursement", "EDIT", "MANAGER",
                        () -> post("/admin/accounting/cash-disbursements/transform-from-staging")),
                endpoint("mig11 sales ledger import", "ecount.mig11.sales-ledger", "EDIT", "MANAGER",
                        () -> multipart("/admin/accounting/sales-ledger/imports/ecount")
                                .file("file", "xlsx".getBytes())),
                endpoint("ecount reimport", "ecount.reimport", "EDIT", "MASTER",
                        () -> post("/admin/ecount/reimport/{slice}", "mig2-account"))
        );
    }

    private static EndpointCase endpoint(
            String name, String page, String action, String role,
            Supplier<MockHttpServletRequestBuilder> request) {
        return new EndpointCase(name, page, action, role, request);
    }

    private static MockHttpServletRequestBuilder withActor(MockHttpServletRequestBuilder request, String role) {
        return request
                .header(USER_ID_HEADER, ID.toString())
                .header(USER_NAME_HEADER, "테스터")
                .header(ROLE_HEADER, role);
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

    record EndpointCase(
            String name,
            String page,
            String action,
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
        SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            http
                    .csrf(AbstractHttpConfigurer::disable)
                    .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .addFilterBefore(new com.samhanair.logis.accounting.config.HeaderAuthenticationFilter(),
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
