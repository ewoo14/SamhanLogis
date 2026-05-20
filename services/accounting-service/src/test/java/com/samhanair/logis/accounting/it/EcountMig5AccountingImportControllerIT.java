package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.service.EcountDepositReportImporter;
import com.samhanair.logis.accounting.service.EcountExpenseVoucherImporter;
import com.samhanair.logis.common.ecount.EcountMig5ImportResult;
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
import org.springframework.test.web.servlet.MockMvc;

/** MIG-5 accounting import controller multipart + 권한 가드 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
class EcountMig5AccountingImportControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @MockBean private EcountExpenseVoucherImporter expenseVoucherImporter;
    @MockBean private EcountDepositReportImporter depositReportImporter;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;
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

    @ParameterizedTest(name = "{0} {1}")
    @MethodSource("cases")
    void accounting_import_endpoint_cases(String endpointLabel, String url, String label,
                                          MockMultipartFile file, String role,
                                          int expectedStatus) throws Exception {
        if (expectedStatus == 200) {
            stubSuccess(url);
        }
        if ("headerMismatch".equals(label)) {
            stubHeaderMismatch(url);
        }

        var request = multipart(url).file(file).header("X-User-Id", "tester");
        if (role != null) {
            request.header("X-User-Role", role);
        }

        var actions = mockMvc.perform(request);
        actions.andExpect(status().is(expectedStatus));
        if ("headerMismatch".equals(label)) {
            actions.andExpect(content().string(org.hamcrest.Matchers.containsString("MIG5_CSV_HEADER_MISMATCH")));
        }
    }

    private void stubSuccess(String url) throws Exception {
        if (url.contains("expense-vouchers")) {
            when(expenseVoucherImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());
        } else {
            when(depositReportImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());
        }
    }

    private void stubHeaderMismatch(String url) throws Exception {
        BusinessException ex = new BusinessException(ErrorCode.MIG5_CSV_HEADER_MISMATCH,
                "MIG5_CSV_HEADER_MISMATCH");
        if (url.contains("expense-vouchers")) {
            when(expenseVoucherImporter.importCsv(any(InputStream.class), anyString())).thenThrow(ex);
        } else {
            when(depositReportImporter.importCsv(any(InputStream.class), anyString())).thenThrow(ex);
        }
    }

    private static Stream<Arguments> cases() {
        return endpoints().flatMap(endpoint -> Stream.of(
                Arguments.of(endpoint[0], endpoint[1], "success", file("sample.csv", "text/csv"), "MANAGER", 200),
                Arguments.of(endpoint[0], endpoint[1], "anonymous", file("sample.csv", "text/csv"), null, 403),
                Arguments.of(endpoint[0], endpoint[1], "memberForbidden", file("sample.csv", "text/csv"), "MEMBER", 403),
                Arguments.of(endpoint[0], endpoint[1], "invalidMime", file("sample.txt", "text/plain"), "MANAGER", 400),
                Arguments.of(endpoint[0], endpoint[1], "headerMismatch", file("broken.csv", "text/csv"), "MANAGER", 422)
        ));
    }

    private static Stream<String[]> endpoints() {
        return Stream.of(
                new String[]{"expenseVoucher", "/admin/accounting/expense-vouchers/imports/ecount"},
                new String[]{"depositReport", "/admin/accounting/deposit-reports/imports/ecount"});
    }

    private static EcountMig5ImportResult result() {
        return new EcountMig5ImportResult(1, 1, 0, 0, 0, 0, 0, false, "HASH", List.of(), List.of());
    }

    private static MockMultipartFile file(String name, String contentType) {
        return new MockMultipartFile("file", name, contentType, "x".getBytes());
    }
}
