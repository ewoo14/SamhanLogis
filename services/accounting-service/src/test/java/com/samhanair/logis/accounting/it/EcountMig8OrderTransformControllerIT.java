package com.samhanair.logis.accounting.it;

import static com.samhanair.logis.accounting.it.EcountMigPartialIdentitySupport.PARTIAL_IDENTITY_GROUPS;
import static com.samhanair.logis.accounting.it.EcountMigPartialIdentitySupport.isMissingUserIdCase;
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
import com.samhanair.logis.accounting.service.Mig8OrderTransformService;
import com.samhanair.logis.common.ecount.EcountMig8TransformResult;
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

/** MIG-8 Order transform controller 권한/오류 계약 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
class EcountMig8OrderTransformControllerIT extends AbstractPostgresIT {

    private static final String URL = "/admin/accounting/orders/transform-from-staging";

    @Autowired
    private MockMvc mockMvc;

    @MockBean private Mig8OrderTransformService service;
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

    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    void order_transform_endpoint_cases(String label, String role, boolean includeUserId,
                                        String body, int expectedStatus) throws Exception {
        if (expectedStatus == 200) {
            when(service.transformFromStaging(anyInt(), anyString())).thenReturn(result());
        }
        if ("noPendingRows".equals(label)) {
            when(service.transformFromStaging(anyInt(), anyString()))
                    .thenThrow(new BusinessException(ErrorCode.MIG8_STAGING_ROW_NOT_FOUND,
                            "MIG8_STAGING_ROW_NOT_FOUND"));
        }
        if (expectedStatus == 403 && role != null) {
            denyRequirePermission("ecount.mig8.order", PermissionAction.CREATE);
            denyDynamicPermissionFor(role);
        }

        var request = post(URL).contentType(MediaType.APPLICATION_JSON);
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
        if ("noPendingRows".equals(label)) {
            actions.andExpect(content().string(org.hamcrest.Matchers.containsString("MIG8_STAGING_ROW_NOT_FOUND")));
        }
    }

    private static Stream<Arguments> cases() {
        return Stream.of(
                Arguments.of("success", "MANAGER", true, "{}", 200),
                // C5 후속: 부분-identity 신호 = groups/isSystemMaster (role 헤더는 무시 대상).
                Arguments.of("missingUserId", "MANAGER", false, "{}", 401),
                Arguments.of("memberForbidden", "MEMBER", true, "{}", 403),
                Arguments.of("badBody", "MANAGER", true, "{", 400),
                Arguments.of("noPendingRows", "MANAGER", true, "{}", 422)
        );
    }


    private static EcountMig8TransformResult result() {
        return new EcountMig8TransformResult(1, 1, 0, 0, 0, 0, List.of());
    }
}
