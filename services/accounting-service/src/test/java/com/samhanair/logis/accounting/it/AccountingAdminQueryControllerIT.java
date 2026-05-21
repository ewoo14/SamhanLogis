package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.service.AccountingAdminQueryService;
import com.samhanair.logis.accounting.web.dto.CashDisbursementResponse;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.util.UUID;
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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** MIG-14 admin 조회 컨트롤러의 정적 role + 동적 VIEW PageCode 시행 계약. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
class AccountingAdminQueryControllerIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";

    @Autowired private MockMvc mockMvc;

    @MockBean private AccountingAdminQueryService adminQueryService;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @SuppressWarnings("removal")
    @MockBean(classes = com.samhanair.logis.accounting.client.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(adminQueryService.listCashDisbursements(
                        org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(Pageable.class)))
                .thenReturn(Page.<CashDisbursementResponse>empty());
        lenient().when(adminQueryService.listAgingSnapshot(
                        org.mockito.ArgumentMatchers.any(Pageable.class),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any()))
                .thenReturn(Page.empty());
    }

    @Test
    @DisplayName("MIG-14 Cash 조회는 partnerName 필터를 서비스로 전달한다")
    void cashListPassesPartnerNameFilterToService() throws Exception {
        mockMvc.perform(withActor(get("/api/v1/accounting/cash-disbursements")
                        .param("partnerName", "삼한상사"), "MANAGER"))
                .andExpect(status().isOk());

        verify(adminQueryService).listCashDisbursements(
                isNull(), isNull(), isNull(), isNull(), eq("삼한상사"),
                org.mockito.ArgumentMatchers.any(Pageable.class));
    }

    @Test
    @DisplayName("MIG-14 ACCOUNTANT는 정적 role을 통과하고 CASH_LIST VIEW 권한으로 조회한다")
    void accountantCanViewCashList() throws Exception {
        when(dynamicPermissionClient.canView(eq("ACCOUNTANT"), eq("ecount.mig14.cash-list")))
                .thenReturn(true);

        mockMvc.perform(withActor(get("/api/v1/accounting/cash-disbursements"), "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("MIG-16 AgingSnapshot 조회 size는 최대 500으로 clamp 한다")
    void agingSnapshotPageSizeIsClampedToFiveHundred() throws Exception {
        mockMvc.perform(withActor(get("/api/v1/accounting/aging-snapshot")
                        .param("page", "1")
                        .param("size", "700"), "MANAGER"))
                .andExpect(status().isOk());

        org.mockito.ArgumentCaptor<Pageable> pageableCaptor =
                org.mockito.ArgumentCaptor.forClass(Pageable.class);
        verify(adminQueryService).listAgingSnapshot(
                pageableCaptor.capture(),
                isNull(),
                isNull());
        org.assertj.core.api.Assertions.assertThat(pageableCaptor.getValue().getPageNumber()).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(500);
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @MethodSource("mig14ViewEndpoints")
    @DisplayName("MIG-14 canView=false이면 PageCode별 조회를 403으로 차단한다")
    void canViewFalseDenied(String url, String pageCode) throws Exception {
        when(dynamicPermissionClient.canView(eq("MANAGER"), eq(pageCode))).thenReturn(false);

        mockMvc.perform(withActor(get(url), "MANAGER"))
                .andExpect(status().isForbidden());
    }

    private static Stream<Arguments> mig14ViewEndpoints() {
        return Stream.of(
                Arguments.of("/api/v1/accounting/cash-disbursements", "ecount.mig14.cash-list"),
                Arguments.of("/api/v1/accounting/cash-receipts", "ecount.mig14.cash-list"),
                Arguments.of("/api/v1/accounting/orders", "ecount.mig14.order-list"),
                Arguments.of("/api/v1/accounting/orders/ORD-001", "ecount.mig14.order-list"),
                Arguments.of("/api/v1/accounting/aging-snapshot", "ecount.mig14.aging-snapshot"),
                Arguments.of("/api/v1/accounting/ledger/sales", "ecount.mig14.ledger"),
                Arguments.of("/api/v1/accounting/ledger/purchase", "ecount.mig14.ledger")
        );
    }

    private static MockHttpServletRequestBuilder withActor(
            MockHttpServletRequestBuilder request,
            String role) {
        return request
                .header(USER_ID_HEADER, UUID.randomUUID().toString())
                .header(ROLE_HEADER, role);
    }
}
