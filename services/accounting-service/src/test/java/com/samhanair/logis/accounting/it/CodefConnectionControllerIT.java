package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.AccountInfo;
import com.samhanair.logis.accounting.client.CardInfo;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.LoanInfo;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.client.codef.EasyCodefClient;
import com.samhanair.logis.accounting.client.codef.dto.CodefRegisterResult;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** CODEF connectedId 등록 컨트롤러 통합 테스트. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CodefConnectionControllerIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/accounting/codef/connection";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private SlipQueryClient slipQueryClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private EasyCodefClient easyCodefClient;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM codef_registered_institution");
        jdbcTemplate.update("DELETE FROM codef_connection");
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class), anyString(),
                        org.mockito.ArgumentMatchers.any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(any())).thenReturn(Map.of());
    }

    @Test
    @DisplayName("POST 기관 등록은 201을 반환하고 응답에 로그인 자격을 노출하지 않는다")
    void registerInstitution_returnsCreatedWithoutCredentials() throws Exception {
        when(easyCodefClient.registerInstitution(any()))
                .thenReturn(new CodefRegisterResult("conn-controller", "ACTIVE", "등록 완료"));

        MvcResult result = mockMvc.perform(post(BASE_URL + "/institutions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "businessType": "BANK",
                                  "organization": "0004",
                                  "loginType": "1",
                                  "credentials": {
                                    "id": "sandbox-user",
                                    "password": "never-response-secret"
                                  }
                                }
                                """)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.businessType").value("BANK"))
                .andExpect(jsonPath("$.data.organizationCode").value("0004"))
                .andExpect(jsonPath("$.data.status").value("ACTIVE"))
                .andReturn();

        assertThat(result.getResponse().getContentAsString())
                .doesNotContain("credentials")
                .doesNotContain("password")
                .doesNotContain("never-response-secret")
                .doesNotContain("conn-controller");
    }

    @Test
    @DisplayName("등록 기관과 계좌/카드/대출 목록을 200으로 조회한다")
    void listEndpoints_returnRegisteredAndFinancialLists() throws Exception {
        when(easyCodefClient.registerInstitution(any()))
                .thenReturn(new CodefRegisterResult("conn-list", "ACTIVE", "등록 완료"));
        when(easyCodefClient.listBankAccounts("conn-list"))
                .thenReturn(List.of(new AccountInfo("bank-ref", "주거래", "국민은행", "123-456")));
        when(easyCodefClient.listCards("conn-list"))
                .thenReturn(List.of(new CardInfo("card-ref", "법인카드", "국민카드", "****-1111")));
        when(easyCodefClient.listLoans("conn-list"))
                .thenReturn(List.of(new LoanInfo("loan-ref", "운전자금", "국민은행", "운전자금")));

        registerBank().andExpect(status().isCreated());

        mockMvc.perform(withActor(get(BASE_URL + "/institutions")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.institutions[0].organizationCode").value("0004"));
        mockMvc.perform(withActor(get(BASE_URL + "/accounts")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accounts[0].ref").value("bank-ref"));
        mockMvc.perform(withActor(get(BASE_URL + "/cards")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cards[0].ref").value("card-ref"));
        mockMvc.perform(withActor(get(BASE_URL + "/loans")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.loans[0].ref").value("loan-ref"));
    }

    @Test
    @DisplayName("권한 없는 등록 요청은 403으로 차단한다")
    void registerInstitution_deniedByRequirePermission() throws Exception {
        when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class),
                        org.mockito.ArgumentMatchers.eq("accounting.bank-matching"),
                        org.mockito.ArgumentMatchers.eq(PermissionAction.CREATE)))
                .thenReturn(false);

        registerBank().andExpect(status().isForbidden());
    }

    private org.springframework.test.web.servlet.ResultActions registerBank() throws Exception {
        return mockMvc.perform(post(BASE_URL + "/institutions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "businessType": "BANK",
                          "organization": "0004",
                          "loginType": "1",
                          "credentials": {
                            "id": "sandbox-user",
                            "password": "secret"
                          }
                        }
                        """)
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "MASTER"));
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder withActor(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) {
        return request
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "MASTER");
    }
}
