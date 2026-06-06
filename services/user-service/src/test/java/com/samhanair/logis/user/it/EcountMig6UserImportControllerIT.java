package com.samhanair.logis.user.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.ecount.EcountMig6ImportResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.user.UserServiceApplication;
import com.samhanair.logis.user.client.AuthClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.user.service.EcountEmployeeCardImporter;
import com.samhanair.logis.user.service.EcountEmployeeImporter;
import com.samhanair.logis.user.service.EcountPayrollEmployeeImporter;
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

/** MIG-6 user import controller multipart + 권한 가드 IT. */
@SpringBootTest(classes = UserServiceApplication.class)
@AutoConfigureMockMvc
class EcountMig6UserImportControllerIT extends AbstractPostgresIT {

    private static final String PARTIAL_IDENTITY_GROUPS = "11111111-1111-1111-1111-111111111111";

    @Autowired
    private MockMvc mockMvc;

    @MockBean private EcountEmployeeImporter employeeImporter;
    @MockBean private EcountEmployeeCardImporter employeeCardImporter;
    @MockBean private EcountPayrollEmployeeImporter payrollEmployeeImporter;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private AuthClient authClient;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
    }

    @ParameterizedTest(name = "{0} {2}")
    @MethodSource("cases")
    void user_import_endpoint_cases(String endpointLabel, String url, String label,
                                    MockMultipartFile file, String role,
                                    boolean includeUserId, int expectedStatus) throws Exception {
        if (expectedStatus == 200) {
            stubSuccess(url);
        }
        if ("headerMismatch".equals(label)) {
            stubHeaderMismatch(url);
        }
        if ("memberForbidden".equals(label) || "noRoleForbidden".equals(label)) {
            when(dynamicPermissionClient.check(
                    any(UUID.class), org.mockito.ArgumentMatchers.eq(pageCode(url)),
                    org.mockito.ArgumentMatchers.eq(PermissionAction.CREATE))).thenReturn(false);
        }

        var request = multipart(url).file(file);
        if (includeUserId) {
            request.header("X-User-Id", "10000000-0000-0000-0000-000000000006");
        } else if ("missingUserId".equals(label)) {
            // C5 후속: 부분-identity 신호 = groups/isSystemMaster (role 헤더는 무시 대상).
            request.header("X-User-Groups", PARTIAL_IDENTITY_GROUPS);
        }
        if (role != null && !"missingUserId".equals(label)) {
            request.header("X-User-Role", role);
        }

        var actions = mockMvc.perform(request);
        actions.andExpect(status().is(expectedStatus));
        if ("headerMismatch".equals(label)) {
            actions.andExpect(content().string(org.hamcrest.Matchers.containsString("MIG6_CSV_HEADER_MISMATCH")));
        }
    }

    private void stubSuccess(String url) throws Exception {
        if (url.contains("employee-cards")) {
            when(employeeCardImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());
        } else if (url.contains("payroll-employees")) {
            when(payrollEmployeeImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());
        } else {
            when(employeeImporter.importCsv(any(InputStream.class), anyString())).thenReturn(result());
        }
    }

    private void stubHeaderMismatch(String url) throws Exception {
        BusinessException ex = new BusinessException(ErrorCode.MIG6_CSV_HEADER_MISMATCH,
                "MIG6_CSV_HEADER_MISMATCH");
        if (url.contains("employee-cards")) {
            when(employeeCardImporter.importCsv(any(InputStream.class), anyString())).thenThrow(ex);
        } else if (url.contains("payroll-employees")) {
            when(payrollEmployeeImporter.importCsv(any(InputStream.class), anyString())).thenThrow(ex);
        } else {
            when(employeeImporter.importCsv(any(InputStream.class), anyString())).thenThrow(ex);
        }
    }

    private String pageCode(String url) {
        if (url.contains("employee-cards")) {
            return "ecount.mig6.employee-card";
        }
        if (url.contains("payroll-employees")) {
            return "ecount.mig6.payroll-employee";
        }
        return "ecount.mig6.employee";
    }

    private static Stream<Arguments> cases() {
        return endpoints().flatMap(endpoint -> Stream.of(
                Arguments.of(endpoint[0], endpoint[1], "success", file("sample.csv", "text/csv"), "MANAGER", true, 200),
                // C5 후속: 부분-identity 신호 = groups/isSystemMaster (role 헤더는 무시 대상).
                Arguments.of(endpoint[0], endpoint[1], "missingUserId", file("sample.csv", "text/csv"), "MANAGER", false, 401),
                // C5-3: 진짜 anonymous = 헤더 전무 (구 "anonymous"=userId+role없음 은 이제 정당한 인증 형태)
                Arguments.of(endpoint[0], endpoint[1], "anonymous", file("sample.csv", "text/csv"), null, false, 403),
                // C5-3 계약: role 헤더 없는 인증(X-User-Id 단독) — 인가는 @RequirePermission(account-mode, role-무관)이 담당
                Arguments.of(endpoint[0], endpoint[1], "noRoleAllowed", file("sample.csv", "text/csv"), null, true, 200),
                Arguments.of(endpoint[0], endpoint[1], "noRoleForbidden", file("sample.csv", "text/csv"), null, true, 403),
                Arguments.of(endpoint[0], endpoint[1], "memberForbidden", file("sample.csv", "text/csv"), "MEMBER", true, 403),
                Arguments.of(endpoint[0], endpoint[1], "invalidMime", file("sample.txt", "text/plain"), "MANAGER", true, 400),
                Arguments.of(endpoint[0], endpoint[1], "headerMismatch", file("broken.csv", "text/csv"), "MANAGER", true, 422)
        ));
    }

    private static Stream<String[]> endpoints() {
        return Stream.of(
                new String[]{"employee", "/admin/user/employees/imports/ecount"},
                new String[]{"employeeCard", "/admin/user/employee-cards/imports/ecount"},
                new String[]{"payrollEmployee", "/admin/user/payroll-employees/imports/ecount"});
    }

    private static EcountMig6ImportResult result() {
        return new EcountMig6ImportResult(1, 1, 0, 0, 0, "HASH", List.of());
    }

    private static MockMultipartFile file(String name, String contentType) {
        return new MockMultipartFile("file", name, contentType, "x".getBytes());
    }
}
