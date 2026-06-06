package com.samhanair.logis.inventory.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.ecount.EcountMig5ImportResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.AccountingClient;
import com.samhanair.logis.inventory.client.NotificationClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductLookupClient;
import com.samhanair.logis.inventory.client.SlipServiceClient;
import com.samhanair.logis.inventory.service.EcountStockTransferImporter;
import com.samhanair.logis.security.permission.PermissionAction;
import java.io.InputStream;
import java.util.List;
import java.util.UUID;
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

/** MIG-5 창고이동 import controller multipart + 권한 가드 IT. */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
class EcountStockTransferImportControllerIT extends AbstractPostgresIT {

    private static final String URL = "/admin/inventory/stock-transfers/imports/ecount";

    @Autowired
    private MockMvc mockMvc;

    @MockBean private EcountStockTransferImporter importer;
    @MockBean private ProductClient productClient;
    @MockBean private ProductLookupClient productLookupClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private AccountingClient accountingClient;
    @MockBean private NotificationClient notificationClient;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
    }

    @ParameterizedTest(name = "stockTransfer {0}")
    @MethodSource("cases")
    void stockTransfer_import_endpoint_cases(String label, MockMultipartFile file,
                                             String role, int expectedStatus) throws Exception {
        if (expectedStatus == 200) {
            when(importer.importCsv(any(InputStream.class), anyString())).thenReturn(result());
        }
        if ("headerMismatch".equals(label)) {
            when(importer.importCsv(any(InputStream.class), anyString()))
                    .thenThrow(new BusinessException(ErrorCode.MIG5_CSV_HEADER_MISMATCH,
                            "MIG5_CSV_HEADER_MISMATCH"));
        }
        if ("MEMBER".equals(role) || "noRoleForbidden".equals(label)) {
            when(dynamicPermissionClient.check(
                            org.mockito.ArgumentMatchers.any(UUID.class),
                            org.mockito.ArgumentMatchers.eq("ecount.import.inventory"),
                            org.mockito.ArgumentMatchers.eq(PermissionAction.CREATE)))
                    .thenReturn(false);
        }

        var request = multipart(URL).file(file);
        // C5-3: 진짜 anonymous(헤더 전무) 케이스만 X-User-Id 미전송
        if (!"anonymous".equals(label)) {
            request.header("X-User-Id", "10000000-0000-0000-0000-000000000213");
        }
        if (role != null) {
            request.header("X-User-Role", role);
        }

        var actions = mockMvc.perform(request);
        actions.andExpect(status().is(expectedStatus));
        if ("headerMismatch".equals(label)) {
            actions.andExpect(content().string(org.hamcrest.Matchers.containsString("MIG5_CSV_HEADER_MISMATCH")));
        }
    }

    private static Stream<Arguments> cases() {
        return Stream.of(
                Arguments.of("success", file("sample.csv", "text/csv"), "MANAGER", 200),
                // C5-3: 진짜 anonymous = 헤더 전무 (구 "anonymous"=userId+role없음 은 이제 정당한 인증 형태)
                Arguments.of("anonymous", file("sample.csv", "text/csv"), null, 403),
                // C5-3 계약: role 없는 인증(X-User-Id 단독) — 인가는 @RequirePermission(account-mode, role-무관)
                Arguments.of("noRoleAllowed", file("sample.csv", "text/csv"), null, 200),
                Arguments.of("noRoleForbidden", file("sample.csv", "text/csv"), null, 403),
                Arguments.of("memberForbidden", file("sample.csv", "text/csv"), "MEMBER", 403),
                Arguments.of("invalidMime", file("sample.txt", "text/plain"), "MANAGER", 400),
                Arguments.of("headerMismatch", file("broken.csv", "text/csv"), "MANAGER", 422));
    }

    private static EcountMig5ImportResult result() {
        return new EcountMig5ImportResult(1, 1, 0, 0, 0, 0, 0, false, "HASH", List.of(), List.of());
    }

    private static MockMultipartFile file(String name, String contentType) {
        return new MockMultipartFile("file", name, contentType, "x".getBytes());
    }
}
