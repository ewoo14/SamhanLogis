package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.service.EcountOrderImporter;
import com.samhanair.logis.accounting.service.EcountSalesPurchaseSummaryImporter;
import com.samhanair.logis.accounting.service.EcountSalesSlipLineImporter;
import com.samhanair.logis.accounting.service.EcountTaxInvoiceImporter;
import com.samhanair.logis.accounting.web.dto.EcountMig4ImportResult;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
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
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(partnerLookupClient.findByPartnerId(any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode(any())).thenReturn(Optional.empty());
    }

    @ParameterizedTest(name = "{0} manager upload 200")
    @MethodSource("endpoints")
    @WithMockUser(authorities = "ROLE_MANAGER")
    void manager_can_upload(String label, String url) throws Exception {
        stubSuccess(url);

        mockMvc.perform(multipart(url)
                        .file(file())
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000115")
                        .header("X-User-Role", "MANAGER")
                        .with(csrf()))
                .andExpect(status().isOk());
    }

    @ParameterizedTest(name = "{0} member forbidden")
    @MethodSource("endpoints")
    @WithMockUser(authorities = "ROLE_MEMBER")
    void member_cannot_upload(String label, String url) throws Exception {
        denyRequirePermission(pageCode(url), PermissionAction.CREATE);
        when(dynamicPermissionClient.canEdit("MEMBER", pageCode(url))).thenReturn(false);
        when(dynamicPermissionClient.canView("MEMBER", pageCode(url))).thenReturn(true);

        mockMvc.perform(multipart(url)
                        .file(file())
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000115")
                        .header("X-User-Role", "MEMBER")
                        .with(csrf()))
                .andExpect(status().isForbidden());
    }

    @ParameterizedTest(name = "{0} anonymous forbidden")
    @MethodSource("endpoints")
    void anonymous_cannot_upload(String label, String url) throws Exception {
        // C5-3: 진짜 anonymous = identity 헤더 전무. (구 형태=X-User-Id+role없음 은
        // X-User-Id 단독 인증 도입으로 정당한 인증 형태가 됨 — 인가는 @RequirePermission 이 담당)
        mockMvc.perform(multipart(url)
                        .file(file())
                        .with(csrf()))
                .andExpect(status().isForbidden());
    }

    @ParameterizedTest(name = "{0} invalid mime 400")
    @MethodSource("endpoints")
    @WithMockUser(authorities = "ROLE_MANAGER")
    void invalid_mime_returns_400(String label, String url) throws Exception {
        mockMvc.perform(multipart(url)
                        .file(new MockMultipartFile("file", "sample.txt", "text/plain", "x".getBytes()))
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000115")
                        .header("X-User-Role", "MANAGER")
                        .with(csrf()))
                .andExpect(status().isBadRequest());
    }

    @ParameterizedTest(name = "{0} csv header mismatch 422")
    @MethodSource("endpoints")
    @WithMockUser(authorities = "ROLE_MANAGER")
    void csv_header_mismatch_returns_422(String label, String url) throws Exception {
        stubHeaderMismatch(url);

        mockMvc.perform(multipart(url)
                        .file(new MockMultipartFile("file", "broken.csv", "text/csv",
                                "\"bad\"\n\"row\"\n".getBytes()))
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000115")
                        .header("X-User-Role", "MANAGER")
                        .with(csrf()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("MIG4_CSV_HEADER_MISMATCH")));
    }

    private void stubSuccess(String url) throws Exception {
        if (url.contains("tax-invoices")) {
            when(taxInvoiceImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());
        } else if (url.contains("ecount-line")) {
            when(salesSlipLineImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());
        } else if (url.contains("sales-purchase-summary")) {
            when(summaryImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());
        } else {
            when(orderImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());
        }
    }

    private void stubHeaderMismatch(String url) throws Exception {
        BusinessException ex = new BusinessException(ErrorCode.MIG4_CSV_HEADER_MISMATCH, "MIG4_CSV_HEADER_MISMATCH");
        if (url.contains("tax-invoices")) {
            when(taxInvoiceImporter.importCsv(any(InputStream.class), anyString())).thenThrow(ex);
        } else if (url.contains("ecount-line")) {
            when(salesSlipLineImporter.importCsv(any(InputStream.class), anyString())).thenThrow(ex);
        } else if (url.contains("sales-purchase-summary")) {
            when(summaryImporter.importCsv(any(InputStream.class), anyString())).thenThrow(ex);
        } else {
            when(orderImporter.importCsv(any(InputStream.class), anyString())).thenThrow(ex);
        }
    }

    private static Stream<Arguments> endpoints() {
        return Stream.of(
                Arguments.of("taxInvoice", "/admin/accounting/tax-invoices/imports/ecount"),
                Arguments.of("salesSlipLine", "/admin/accounting/sales-slips/imports/ecount-line"),
                Arguments.of("summary", "/admin/accounting/sales-purchase-summary/imports/ecount"),
                Arguments.of("order", "/admin/accounting/orders/imports/ecount"));
    }

    private static String pageCode(String url) {
        if (url.contains("tax-invoices")) {
            return "ecount.mig4.tax-invoice";
        }
        if (url.contains("ecount-line")) {
            return "ecount.mig4.sales-slip-line";
        }
        if (url.contains("sales-purchase-summary")) {
            return "ecount.mig4.summary";
        }
        return "ecount.mig4.order";
    }

    private static EcountMig4ImportResult result() {
        return new EcountMig4ImportResult(1, 1, 0, 0, 0, 0, 0, 0, 0, "HASH", List.of(), List.of());
    }

    private static MockMultipartFile file() {
        return new MockMultipartFile("file", "sample.csv", "text/csv", "x".getBytes());
    }
}
