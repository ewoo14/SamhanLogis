package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.service.EcountOrderImporter;
import com.samhanair.logis.accounting.service.EcountSalesPurchaseSummaryImporter;
import com.samhanair.logis.accounting.service.EcountSalesSlipLineImporter;
import com.samhanair.logis.accounting.service.EcountTaxInvoiceImporter;
import com.samhanair.logis.accounting.web.dto.EcountMig4ImportResult;
import java.io.InputStream;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/** MIG-4 import controller multipart + 권한 가드 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
class EcountMig4ImportControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @MockBean private EcountTaxInvoiceImporter taxInvoiceImporter;
    @MockBean private EcountSalesSlipLineImporter salesSlipLineImporter;
    @MockBean private EcountSalesPurchaseSummaryImporter summaryImporter;
    @MockBean private EcountOrderImporter orderImporter;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(partnerLookupClient.findByPartnerId(any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode(any())).thenReturn(Optional.empty());
    }

    @Test
    @WithMockUser(authorities = "ROLE_MANAGER")
    void manager_can_upload_all_mig4_import_files() throws Exception {
        when(taxInvoiceImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());
        when(salesSlipLineImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());
        when(summaryImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());
        when(orderImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());

        forEachEndpoint((url, file) -> mockMvc.perform(multipart(url)
                        .file(file)
                        .header("X-User-Id", "tester")
                        .header("X-User-Role", "MANAGER")
                        .with(csrf()))
                .andExpect(status().isOk()));
    }

    @Test
    @WithMockUser(authorities = "ROLE_MEMBER")
    void member_cannot_upload_all_mig4_import_files() throws Exception {
        forEachEndpoint((url, file) -> mockMvc.perform(multipart(url)
                        .file(file)
                        .header("X-User-Id", "tester")
                        .header("X-User-Role", "MEMBER")
                        .with(csrf()))
                .andExpect(status().isForbidden()));
    }

    @Test
    void anonymous_cannot_upload_all_mig4_import_files() throws Exception {
        forEachEndpoint((url, file) -> mockMvc.perform(multipart(url)
                        .file(file)
                        .header("X-User-Id", "tester")
                        .with(csrf()))
                .andExpect(status().isForbidden()));
    }

    @Test
    @WithMockUser(authorities = "ROLE_MANAGER")
    void invalid_mime_returns_400_for_all_mig4_import_files() throws Exception {
        forEachEndpoint((url, ignored) -> mockMvc.perform(multipart(url)
                        .file(new MockMultipartFile("file", "sample.txt", "text/plain", "x".getBytes()))
                        .header("X-User-Id", "tester")
                        .header("X-User-Role", "MANAGER")
                        .with(csrf()))
                .andExpect(status().isBadRequest()));
    }

    private static EcountMig4ImportResult result() {
        return new EcountMig4ImportResult(1, 1, 0, 0, 0, 0, 0, 0, 0, "HASH", List.of(), List.of());
    }

    private static MockMultipartFile file() {
        return new MockMultipartFile("file", "sample.csv", "text/csv", "x".getBytes());
    }

    private void forEachEndpoint(EndpointAssertion assertion) throws Exception {
        for (String url : List.of(
                "/admin/accounting/tax-invoices/imports/ecount",
                "/admin/accounting/sales-slips/imports/ecount-line",
                "/admin/accounting/sales-purchase-summary/imports/ecount",
                "/admin/accounting/orders/imports/ecount")) {
            assertion.verify(url, file());
        }
    }

    @FunctionalInterface
    private interface EndpointAssertion {
        void verify(String url, MockMultipartFile file) throws Exception;
    }
}
