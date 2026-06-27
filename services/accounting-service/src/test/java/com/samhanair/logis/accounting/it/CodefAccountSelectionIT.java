package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.util.Map;
import java.util.Optional;
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

/** BC3 CODEF 계좌·카드·대출 목록, 사용자별 선택 저장, scoped import 통합 테스트. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CodefAccountSelectionIT extends AbstractPostgresIT {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final String CONNECTED_ID = "connected-bc3";
    private static final String ACCOUNT_REF_1 = "국민 123456-78-901234";
    private static final String ACCOUNT_REF_2 = "신한 987654-32-109876";
    private static final String CARD_REF_1 = "삼한 법인카드 1111";
    private static final String LOAN_REF_1 = "기업운전자금대출-001";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private SlipQueryClient slipQueryClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean(classes = DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM bank_transaction");
        jdbcTemplate.update("DELETE FROM user_codef_import_scope");
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(any())).thenReturn(Map.of());
        lenient().when(partnerLookupClient.findByPartnerCode(anyString())).thenReturn(Optional.empty());
    }

    @Test
    @DisplayName("DRY_RUN 목록은 결정적이며 사용자 노출명에 기술 라벨을 포함하지 않는다")
    void listDryRunAccountsCardsLoans_areDeterministicAndNoTechnicalLabel() throws Exception {
        mockMvc.perform(auth(get("/accounting/codef/bank-accounts")
                        .param("connectedId", CONNECTED_ID)
                        .param("submitMethod", "DRY_RUN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accounts.length()").value(4))
                .andExpect(jsonPath("$.data.accounts[0].ref").value(ACCOUNT_REF_1))
                .andExpect(jsonPath("$.data.accounts[0].name").value("국민 주거래 계좌"))
                .andExpect(jsonPath("$.data.accounts[0].name").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("CODEF"))));

        mockMvc.perform(auth(get("/accounting/codef/bank-accounts")
                        .param("connectedId", CONNECTED_ID)
                        .param("submitMethod", "DRY_RUN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accounts[0].ref").value(ACCOUNT_REF_1))
                .andExpect(jsonPath("$.data.accounts[3].ref").value("하나 555555-66-777777"));

        mockMvc.perform(auth(get("/accounting/codef/cards")
                        .param("connectedId", CONNECTED_ID)
                        .param("submitMethod", "DRY_RUN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cards.length()").value(3))
                .andExpect(jsonPath("$.data.cards[0].ref").value(CARD_REF_1));

        mockMvc.perform(auth(get("/accounting/codef/loans")
                        .param("connectedId", CONNECTED_ID)
                        .param("submitMethod", "DRY_RUN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.loans.length()").value(2))
                .andExpect(jsonPath("$.data.loans[0].ref").value(LOAN_REF_1));
    }

    @Test
    @DisplayName("사용자별 선택 scope 는 userId+connectedId active row 하나로 멱등 upsert 된다")
    void upsertScope_isIdempotentPerUserAndConnectedId() throws Exception {
        saveScope("""
                {
                  "connectedId": "%s",
                  "accountRefs": ["%s"],
                  "cardRefs": ["%s"],
                  "loanRefs": [],
                  "defaultImportType": "ALL"
                }
                """.formatted(CONNECTED_ID, ACCOUNT_REF_1, CARD_REF_1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.connectedId").value(CONNECTED_ID))
                .andExpect(jsonPath("$.data.accountRefs[0]").value(ACCOUNT_REF_1))
                .andExpect(jsonPath("$.data.defaultImportType").value("ALL"));

        saveScope("""
                {
                  "connectedId": "%s",
                  "accountRefs": ["%s", "%s"],
                  "cardRefs": [],
                  "loanRefs": ["%s"],
                  "defaultImportType": "BANK"
                }
                """.formatted(CONNECTED_ID, ACCOUNT_REF_1, ACCOUNT_REF_2, LOAN_REF_1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accountRefs.length()").value(2))
                .andExpect(jsonPath("$.data.cardRefs.length()").value(0))
                .andExpect(jsonPath("$.data.loanRefs[0]").value(LOAN_REF_1))
                .andExpect(jsonPath("$.data.defaultImportType").value("BANK"));

        mockMvc.perform(auth(get("/accounting/codef/scopes")
                        .param("connectedId", CONNECTED_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accountRefs.length()").value(2))
                .andExpect(jsonPath("$.data.defaultImportType").value("BANK"));

        Integer activeCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM user_codef_import_scope
                 WHERE user_id = ?::uuid
                   AND connected_id = ?
                   AND is_deleted = false
                """, Integer.class, USER_ID.toString(), CONNECTED_ID);
        assertThat(activeCount).isEqualTo(1);
    }

    @Test
    @DisplayName("scoped import 는 지정 다중 ref 만 조회하고 4-key 기준 멱등 적재한다")
    void importScopedWithExplicitRefs_importsSelectedRefsOnlyAndIdempotent() throws Exception {
        importScoped("""
                {
                  "connectedId": "%s",
                  "from": "2026-06-01",
                  "to": "2026-06-03",
                  "type": "ALL",
                  "accountRefs": ["%s", "%s"],
                  "cardRefs": ["%s"],
                  "loanRefs": [],
                  "submitMethod": "DRY_RUN"
                }
                """.formatted(CONNECTED_ID, ACCOUNT_REF_1, ACCOUNT_REF_2, CARD_REF_1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("거래내역 가져오기가 완료되었습니다."))
                .andExpect(jsonPath("$.data.fetchedCount").value(15))
                .andExpect(jsonPath("$.data.importedCount").value(15))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(0));

        importScoped("""
                {
                  "connectedId": "%s",
                  "from": "2026-06-01",
                  "to": "2026-06-03",
                  "type": "ALL",
                  "accountRefs": ["%s", "%s"],
                  "cardRefs": ["%s"],
                  "loanRefs": [],
                  "submitMethod": "DRY_RUN"
                }
                """.formatted(CONNECTED_ID, ACCOUNT_REF_1, ACCOUNT_REF_2, CARD_REF_1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(15))
                .andExpect(jsonPath("$.data.importedCount").value(0))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(15));
    }

    @Test
    @DisplayName("type=ALL 이고 ref 배열이 null 이면 서버 목록 전체를 열거해 가져온다")
    void importScopedAllWithNullRefs_importsAllListedRefs() throws Exception {
        importScoped("""
                {
                  "connectedId": "%s",
                  "from": "2026-06-01",
                  "to": "2026-06-03",
                  "type": "ALL",
                  "submitMethod": "DRY_RUN"
                }
                """.formatted(CONNECTED_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(45))
                .andExpect(jsonPath("$.data.importedCount").value(45));
    }

    @Test
    @DisplayName("scoped import 전송 방식 오류는 내부 enum 값을 노출하지 않는다")
    void importScopedRejectsInvalidSubmitMethodWithoutTechnicalValues() throws Exception {
        importScoped("""
                {
                  "connectedId": "%s",
                  "from": "2026-06-01",
                  "to": "2026-06-03",
                  "type": "BANK",
                  "accountRefs": ["%s"],
                  "submitMethod": "INVALID"
                }
                """.formatted(CONNECTED_ID, ACCOUNT_REF_1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("submitMethod: 전송 방식 값이 올바르지 않습니다"));
    }

    @Test
    @DisplayName("type=ALL 이고 ref 배열이 빈 배열이면 저장된 선택을 로드해 가져온다")
    void importScopedAllWithEmptyRefs_loadsSavedSelections() throws Exception {
        saveScope("""
                {
                  "connectedId": "%s",
                  "accountRefs": ["%s"],
                  "cardRefs": ["%s"],
                  "loanRefs": ["%s"],
                  "defaultImportType": "ALL"
                }
                """.formatted(CONNECTED_ID, ACCOUNT_REF_1, CARD_REF_1, LOAN_REF_1))
                .andExpect(status().isOk());

        importScoped("""
                {
                  "connectedId": "%s",
                  "from": "2026-06-01",
                  "to": "2026-06-03",
                  "type": "ALL",
                  "accountRefs": [],
                  "cardRefs": [],
                  "loanRefs": [],
                  "submitMethod": "DRY_RUN"
                }
                """.formatted(CONNECTED_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(15))
                .andExpect(jsonPath("$.data.importedCount").value(15));
    }

    @Test
    @DisplayName("type=ALL 이고 빈 저장 선택을 로드하면 명확한 400 메시지를 반환한다")
    void importScopedAllWithEmptyRefsAndEmptySavedScope_returnsClearMessage() throws Exception {
        saveScope("""
                {
                  "connectedId": "%s",
                  "accountRefs": [],
                  "cardRefs": [],
                  "loanRefs": [],
                  "defaultImportType": "ALL"
                }
                """.formatted(CONNECTED_ID))
                .andExpect(status().isOk());

        importScoped("""
                {
                  "connectedId": "%s",
                  "from": "2026-06-01",
                  "to": "2026-06-03",
                  "type": "ALL",
                  "accountRefs": [],
                  "cardRefs": [],
                  "loanRefs": [],
                  "submitMethod": "DRY_RUN"
                }
                """.formatted(CONNECTED_ID))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value(
                        "저장된 가져오기 선택이 비어 있습니다. 먼저 계좌/카드/대출을 선택해 저장하세요."));
    }

    @Test
    @DisplayName("type=ALL 이고 저장 scope row 가 없으면 404 NOT_FOUND 로 구분한다")
    void importScopedAllWithEmptyRefsAndMissingSavedScope_returnsNotFound() throws Exception {
        importScoped("""
                {
                  "connectedId": "%s",
                  "from": "2026-06-01",
                  "to": "2026-06-03",
                  "type": "ALL",
                  "accountRefs": [],
                  "cardRefs": [],
                  "loanRefs": [],
                  "submitMethod": "DRY_RUN"
                }
                """.formatted(CONNECTED_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("저장된 가져오기 선택이 없습니다."));
    }

    @Test
    @DisplayName("scope 저장 defaultImportType 누락은 400 INVALID_INPUT")
    void upsertScopeRejectsMissingDefaultImportType() throws Exception {
        saveScope("""
                {
                  "connectedId": "%s",
                  "accountRefs": [],
                  "cardRefs": [],
                  "loanRefs": []
                }
                """.formatted(CONNECTED_ID))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(
                        "기본 가져오기 구분은 필수입니다")));
    }

    @Test
    @DisplayName("목록 조회 connectedId blank 는 400 INVALID_INPUT")
    void listEndpointsRejectBlankConnectedId() throws Exception {
        for (String path : new String[]{
                "/accounting/codef/bank-accounts",
                "/accounting/codef/cards",
                "/accounting/codef/loans",
                "/accounting/codef/scopes"
        }) {
            mockMvc.perform(auth(get(path)
                            .param("connectedId", "   ")
                            .param("submitMethod", "DRY_RUN")))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                    .andExpect(jsonPath("$.message").value("connectedId 는 필수입니다"));
        }
    }

    @Test
    @DisplayName("기존 BC2 /accounting/codef/import 단일 ref 계약은 유지된다")
    void legacyImportEndpointStillWorks() throws Exception {
        mockMvc.perform(auth(post("/accounting/codef/import")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "from": "2026-06-01",
                                  "to": "2026-06-03",
                                  "type": "BANK",
                                  "accountRef": "%s",
                                  "submitMethod": "DRY_RUN"
                                }
                                """.formatted(ACCOUNT_REF_1))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(5))
                .andExpect(jsonPath("$.data.importedCount").value(5));
    }

    @Test
    @DisplayName("인증 헤더 없는 scope 조회는 401")
    void scopeRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/accounting/codef/scopes")
                        .param("connectedId", CONNECTED_ID))
                .andExpect(status().isUnauthorized());
    }

    private org.springframework.test.web.servlet.ResultActions saveScope(String body) throws Exception {
        return mockMvc.perform(auth(put("/accounting/codef/scopes")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)));
    }

    private org.springframework.test.web.servlet.ResultActions importScoped(String body) throws Exception {
        return mockMvc.perform(auth(post("/accounting/codef/import-scoped")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)));
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder auth(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder) {
        return builder
                .header("X-User-Id", USER_ID.toString())
                .header("X-User-Role", "ACCOUNTANT");
    }
}
