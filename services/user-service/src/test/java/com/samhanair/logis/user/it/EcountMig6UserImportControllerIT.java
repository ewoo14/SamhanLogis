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
import com.samhanair.logis.user.service.EcountEmployeeCardImporter;
import com.samhanair.logis.user.service.EcountEmployeeImporter;
import com.samhanair.logis.user.service.EcountPayrollEmployeeImporter;
import java.io.InputStream;
import java.util.List;
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

    @Autowired
    private MockMvc mockMvc;

    @MockBean private EcountEmployeeImporter employeeImporter;
    @MockBean private EcountEmployeeCardImporter employeeCardImporter;
    @MockBean private EcountPayrollEmployeeImporter payrollEmployeeImporter;
    @MockBean(classes = com.samhanair.logis.user.client.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private AuthClient authClient;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
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

        var request = multipart(url).file(file);
        if (includeUserId) {
            request.header("X-User-Id", "tester");
        }
        if (role != null) {
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

    private static Stream<Arguments> cases() {
        return endpoints().flatMap(endpoint -> Stream.of(
                Arguments.of(endpoint[0], endpoint[1], "success", file("sample.csv", "text/csv"), "MANAGER", true, 200),
                Arguments.of(endpoint[0], endpoint[1], "missingUserId", file("sample.csv", "text/csv"), "MANAGER", false, 401),
                Arguments.of(endpoint[0], endpoint[1], "anonymous", file("sample.csv", "text/csv"), null, true, 403),
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
