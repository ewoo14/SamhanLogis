package com.samhanair.logis.accounting.it;

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
import com.samhanair.logis.accounting.service.Mig10OrderEmployeeBackfillService;
import com.samhanair.logis.common.ecount.EcountMig10Result;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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

/** MIG-10 Order manager_name -> Employee cross-link controller 권한/오류 계약 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
class EcountMig10OrderEmployeeBackfillControllerIT extends AbstractPostgresIT {

    private static final String URL = "/admin/accounting/orders/backfill-employee-cross-link";

    @Autowired
    private MockMvc mockMvc;

    @MockBean private Mig10OrderEmployeeBackfillService service;
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

    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    void backfill_endpoint_cases(String label, String role, boolean includeUserId,
                                 String body, int expectedStatus) throws Exception {
        if (expectedStatus == 200) {
            when(service.backfill(anyInt(), anyString()))
                    .thenReturn(new EcountMig10Result(1, 1, 0, 0, List.of()));
        }
        if ("noRows".equals(label)) {
            when(service.backfill(anyInt(), anyString()))
                    .thenThrow(new BusinessException(ErrorCode.MIG10_ORDER_NOT_FOUND,
                            "MIG10_ORDER_NOT_FOUND"));
        }

        var request = post(URL).contentType(MediaType.APPLICATION_JSON);
        if (body != null) {
            request.content(body);
        }
        if (includeUserId) {
            request.header("X-User-Id", "tester");
        }
        if (role != null) {
            request.header("X-User-Role", role);
        }

        var actions = mockMvc.perform(request).andExpect(status().is(expectedStatus));
        if ("success".equals(label)) {
            actions.andExpect(content().string(org.hamcrest.Matchers.containsString("\"backfilled\":1")));
        }
        if ("noRows".equals(label)) {
            actions.andExpect(content().string(org.hamcrest.Matchers.containsString("MIG10_ORDER_NOT_FOUND")));
        }
    }

    private static Stream<Arguments> cases() {
        return Stream.of(
                Arguments.of("success", "MANAGER", true, "{}", 200),
                Arguments.of("missingUserId", "MANAGER", false, "{}", 401),
                Arguments.of("memberForbidden", "MEMBER", true, "{}", 403),
                Arguments.of("badBody", "MANAGER", true, "{", 400),
                Arguments.of("noRows", "MANAGER", true, "{}", 422)
        );
    }
}
