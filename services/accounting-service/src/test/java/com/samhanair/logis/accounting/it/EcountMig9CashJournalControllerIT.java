package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.service.Mig9AgingSnapshotRefreshService;
import com.samhanair.logis.accounting.service.Mig9CashJournalService;
import com.samhanair.logis.common.ecount.EcountMig9JournalResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** MIG-9 Cash -> Journal controller 권한/오류 계약 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
class EcountMig9CashJournalControllerIT extends AbstractPostgresIT {

    private static final String PARTIAL_IDENTITY_GROUPS = "11111111-1111-1111-1111-111111111111";

    @Autowired
    private MockMvc mockMvc;

    @MockBean private Mig9CashJournalService cashJournalService;
    @MockBean private Mig9AgingSnapshotRefreshService agingSnapshotRefreshService;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(partnerLookupClient.findByPartnerId(org.mockito.ArgumentMatchers.any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode(org.mockito.ArgumentMatchers.any())).thenReturn(Optional.empty());
    }

    @ParameterizedTest(name = "{0} {1}")
    @MethodSource("cases")
    void cash_journal_endpoint_cases(String label, String url, String role, boolean includeUserId,
                                     String body, int expectedStatus) throws Exception {
        if (expectedStatus == 200) {
            whenSuccess(url);
        }
        if ("noRows".equals(label)) {
            whenNoRows(url);
        }
        if ("refreshFailed".equals(label)) {
            whenRefreshFailed();
        }
        if (expectedStatus == 403 && role != null) {
            denyRequirePermission(pageCode(url), action(url));
            denyDynamicPermissionFor(role);
        }

        var request = post(url).contentType(MediaType.APPLICATION_JSON);
        if (body != null) {
            request.content(body);
        }
        if (includeUserId) {
            request.header("X-User-Id", "00000000-0000-0000-0000-000000000115");
        } else if (isMissingUserIdCase(label)) {
            // C5 후속: 부분-identity 신호 = groups/isSystemMaster (role 헤더는 무시 대상).
            request.header("X-User-Groups", PARTIAL_IDENTITY_GROUPS);
        }
        if (role != null && !isMissingUserIdCase(label)) {
            request.header("X-User-Role", role);
        }

        var actions = mockMvc.perform(request);
        actions.andExpect(status().is(expectedStatus));
        if ("noRows".equals(label)) {
            actions.andExpect(content().string(org.hamcrest.Matchers.containsString("MIG9_CASH_ROW_NOT_FOUND")));
        }
        if ("refreshSuccess".equals(label)) {
            actions.andExpect(content().string(org.hamcrest.Matchers.containsString("\"status\":\"REFRESHED\"")))
                    .andExpect(content().string(org.hamcrest.Matchers.containsString("\"refreshedAt\"")));
        }
        if ("refreshFailed".equals(label)) {
            actions.andExpect(content().string(org.hamcrest.Matchers.containsString("MIG9_AGING_REFRESH_FAILED")));
        }
    }

    @Test
    @DisplayName("MIG-14 AgingSnapshot refresh는 canEdit=false + canView=true이면 403")
    void refreshAgingSnapshot_viewOnlyDynamicPermissionDenied() throws Exception {
        denyRequirePermission("ecount.mig14.aging-snapshot", PermissionAction.UPDATE);
        when(dynamicPermissionClient.canEdit("MANAGER", "ecount.mig14.aging-snapshot"))
                .thenReturn(false);
        when(dynamicPermissionClient.canView("MANAGER", "ecount.mig14.aging-snapshot"))
                .thenReturn(true);

        mockMvc.perform(post("/admin/accounting/aging-snapshot/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000115")
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isForbidden());
    }

    private static Stream<Arguments> cases() {
        return Stream.of(
                endpointCases("/admin/accounting/cash-journals/generate-from-disbursements"),
                endpointCases("/admin/accounting/cash-journals/generate-from-receipts"),
                refreshEndpointCases()
        ).flatMap(s -> s);
    }

    private static Stream<Arguments> endpointCases(String url) {
        return Stream.of(
                Arguments.of("success", url, "MANAGER", true, "{}", 200),
                // C5 후속: 부분-identity 신호 = groups/isSystemMaster (role 헤더는 무시 대상).
                Arguments.of("missingUserId", url, "MANAGER", false, "{}", 401),
                Arguments.of("memberForbidden", url, "MEMBER", true, "{}", 403),
                Arguments.of("badBody", url, "MANAGER", true, "{", 400),
                Arguments.of("noRows", url, "MANAGER", true, "{}", 422)
        );
    }

    private static Stream<Arguments> refreshEndpointCases() {
        String url = "/admin/accounting/aging-snapshot/refresh";
        return Stream.of(
                Arguments.of("refreshSuccess", url, "MANAGER", true, "{}", 200),
                // C5 후속: 부분-identity 신호 = groups/isSystemMaster (role 헤더는 무시 대상).
                Arguments.of("refreshMissingUserId", url, "MANAGER", false, "{}", 401),
                Arguments.of("refreshMemberForbidden", url, "MEMBER", true, "{}", 403),
                Arguments.of("refreshBadBody", url, "MANAGER", true, "{", 400),
                Arguments.of("refreshFailed", url, "MANAGER", true, "{}", 422)
        );
    }

    private static String pageCode(String url) {
        if (url.endsWith("disbursements")) {
            return "ecount.mig9.cash-journal.disbursement";
        }
        if (url.endsWith("receipts")) {
            return "ecount.mig9.cash-journal.receipt";
        }
        return "ecount.mig14.aging-snapshot";
    }

    private static PermissionAction action(String url) {
        if (url.endsWith("aging-snapshot/refresh")) {
            return PermissionAction.UPDATE;
        }
        return PermissionAction.CREATE;
    }

    private static boolean isMissingUserIdCase(String label) {
        return label.contains("missingUserId") || label.contains("MissingUserId");
    }

    private void whenSuccess(String url) {
        if (url.endsWith("aging-snapshot/refresh")) {
            return;
        } else if (url.endsWith("disbursements")) {
            when(cashJournalService.generateFromDisbursements(anyInt(), anyString())).thenReturn(result());
        } else {
            when(cashJournalService.generateFromReceipts(anyInt(), anyString())).thenReturn(result());
        }
    }

    private void whenNoRows(String url) {
        BusinessException ex = new BusinessException(ErrorCode.MIG9_CASH_ROW_NOT_FOUND,
                "MIG9_CASH_ROW_NOT_FOUND");
        if (url.endsWith("disbursements")) {
            when(cashJournalService.generateFromDisbursements(anyInt(), anyString())).thenThrow(ex);
        } else {
            when(cashJournalService.generateFromReceipts(anyInt(), anyString())).thenThrow(ex);
        }
    }

    private void whenRefreshFailed() {
        doThrow(new BusinessException(ErrorCode.MIG9_AGING_REFRESH_FAILED,
                "MIG9_AGING_REFRESH_FAILED"))
                .when(agingSnapshotRefreshService).refresh();
    }

    private static EcountMig9JournalResult result() {
        return new EcountMig9JournalResult(1, 1, 0, 0, 0, List.of());
    }
}
