package com.samhanair.logis.accounting.it;

import static com.samhanair.logis.accounting.it.EcountMigPartialIdentitySupport.PARTIAL_IDENTITY_GROUPS;
import static com.samhanair.logis.accounting.it.EcountMigPartialIdentitySupport.isMissingUserIdCase;
import static com.samhanair.logis.accounting.it.EcountMigPartialIdentitySupport.isMissingUserIdSystemMasterCase;
import static com.samhanair.logis.accounting.it.EcountMigPartialIdentitySupport.suppressRoleForPartialIdentityCase;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
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
import com.samhanair.logis.accounting.service.Mig7CashDisbursementTransformService;
import com.samhanair.logis.accounting.service.Mig7CashReceiptTransformService;
import com.samhanair.logis.common.ecount.EcountMig7TransformResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** MIG-7 Cash transform controller 권한/오류 계약 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
class EcountMig7CashTransformControllerIT extends AbstractPostgresIT {


    @Autowired
    private MockMvc mockMvc;

    @MockBean private Mig7CashDisbursementTransformService disbursementService;
    @MockBean private Mig7CashReceiptTransformService receiptService;
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
    void cash_transform_endpoint_cases(String endpointLabel, String url, String label,
                                       String role, boolean includeUserId,
                                       String body, int expectedStatus) throws Exception {
        if (expectedStatus == 200) {
            stubSuccess(url);
        }
        if ("noPendingRows".equals(label)) {
            stubNoPendingRows(url);
        }
        if (expectedStatus == 403 && role != null) {
            denyRequirePermission(pageCode(url), PermissionAction.CREATE);
            denyDynamicPermissionFor(role);
        }

        var request = post(url).contentType(MediaType.APPLICATION_JSON);
        if (body != null) {
            request.content(body);
        }
        if (includeUserId) {
            request.header("X-User-Id", "00000000-0000-0000-0000-000000000115");
        } else if (isMissingUserIdSystemMasterCase(label)) {
            // C5 후속: 부분-identity 신호 = groups/isSystemMaster (role 헤더는 무시 대상).
            request.header("X-Is-System-Master", "true");
        } else if (isMissingUserIdCase(label)) {
            // C5 후속: 부분-identity 신호 = groups/isSystemMaster (role 헤더는 무시 대상).
            request.header("X-User-Groups", PARTIAL_IDENTITY_GROUPS);
        }
        if (role != null && !suppressRoleForPartialIdentityCase(label)) {
            request.header("X-User-Role", role);
        }

        var actions = mockMvc.perform(request);
        actions.andExpect(status().is(expectedStatus));
        if ("noPendingRows".equals(label)) {
            actions.andExpect(content().string(org.hamcrest.Matchers.containsString("MIG7_STAGING_ROW_NOT_FOUND")));
        }
    }

    private void stubSuccess(String url) {
        if (url.contains("cash-disbursements")) {
            when(disbursementService.transformFromStaging(anyInt(), anyString())).thenReturn(result());
        } else {
            when(receiptService.transformFromStaging(anyInt(), anyString())).thenReturn(result());
        }
    }

    private void stubNoPendingRows(String url) {
        BusinessException ex = new BusinessException(ErrorCode.MIG7_STAGING_ROW_NOT_FOUND,
                "MIG7_STAGING_ROW_NOT_FOUND");
        if (url.contains("cash-disbursements")) {
            when(disbursementService.transformFromStaging(anyInt(), anyString())).thenThrow(ex);
        } else {
            when(receiptService.transformFromStaging(anyInt(), anyString())).thenThrow(ex);
        }
    }

    private static Stream<Arguments> cases() {
        return endpoints().flatMap(endpoint -> Stream.of(
                Arguments.of(endpoint[0], endpoint[1], "success", "MANAGER", true, "{}", 200),
                // C5 후속: 부분-identity 신호 = groups/isSystemMaster (role 헤더는 무시 대상).
                Arguments.of(endpoint[0], endpoint[1], "missingUserId", "MANAGER", false, "{}", 401),
                Arguments.of(endpoint[0], endpoint[1], "missingUserIdSystemMaster", null, false, "{}", 401),
                // C5 후속: X-User-Role 단독은 부분-identity 신호가 아니므로 anonymous 계약(403).
                Arguments.of(endpoint[0], endpoint[1], "missingUserIdRoleOnly", "MANAGER", false, "{}", 403),
                Arguments.of(endpoint[0], endpoint[1], "memberForbidden", "MEMBER", true, "{}", 403),
                Arguments.of(endpoint[0], endpoint[1], "badBody", "MANAGER", true, "{", 400),
                Arguments.of(endpoint[0], endpoint[1], "noPendingRows", "MANAGER", true, "{}", 422)
        ));
    }

    private static Stream<String[]> endpoints() {
        return Stream.of(
                new String[]{"cashDisbursement", "/admin/accounting/cash-disbursements/transform-from-staging"},
                new String[]{"cashReceipt", "/admin/accounting/cash-receipts/transform-from-staging"});
    }

    private static String pageCode(String url) {
        if (url.contains("cash-disbursements")) {
            return "ecount.mig7.cash-disbursement";
        }
        return "ecount.mig7.cash-receipt";
    }


    private static EcountMig7TransformResult result() {
        return new EcountMig7TransformResult(1, 1, 0, 0, 0, List.of());
    }
}
