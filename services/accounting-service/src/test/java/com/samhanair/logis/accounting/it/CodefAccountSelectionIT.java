package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
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
import com.samhanair.logis.accounting.domain.UserCodefImportScope;
import com.samhanair.logis.accounting.repository.UserCodefImportScopeRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import jakarta.persistence.EntityManager;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.DefaultTransactionDefinition;

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
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private EntityManager entityManager;
    @Autowired private ObjectMapper objectMapper;

    @SpyBean private UserCodefImportScopeRepository userCodefImportScopeRepository;

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
    @DisplayName("동시 scope 저장은 active unique 충돌 없이 둘 다 200 으로 멱등 처리된다")
    void upsertScopeConcurrentRequests_areBothOkAndKeepSingleActiveRow() throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<Integer> first = executor.submit(() -> putScopeAfterStart(start, """
                    {
                      "connectedId": "%s",
                      "accountRefs": ["%s"],
                      "cardRefs": [],
                      "loanRefs": [],
                      "defaultImportType": "BANK"
                    }
                    """.formatted(CONNECTED_ID, ACCOUNT_REF_1)));
            Future<Integer> second = executor.submit(() -> putScopeAfterStart(start, """
                    {
                      "connectedId": "%s",
                      "accountRefs": ["%s"],
                      "cardRefs": ["%s"],
                      "loanRefs": [],
                      "defaultImportType": "CARD"
                    }
                    """.formatted(CONNECTED_ID, ACCOUNT_REF_2, CARD_REF_1)));

            start.countDown();

            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 200);
        } finally {
            executor.shutdownNow();
        }

        Integer activeCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM user_codef_import_scope
                 WHERE user_id = ?::uuid
                   AND connected_id = ?
                   AND is_deleted = false
                """, Integer.class, USER_ID.toString(), CONNECTED_ID);
        assertThat(activeCount).isEqualTo(1);
    }

    @Test
    @DisplayName("scope 저장 중 unique 충돌이 발생하면 재조회 후 update 로 200 응답한다")
    void upsertScopeRecoversFromUniqueConflictByReloadingAndUpdating() throws Exception {
        DefaultTransactionDefinition definition = new DefaultTransactionDefinition();
        definition.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        TransactionStatus blocker = transactionManager.getTransaction(definition);
        jdbcTemplate.update("""
                INSERT INTO user_codef_import_scope
                    (user_id, connected_id, account_ref_selections, card_ref_selections,
                     loan_ref_selections, default_import_type)
                VALUES (?::uuid, ?, '["기존 계좌"]', '[]', '[]', 'BANK')
        """, USER_ID.toString(), CONNECTED_ID);

        ExecutorService executor = Executors.newSingleThreadExecutor();
        CountDownLatch requestStarted = new CountDownLatch(1);
        CountDownLatch saveAttempted = new CountDownLatch(1);
        doAnswer(invocation -> {
            saveAttempted.countDown();
            UserCodefImportScope merged = entityManager.merge(invocation.getArgument(0));
            entityManager.flush();
            return merged;
        }).when(userCodefImportScopeRepository).saveAndFlush(any());
        Future<MvcResult> result = executor.submit(() -> {
            requestStarted.countDown();
            return saveScope("""
                        {
                          "connectedId": "%s",
                          "accountRefs": ["%s"],
                          "cardRefs": ["%s"],
                          "loanRefs": ["%s"],
                          "defaultImportType": "ALL"
                        }
                        """.formatted(CONNECTED_ID, ACCOUNT_REF_1, CARD_REF_1, LOAN_REF_1))
                    .andReturn();
        });
        try {
            assertThat(requestStarted.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(saveAttempted.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(result.isDone()).isFalse();
            transactionManager.commit(blocker);
            blocker = null;

            MvcResult response = result.get(10, TimeUnit.SECONDS);
            assertThat(response.getResponse().getStatus()).isEqualTo(200);
            assertThat(response.getResponse().getContentAsString(StandardCharsets.UTF_8))
                    .contains(ACCOUNT_REF_1, CARD_REF_1, LOAN_REF_1, "\"defaultImportType\":\"ALL\"");
        } finally {
            if (blocker != null && !blocker.isCompleted()) {
                transactionManager.rollback(blocker);
            }
            executor.shutdownNow();
        }

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
                .andExpect(jsonPath("$.message").value("전송 방식 값이 올바르지 않습니다"));
    }

    @Test
    @DisplayName("scoped import 필수 연결 식별자 오류는 영어 필드명을 노출하지 않는다")
    void importScopedRejectsBlankConnectedIdWithKoreanMessage() throws Exception {
        importScoped("""
                {
                  "connectedId": "   ",
                  "from": "2026-06-01",
                  "to": "2026-06-03",
                  "type": "BANK",
                  "accountRefs": ["%s"],
                  "submitMethod": "DRY_RUN"
                }
                """.formatted(ACCOUNT_REF_1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("연결 식별자는 필수입니다"));
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
                .andExpect(jsonPath("$.message").value(
                        "저장된 가져오기 선택이 없습니다. 먼저 가져오기 선택을 저장하세요."));
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
                    .andExpect(jsonPath("$.message").value("연결 식별자는 필수입니다"));
        }
    }

    @Test
    @DisplayName("목록 조회 connectedId 누락은 한국어 400 INVALID_INPUT")
    void listEndpointsRejectMissingConnectedIdWithKoreanMessage() throws Exception {
        for (String path : new String[]{
                "/accounting/codef/bank-accounts",
                "/accounting/codef/cards",
                "/accounting/codef/loans",
                "/accounting/codef/scopes"
        }) {
            mockMvc.perform(auth(get(path)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                    .andExpect(jsonPath("$.message").value("필수 요청 파라미터가 누락되었습니다."));
        }
    }

    @Test
    @DisplayName("목록 조회 전송 방식 오류는 import 요청과 같은 메시지로 400 INVALID_INPUT")
    void listEndpointsRejectInvalidSubmitMethod() throws Exception {
        for (String path : new String[]{
                "/accounting/codef/bank-accounts",
                "/accounting/codef/cards",
                "/accounting/codef/loans"
        }) {
            mockMvc.perform(auth(get(path)
                            .param("connectedId", CONNECTED_ID)
                            .param("submitMethod", "INVALID")))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                    .andExpect(jsonPath("$.message").value("전송 방식 값이 올바르지 않습니다"));
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
        MvcResult result = mockMvc.perform(get("/accounting/codef/scopes")
                        .param("connectedId", CONNECTED_ID))
                .andExpect(status().isUnauthorized())
                .andReturn();

        assertUnauthorizedEnvelope(result);
    }

    @Test
    @DisplayName("인증 헤더 형식 이상은 기술명 없이 401")
    void scopeRejectsMalformedAuthenticationWithoutTechnicalNames() throws Exception {
        MvcResult result = mockMvc.perform(get("/accounting/codef/scopes")
                        .param("connectedId", CONNECTED_ID)
                        .header("X-User-Id", "not-a-user-id")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.message").value("인증 정보가 올바르지 않습니다"))
                .andReturn();

        assertUnauthorizedEnvelope(result);
    }

    @Test
    @DisplayName("OpenAPI는 gateway 헤더와 submitMethod 기술 선택자를 숨긴다")
    void openApiHidesGatewayHeadersAndSubmitMethodSelector() throws Exception {
        MvcResult result = mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode root = objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertOperationHasNoParameter(root, "/accounting/codef/bank-accounts", "get", "submitMethod");
        assertOperationHasNoParameter(root, "/accounting/codef/cards", "get", "submitMethod");
        assertOperationHasNoParameter(root, "/accounting/codef/loans", "get", "submitMethod");
        assertOperationHasNoParameter(root, "/accounting/codef/import-scoped", "post", "X-User-Id");
        assertOperationHasNoParameter(root, "/accounting/codef/scopes", "put", "X-User-Id");
        assertOperationHasNoParameter(root, "/accounting/codef/scopes", "get", "X-User-Id");

        assertThat(root.at("/components/schemas/CodefImportRequest/properties").has("submitMethod")).isFalse();
        assertThat(root.at("/components/schemas/CodefImportScopedRequest/properties").has("submitMethod")).isFalse();
        assertThat(root.at("/components/schemas/CodefImportRequest").toString()).doesNotContain("DRY_RUN", "CODEF");
        assertThat(root.at("/components/schemas/CodefImportScopedRequest").toString()).doesNotContain("DRY_RUN", "CODEF");
    }

    @Test
    @DisplayName("scoped import 기간 역순은 표준 envelope 로 422")
    void importScopedRejectsReversedDateRange() throws Exception {
        importScoped("""
                {
                  "connectedId": "%s",
                  "from": "2026-06-03",
                  "to": "2026-06-01",
                  "type": "BANK",
                  "accountRefs": ["%s"],
                  "submitMethod": "DRY_RUN"
                }
                """.formatted(CONNECTED_ID, ACCOUNT_REF_1))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("DEPOSIT_DATE_RANGE_INVALID"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    @DisplayName("scoped import 명시 ref 과다는 400")
    void importScopedRejectsExcessiveExplicitRefs() throws Exception {
        importScoped("""
                {
                  "connectedId": "%s",
                  "from": "2026-06-01",
                  "to": "2026-06-03",
                  "type": "BANK",
                  "accountRefs": [%s],
                  "submitMethod": "DRY_RUN"
                }
                """.formatted(CONNECTED_ID, quotedRefs("ACC-", 51)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("가져오기 선택 항목은 최대 50개까지 허용됩니다."))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    @DisplayName("scoped import 미래 날짜는 400 envelope")
    void importScopedRejectsFutureDateWithEnvelope() throws Exception {
        LocalDate future = LocalDate.now().plusDays(1);
        importScoped("""
                {
                  "connectedId": "%s",
                  "from": "%s",
                  "to": "%s",
                  "type": "BANK",
                  "accountRefs": ["%s"],
                  "submitMethod": "DRY_RUN"
                }
                """.formatted(CONNECTED_ID, future, future, ACCOUNT_REF_1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.timestamp").exists());
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

    private Integer putScopeAfterStart(CountDownLatch start, String body) throws Exception {
        assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
        MvcResult result = saveScope(body).andReturn();
        return result.getResponse().getStatus();
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder auth(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder) {
        return builder
                .header("X-User-Id", USER_ID.toString())
                .header("X-User-Role", "ACCOUNTANT");
    }

    private void assertUnauthorizedEnvelope(MvcResult result) throws Exception {
        JsonNode root = objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(root.path("success").asBoolean()).isFalse();
        assertThat(root.path("code").asText()).isEqualTo("UNAUTHORIZED");
        assertThat(root.has("data")).isTrue();
        assertThat(root.path("data").isNull()).isTrue();
        assertThat(root.path("timestamp").asText()).isNotBlank();
    }

    private static void assertOperationHasNoParameter(JsonNode root, String path, String method, String name) {
        JsonNode parameters = root.at("/paths/" + escapeJsonPointer(path) + "/" + method + "/parameters");
        if (parameters.isMissingNode()) {
            return;
        }
        for (JsonNode parameter : parameters) {
            assertThat(parameter.path("name").asText()).isNotEqualTo(name);
            assertThat(parameter.toString()).doesNotContain("DRY_RUN", "CODEF");
        }
    }

    private static String escapeJsonPointer(String value) {
        return value.replace("~", "~0").replace("/", "~1");
    }

    private static String quotedRefs(String prefix, int count) {
        return IntStream.rangeClosed(1, count)
                .mapToObj(i -> "\"" + prefix + i + "\"")
                .reduce((left, right) -> left + ", " + right)
                .orElse("");
    }
}
