package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.service.EcountPurchaseLedgerImporter;
import com.samhanair.logis.accounting.service.EcountSalesLedgerImporter;
import com.samhanair.logis.common.ecount.EcountMig11Result;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
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

/** MIG-11 매출장/매입장 XLSX import controller multipart + 권한 가드 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
class EcountMig11LedgerImportControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @MockBean private EcountSalesLedgerImporter salesLedgerImporter;
    @MockBean private EcountPurchaseLedgerImporter purchaseLedgerImporter;
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

    @ParameterizedTest(name = "{0} {2}")
    @MethodSource("cases")
    void mig11_endpoint_cases(String endpointLabel, String url, String label,
                              MockMultipartFile file, String role, boolean includeUserId,
                              int expectedStatus) throws Exception {
        if (expectedStatus == 200) {
            stubSuccess(url);
        }
        if ("headerMismatch".equals(label)) {
            stubHeaderMismatch(url);
        }
        if ("memberForbidden".equals(label)) {
            denyRequirePermission(pageCode(url), PermissionAction.CREATE);
            when(dynamicPermissionClient.canEdit(role, pageCode(url))).thenReturn(false);
            when(dynamicPermissionClient.canView(role, pageCode(url))).thenReturn(true);
        }

        var request = multipart(url).file(file);
        if (includeUserId) {
            request.header("X-User-Id", "00000000-0000-0000-0000-000000000115");
        }
        if (role != null) {
            request.header("X-User-Role", role);
        }

        var actions = mockMvc.perform(request).andExpect(status().is(expectedStatus));
        if ("success".equals(label)) {
            actions.andExpect(content().string(org.hamcrest.Matchers.containsString("\"imported\":1")));
        }
        if ("headerMismatch".equals(label)) {
            actions.andExpect(content().string(org.hamcrest.Matchers.containsString("MIG11_HEADER_MISMATCH")));
        }
    }

    private void stubSuccess(String url) throws Exception {
        if (url.contains("sales-ledger")) {
            when(salesLedgerImporter.importXlsx(any(InputStream.class), anyString())).thenReturn(result());
        } else {
            when(purchaseLedgerImporter.importXlsx(any(InputStream.class), anyString())).thenReturn(result());
        }
    }

    private void stubHeaderMismatch(String url) throws Exception {
        BusinessException ex = new BusinessException(ErrorCode.MIG11_HEADER_MISMATCH,
                "MIG11_HEADER_MISMATCH");
        if (url.contains("sales-ledger")) {
            when(salesLedgerImporter.importXlsx(any(InputStream.class), anyString())).thenThrow(ex);
        } else {
            when(purchaseLedgerImporter.importXlsx(any(InputStream.class), anyString())).thenThrow(ex);
        }
    }

    private static Stream<Arguments> cases() {
        return endpoints().flatMap(endpoint -> Stream.of(
                Arguments.of(endpoint[0], endpoint[1], "success", xlsx("sample.xlsx"), "MANAGER", true, 200),
                Arguments.of(endpoint[0], endpoint[1], "missingUserId", xlsx("sample.xlsx"), "MANAGER", false, 401),
                Arguments.of(endpoint[0], endpoint[1], "memberForbidden", xlsx("sample.xlsx"), "MEMBER", true, 403),
                Arguments.of(endpoint[0], endpoint[1], "invalidMime", file("sample.txt", "text/plain"), "MANAGER", true, 400),
                Arguments.of(endpoint[0], endpoint[1], "headerMismatch", xlsx("broken.xlsx"), "MANAGER", true, 422)
        ));
    }

    private static Stream<String[]> endpoints() {
        return Stream.of(
                new String[]{"salesLedger", "/admin/accounting/sales-ledger/imports/ecount"},
                new String[]{"purchaseLedger", "/admin/accounting/purchase-ledger/imports/ecount"});
    }

    private static String pageCode(String url) {
        if (url.contains("sales-ledger")) {
            return "ecount.mig11.sales-ledger";
        }
        return "ecount.mig11.purchase-ledger";
    }

    private static EcountMig11Result result() {
        return new EcountMig11Result(1, 1, 0, 0, 0, "HASH", List.of(), List.of());
    }

    private static MockMultipartFile xlsx(String name) {
        return file(name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }

    private static MockMultipartFile file(String name, String contentType) {
        return new MockMultipartFile("file", name, contentType, "x".getBytes());
    }
}
