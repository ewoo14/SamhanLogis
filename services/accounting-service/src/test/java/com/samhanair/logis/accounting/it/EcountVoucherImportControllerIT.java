package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.service.EcountGeneralVoucherImporter;
import com.samhanair.logis.accounting.service.EcountJournalEntryImporter;
import com.samhanair.logis.accounting.service.EcountPurchaseSlipImporter;
import com.samhanair.logis.accounting.service.EcountSalesSlipImporter;
import com.samhanair.logis.accounting.web.dto.EcountVoucherImportResult;
import com.samhanair.logis.security.permission.PermissionAction;
import java.io.InputStream;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/** MIG-3 회계 전표 4종 import controller multipart + 권한 가드 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
class EcountVoucherImportControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @MockBean private EcountPurchaseSlipImporter purchaseSlipImporter;
    @MockBean private EcountSalesSlipImporter salesSlipImporter;
    @MockBean private EcountGeneralVoucherImporter generalVoucherImporter;
    @MockBean private EcountJournalEntryImporter journalEntryImporter;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(partnerLookupClient.findByPartnerNameStrict("삼한상사"))
                .thenReturn(Optional.of(new PartnerSummary(
                        UUID.fromString("00000000-0000-0000-0000-000000000101"),
                        "P-001", "삼한상사", "123-45-67890", "서울")));
        lenient().when(partnerLookupClient.findByPartnerId(any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode(any())).thenReturn(Optional.empty());
    }

    @Test
    @WithMockUser(authorities = "ROLE_MANAGER")
    void manager_can_upload_purchase_slip_import_file() throws Exception {
        when(purchaseSlipImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());

        assertOk("/admin/accounting/purchase-slips/imports/ecount");
    }

    @Test
    @WithMockUser(authorities = "ROLE_MANAGER")
    void manager_can_upload_sales_slip_import_file() throws Exception {
        when(salesSlipImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());

        assertOk("/admin/accounting/sales-slips/imports/ecount");
    }

    @Test
    @WithMockUser(authorities = "ROLE_MANAGER")
    void manager_can_upload_general_voucher_import_file() throws Exception {
        when(generalVoucherImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());

        assertOk("/admin/accounting/general-vouchers/imports/ecount");
    }

    @Test
    @WithMockUser(authorities = "ROLE_MANAGER")
    void manager_can_upload_journal_entry_import_file() throws Exception {
        when(journalEntryImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());

        assertOk("/admin/accounting/journal-entries/imports/ecount");
    }

    @Test
    @WithMockUser(authorities = "ROLE_MEMBER")
    void member_cannot_upload_all_mig3_import_files() throws Exception {
        denyDynamicPermissionFor("MEMBER");

        forEachEndpoint((url, file) -> {
            denyRequirePermission(pageCode(url), PermissionAction.CREATE);
            mockMvc.perform(multipart(url)
                            .file(file)
                            .header("X-User-Id", "00000000-0000-0000-0000-000000000115")
                            .header("X-User-Role", "MEMBER")
                            .with(csrf()))
                    .andExpect(status().isForbidden());
        });
    }

    @Test
    void anonymous_cannot_upload_all_mig3_import_files() throws Exception {
        // 게이트웨이 X-User-Role 헤더가 없으면 HeaderAuthenticationFilter 가 인증을 설정하지 않아
        // 익명 상태가 된다. Spring Security 기본 entry point (Http403ForbiddenEntryPoint) 가 403 반환.
        forEachEndpoint((url, file) -> mockMvc.perform(multipart(url)
                        .file(file)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000115")
                        .with(csrf()))
                .andExpect(status().isForbidden()));
    }

    @Test
    @WithMockUser(authorities = "ROLE_MANAGER")
    void invalid_mime_returns_400_for_all_mig3_import_files() throws Exception {
        forEachEndpoint((url, ignored) -> mockMvc.perform(multipart(url)
                        .file(new MockMultipartFile("file", "sample.txt", "text/plain", "x".getBytes()))
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000115")
                        .header("X-User-Role", "MANAGER")
                        .with(csrf()))
                .andExpect(status().isBadRequest()));
    }

    @Test
    @WithMockUser(authorities = "ROLE_MANAGER")
    void empty_file_returns_400_for_all_mig3_import_files() throws Exception {
        forEachEndpoint((url, ignored) -> mockMvc.perform(multipart(url)
                        .file(new MockMultipartFile("file", "empty.csv", "text/csv", new byte[0]))
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000115")
                        .header("X-User-Role", "MANAGER")
                        .with(csrf()))
                .andExpect(status().isBadRequest()));
    }

    private void assertOk(String url) throws Exception {
        mockMvc.perform(multipart(url)
                        .file(file())
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000115")
                        .header("X-User-Role", "MANAGER")
                        .with(csrf()))
                .andExpect(status().isOk());
    }

    private static EcountVoucherImportResult result() {
        return new EcountVoucherImportResult(1, 1, 0, 0, 0, 1, 0, "HASH", List.of(), List.of());
    }

    private static MockMultipartFile file() {
        return new MockMultipartFile("file", "sample.csv", "text/csv", "x".getBytes());
    }

    private void forEachEndpoint(EndpointAssertion assertion) throws Exception {
        for (String url : List.of(
                "/admin/accounting/purchase-slips/imports/ecount",
                "/admin/accounting/sales-slips/imports/ecount",
                "/admin/accounting/general-vouchers/imports/ecount",
                "/admin/accounting/journal-entries/imports/ecount")) {
            assertion.verify(url, file());
        }
    }

    private static String pageCode(String url) {
        if (url.contains("purchase-slips")) {
            return "ecount.mig3.purchase-slip";
        }
        if (url.contains("sales-slips")) {
            return "ecount.mig3.sales-slip";
        }
        if (url.contains("general-vouchers")) {
            return "ecount.mig3.general-voucher";
        }
        return "ecount.mig3.journal-entry";
    }

    @FunctionalInterface
    private interface EndpointAssertion {
        void verify(String url, MockMultipartFile file) throws Exception;
    }
}
