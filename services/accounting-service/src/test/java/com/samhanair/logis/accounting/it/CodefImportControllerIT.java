package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.nullValue;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.repository.BankTransactionRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
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

/**
 * CODEF 은행·카드 거래내역 import 통합 테스트 (BC1).
 *
 * <p>실 PostgreSQL + Flyway 기반으로 CODEF DRY_RUN client, BankTransaction 적재,
 * externalRef 멱등, 4-key 멀티계좌 중복 판정, 카드 필드, 거래처 자동 매칭을 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CodefImportControllerIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/accounting/codef/import";
    private static final String SCOPE_URL = "/accounting/codef/scopes";
    private static final UUID PARTNER_ID = UUID.fromString("33333333-3333-3333-3333-333333333333");

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private BankTransactionRepository bankTransactionRepository;

    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private SlipQueryClient slipQueryClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM bank_transaction");
        // 수동 매칭 해소 왕복 테스트의 학습 잔여물/타 IT 클래스 잔여 매핑이 자동 매칭 결과를
        // 오염시키지 않도록 매핑 테이블도 정리한다 (#810 R3-CODEX 회귀 IT 추가에 따른 격리).
        jdbcTemplate.update("DELETE FROM bank_depositor_partner_mapping");
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(any())).thenReturn(Map.of());
        lenient().when(partnerLookupClient.findByPartnerCode(anyString())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode("(주)삼성상사"))
                .thenReturn(Optional.of(new PartnerSummary(
                        PARTNER_ID,
                        "SS-001",
                        "(주)삼성상사",
                        "123-45-67890",
                        "서울")));
    }

    @Test
    @DisplayName("CODEF DRY_RUN 은행+카드 10건 적재, 재호출 externalRef 멱등, 거래처 매칭")
    void importCodefDryRun_idempotentAndMatchesPartner() throws Exception {
        importCodef()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("거래내역 가져오기가 완료되었습니다."))
                .andExpect(jsonPath("$.data.fetchedCount").value(10))
                .andExpect(jsonPath("$.data.importedCount").value(10))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(0))
                .andExpect(jsonPath("$.data.matchedCount").value(1));

        importCodef()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(10))
                .andExpect(jsonPath("$.data.importedCount").value(0))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(10))
                .andExpect(jsonPath("$.data.matchedCount").value(0));

        Integer bankCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE source = 'CODEF_BANK'
                """, Integer.class);
        Integer cardCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE source = 'CODEF_CARD'
                   AND txn_type = 'WITHDRAWAL'
                   AND card_name IS NOT NULL
                   AND approval_id IS NOT NULL
                """, Integer.class);

        assertThat(bankCount).isEqualTo(5);
        assertThat(cardCount).isEqualTo(5);
        assertThat(bankTransactionRepository
                .findByBankAccountLabelAndTransactedAtAndAmountAndExternalRefAndIsDeletedFalse(
                        "국민 123-456",
                        LocalDateTime.of(2026, 6, 1, 9, 15, 23),
                        new BigDecimal("1100000.00"),
                        "BANK-2026-06-01-001"))
                .hasValueSatisfying(txn -> {
                    assertThat(txn.getMatchedPartnerId()).isEqualTo(PARTNER_ID);
                    assertThat(txn.getExternalRef()).doesNotContain("CODEF-");
                });
    }

    @Test
    @DisplayName("CODEF scope — scopeMode 누락은 400으로 차단")
    void upsertScope_withoutScopeMode_returns400() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(SCOPE_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "connectedId": "connected-main",
                                  "accountRefs": [],
                                  "cardRefs": [],
                                  "loanRefs": [],
                                  "defaultImportType": "ALL"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("CODEF scope — SELECTED 빈 목록은 400으로 차단")
    void upsertScope_selectedWithoutRefs_returns400() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(SCOPE_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "connectedId": "connected-main",
                                  "scopeMode": "SELECTED",
                                  "accountRefs": [],
                                  "cardRefs": [],
                                  "loanRefs": [],
                                  "defaultImportType": "ALL"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("CODEF scope — ALL에 선택값을 함께 보내면 400으로 차단")
    void upsertScope_allWithRefs_returns400() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(SCOPE_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "connectedId": "connected-main",
                                  "scopeMode": "ALL",
                                  "accountRefs": ["국민 123-456"],
                                  "cardRefs": [],
                                  "loanRefs": [],
                                  "defaultImportType": "ALL"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("CODEF scope — ALL 빈 목록과 SELECTED 목록은 각각 저장 성공")
    void upsertScope_explicitModes_storeSuccessfully() throws Exception {
        String userId = UUID.randomUUID().toString();
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(SCOPE_URL)
                        .header("X-User-Id", userId)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "connectedId": "connected-all",
                                  "scopeMode": "ALL",
                                  "accountRefs": [],
                                  "cardRefs": [],
                                  "loanRefs": [],
                                  "defaultImportType": "ALL"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accountRefs").isEmpty());

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(SCOPE_URL)
                        .header("X-User-Id", userId)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "connectedId": "connected-selected",
                                  "scopeMode": "SELECTED",
                                  "accountRefs": ["국민 123-456"],
                                  "cardRefs": [],
                                  "loanRefs": [],
                                  "defaultImportType": "BANK"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accountRefs[0]").value("국민 123-456"));
    }

    @Test
    @DisplayName("CODEF scope — 저장 응답의 잠금값으로 같은 화면의 즉시 재저장이 성공한다")
    void upsertScope_successResponseVersion_allowsImmediateSecondSave() throws Exception {
        String userId = UUID.randomUUID().toString();
        String connectedId = "connected-version-" + UUID.randomUUID();

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(SCOPE_URL)
                        .header("X-User-Id", userId)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "connectedId": "%s",
                                  "version": null,
                                  "scopeMode": "SELECTED",
                                  "accountRefs": ["국민 123-456"],
                                  "cardRefs": [],
                                  "loanRefs": [],
                                  "defaultImportType": "BANK"
                                }
                                """.formatted(connectedId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(0));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(SCOPE_URL)
                        .header("X-User-Id", userId)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "connectedId": "%s",
                                  "version": 0,
                                  "scopeMode": "SELECTED",
                                  "accountRefs": ["신한 987-654"],
                                  "cardRefs": [],
                                  "loanRefs": [],
                                  "defaultImportType": "BANK"
                                }
                                """.formatted(connectedId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(1));
    }

    @Test
    @DisplayName("CODEF scope — 낡은 저장은 409로 거부하고 최신 선택을 바꾸지 않는다")
    void upsertScope_staleSnapshot_returns409AndPreservesLatestState() throws Exception {
        String userId = UUID.randomUUID().toString();
        String connectedId = "connected-stale-" + UUID.randomUUID();

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(SCOPE_URL)
                        .header("X-User-Id", userId)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(scopeJson(connectedId, null,
                                "[\"국민 123-456\"]", "[]")))
                .andExpect(status().isOk());

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(SCOPE_URL)
                        .header("X-User-Id", userId)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(scopeJson(connectedId, 0L,
                                "[\"국민 123-456\", \"신한 987-654\"]", "[]")))
                .andExpect(status().isOk());

        MvcResult staleResult = mockMvc.perform(
                        org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(SCOPE_URL)
                                .header("X-User-Id", userId)
                                .header("X-User-Role", "ACCOUNTANT")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(scopeJson(connectedId, 0L,
                                        "[\"국민 123-456\"]", "[\"법인카드-001\"]")))
                .andReturn();
        MvcResult latestResult = mockMvc.perform(
                        org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(SCOPE_URL)
                                .param("connectedId", connectedId)
                                .header("X-User-Id", userId)
                                .header("X-User-Role", "ACCOUNTANT"))
                .andReturn();

        org.junit.jupiter.api.Assertions.assertAll(
                () -> assertThat(staleResult.getResponse().getStatus()).isEqualTo(409),
                () -> assertThat(staleResult.getResponse().getContentAsString())
                        .contains("CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT"),
                () -> assertThat(latestResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                        .contains("신한 987-654")
                        .doesNotContain("법인카드-001"));
    }

    @Test
    @DisplayName("CODEF scope — 미저장 상태의 동시 첫 저장은 하나만 성사되고 다른 하나는 거부된다")
    void upsertScope_concurrentFirstSave_rejectsOneWithoutSilentOverwrite() throws Exception {
        String userId = UUID.randomUUID().toString();
        String connectedId = "connected-first-race-" + UUID.randomUUID();
        int requestCount = 2;
        ExecutorService executor = Executors.newFixedThreadPool(requestCount);
        CountDownLatch ready = new CountDownLatch(requestCount);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<MvcResult>> futures = new ArrayList<>();

        try {
            for (String accountRef : List.of("국민 123-456", "신한 987-654")) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
                    return mockMvc.perform(
                                    org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(SCOPE_URL)
                                            .header("X-User-Id", userId)
                                            .header("X-User-Role", "ACCOUNTANT")
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(scopeJson(connectedId, null,
                                                    "[\"" + accountRef + "\"]", "[]")))
                            .andReturn();
                }));
            }
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<MvcResult> results = new ArrayList<>();
            for (Future<MvcResult> future : futures) {
                results.add(future.get(20, TimeUnit.SECONDS));
            }
            long successCount = results.stream()
                    .filter(result -> result.getResponse().getStatus() == 200)
                    .count();
            long conflictCount = results.stream()
                    .filter(result -> result.getResponse().getStatus() == 409)
                    .count();
            assertThat(successCount).isEqualTo(1);
            assertThat(conflictCount).isEqualTo(1);
        } finally {
            executor.shutdownNow();
        }
        assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
    }

    @Test
    @DisplayName("#825 슬5 R1 BLOCKING#1 fix — ALL 저장 직후 저장기반 가져오기는 200(종전 400 자기모순 해소)")
    void importScoped_afterSavingAllScope_succeedsInsteadOf400() throws Exception {
        String userId = UUID.randomUUID().toString();
        String connectedId = "connected-blocking1-" + UUID.randomUUID();

        // ALL 저장 — refs 는 설계상 비어 있다(D-S5-02).
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(SCOPE_URL)
                        .header("X-User-Id", userId)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "connectedId": "%s",
                                  "scopeMode": "ALL",
                                  "accountRefs": [],
                                  "cardRefs": [],
                                  "loanRefs": [],
                                  "defaultImportType": "ALL"
                                }
                                """.formatted(connectedId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.scopeMode").value("ALL"));

        // FE 가 "저장 선택 사용" 의도로 보내는 payload 그대로(explicit-empty triple + type=ALL) —
        // 종전에는 저장된 refs 가 비어 있다는 이유만으로 400 이 났다(BLOCKING#1). scope_mode=ALL 이면
        // CODEF 서버 전체 열거(계좌4+카드3+대출2=9)로 materialize 되어 200 이어야 한다.
        mockMvc.perform(post("/accounting/codef/import-scoped")
                        .header("X-User-Id", userId)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "connectedId": "%s",
                                  "from": "2026-06-01",
                                  "to": "2026-06-03",
                                  "type": "ALL",
                                  "scopeMode": "ALL",
                                  "submitMethod": "DRY_RUN"
                                }
                                """.formatted(connectedId)))
                .andExpect(status().isOk())
                // DRY_RUN 카탈로그 전체(계좌4+카드3+대출2=9 refs) 열거 — CodefAccountSelectionIT
                // #importScopedAllWithNullRefs_importsAllListedRefs 가 동일 날짜범위·동일 진짜
                // ALL 경로에서 이미 45 를 단언하고 있어(같은 공유 DRY_RUN CodefClient bean)
                // 정확한 값으로 강화한다.
                .andExpect(jsonPath("$.data.fetchedCount").value(45));
    }

    @Test
    @DisplayName("#825 슬5 R1 H-4 fix — ALL 저장 후 재조회는 scopeMode=ALL 로 복원된다(구 미저장/전체 혼동 해소)")
    void getScope_afterSavingAllScope_restoresAllScopeMode() throws Exception {
        String userId = UUID.randomUUID().toString();
        String connectedId = "connected-h4-" + UUID.randomUUID();

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(SCOPE_URL)
                        .header("X-User-Id", userId)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "connectedId": "%s",
                                  "scopeMode": "ALL",
                                  "accountRefs": [],
                                  "cardRefs": [],
                                  "loanRefs": [],
                                  "defaultImportType": "ALL"
                                }
                                """.formatted(connectedId)))
                .andExpect(status().isOk());

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(SCOPE_URL)
                        .param("connectedId", connectedId)
                        .header("X-User-Id", userId)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.scopeMode").value("ALL"))
                .andExpect(jsonPath("$.data.accountRefs").isEmpty());
    }

    @Test
    @DisplayName("#825 슬5 R1 H-4 fix — 한 번도 저장한 적 없는 connectedId 조회는 scopeMode=null(미저장) 반환")
    void getScope_neverSaved_returnsNullScopeMode() throws Exception {
        String connectedId = "connected-never-saved-" + UUID.randomUUID();

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(SCOPE_URL)
                        .param("connectedId", connectedId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.scopeMode").value(nullValue()));
    }

    @Test
    @DisplayName("CODEF DRY_RUN 대출 5건 적재, 재호출 externalRef 멱등")
    void importCodefLoanDryRun_idempotent() throws Exception {
        importCodefLoan()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(5))
                .andExpect(jsonPath("$.data.importedCount").value(5))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(0))
                .andExpect(jsonPath("$.data.matchedCount").value(0));

        importCodefLoan()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(5))
                .andExpect(jsonPath("$.data.importedCount").value(0))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(5))
                .andExpect(jsonPath("$.data.matchedCount").value(0));

        Integer loanCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE source = 'CODEF_LOAN'
                   AND loan_name = '기업운전자금대출'
                   AND bank_account_label = '기업운전자금대출-001'
                """, Integer.class);

        assertThat(loanCount).isEqualTo(5);
    }

    @Test
    @DisplayName("단일 ref import 전송 방식 오류는 내부 enum 값을 노출하지 않는다")
    void importCodefRejectsInvalidSubmitMethodWithoutTechnicalValues() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "from": "2026-06-01",
                                  "to": "2026-06-03",
                                  "type": "BANK",
                                  "accountRef": "국민 123-456",
                                  "submitMethod": "INVALID"
                                }
                                """)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("전송 방식 값이 올바르지 않습니다"));
    }

    @Test
    @DisplayName("단일 ref import 필수 날짜 오류는 영어 필드명을 노출하지 않는다")
    void importCodefRejectsMissingFromDateWithKoreanMessage() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "to": "2026-06-03",
                                  "type": "BANK",
                                  "accountRef": "국민 123-456",
                                  "submitMethod": "DRY_RUN"
                                }
                                """)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("시작 날짜는 필수입니다"));
    }

    @Test
    @DisplayName("단일 ref import 미래 날짜 오류는 오늘 포함 문구로 반환한다")
    void importCodefRejectsFutureFromDateWithInclusiveKoreanMessage() throws Exception {
        mockMvc.perform(post(BASE_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "from": "%s",
                                  "to": "2026-06-03",
                                  "type": "BANK",
                                  "accountRef": "국민 123-456",
                                  "submitMethod": "DRY_RUN"
                                }
                                """.formatted(LocalDate.now().plusDays(1)))
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("시작 날짜는 오늘 또는 이전이어야 합니다"));
    }

    @Test
    @DisplayName("CODEF DRY_RUN 은행 import 는 같은 externalRef라도 계좌 라벨이 다르면 별도 적재")
    void importCodefBankDryRun_sameExternalRefDifferentAccountLabel_importsBothAccounts() throws Exception {
        importCodefBank("국민 123-456")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(5))
                .andExpect(jsonPath("$.data.importedCount").value(5))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(0));

        importCodefBank("신한 999-000")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(5))
                .andExpect(jsonPath("$.data.importedCount").value(5))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(0));

        Integer bankCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE source = 'CODEF_BANK'
                   AND bank_account_label IN ('국민 123-456', '신한 999-000')
                """, Integer.class);
        Integer duplicatedExternalRefCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE source = 'CODEF_BANK'
                   AND external_ref = 'BANK-2026-06-01-001'
                """, Integer.class);

        assertThat(bankCount).isEqualTo(10);
        assertThat(duplicatedExternalRefCount).isEqualTo(2);
    }

    @Test
    @DisplayName("CODEF DRY_RUN 은행 import 5병렬 중복 요청은 모두 200, SQL 누출 없이 멱등 skip")
    void importCodefBankDryRun_concurrentDuplicateRequests_areIdempotentAndDoNotLeakSql() throws Exception {
        int requestCount = 5;
        ExecutorService executor = Executors.newFixedThreadPool(requestCount);
        CountDownLatch ready = new CountDownLatch(requestCount);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<MvcResult>> futures = new ArrayList<>();

        List<MvcResult> results = new ArrayList<>();
        try {
            for (int i = 0; i < requestCount; i++) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
                    return importCodefBank("국민 123-456").andReturn();
                }));
            }

            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            for (Future<MvcResult> future : futures) {
                results.add(future.get(20, TimeUnit.SECONDS));
            }
        } finally {
            executor.shutdownNow();
        }
        assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();

        for (MvcResult result : results) {
            String body = result.getResponse().getContentAsString();
            assertThat(result.getResponse().getStatus()).as(body).isEqualTo(200);
            assertThat(body)
                    .doesNotContain("DataIntegrityViolationException")
                    .doesNotContain("duplicate key value")
                    .doesNotContain("uq_bank_transaction_external_active")
                    .doesNotContain("INSERT INTO")
                    .doesNotContain("bank_transaction")
                    .doesNotContain("CODEF-");
        }

        Integer activeCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE source = 'CODEF_BANK'
                   AND bank_account_label = '국민 123-456'
                   AND is_deleted = false
                """, Integer.class);
        Integer vendorPrefixCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE external_ref LIKE 'CODEF-%'
                """, Integer.class);

        assertThat(activeCount).isEqualTo(5);
        assertThat(vendorPrefixCount).isZero();
    }

    @Test
    @DisplayName("CODEF import — DynamicPermissionClient CREATE deny 시 403")
    void importCodefDeniedPermissionReturns403() throws Exception {
        denyRequirePermission("accounting.bank-matching", PermissionAction.CREATE);

        importCodef()
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("#810 R3-CODEX: 특정 거래처 조회 일시 장애 행도 거래는 저장되고 매칭만 보류되며 수동 매칭으로 해소된다")
    void importCodef_persistsUnavailableRowUnmatchedAndResolvesByManualMatch() throws Exception {
        // 전 거래처 NOT_FOUND, (주)삼성상사 행만 UNAVAILABLE — poison-pill 시나리오.
        lenient().when(partnerLookupClient.findByPartnerCodeResult(anyString()))
                .thenReturn(PartnerLookupClient.LookupResult.notFound());
        lenient().when(partnerLookupClient.findByPartnerCodeResult("(주)삼성상사"))
                .thenReturn(PartnerLookupClient.LookupResult.unavailable());

        importCodef()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(10))
                .andExpect(jsonPath("$.data.importedCount").value(10))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(0))
                .andExpect(jsonPath("$.data.matchedCount").value(0))
                .andExpect(jsonPath("$.data.unavailableSkippedCount").value(1))
                .andExpect(jsonPath("$.data.unavailableNames[0]").value("(주)삼성상사"));

        // S1-H1 회귀: 구 동작(저장 전 skip)은 거래를 영구 유실시켰다 — 이제 미매칭으로 영속화된다.
        Integer heldUnmatched = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE counterparty_name = '(주)삼성상사'
                   AND matched_partner_id IS NULL
                   AND is_deleted = FALSE
                """, Integer.class);
        assertThat(heldUnmatched).isEqualTo(1);

        // 재실행: 전부 중복 skip — 이중 적재도 유실도 없다(멱등).
        importCodef()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.importedCount").value(0))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(10))
                .andExpect(jsonPath("$.data.matchedCount").value(0))
                .andExpect(jsonPath("$.data.unavailableSkippedCount").value(0));

        // 장애 복구 후 수동 매칭으로 해소(왕복) — 4-key 자연키 + partnerCode 계약.
        when(partnerLookupClient.findByPartnerCodeResult("SS-001"))
                .thenReturn(PartnerLookupClient.LookupResult.found(new PartnerSummary(
                        PARTNER_ID, "SS-001", "(주)삼성상사", "123-45-67890", "서울")));
        mockMvc.perform(patch("/accounting/bank-transactions/match-partner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "bankAccountLabel": "국민 123-456",
                                  "transactedAt": "2026-06-01T09:15:23",
                                  "amount": 1100000.00,
                                  "externalRef": "BANK-2026-06-01-001",
                                  "partnerCode": "SS-001"
                                }
                                """)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.matchedPartnerCode").value("SS-001"));

        Integer resolvedManually = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE counterparty_name = '(주)삼성상사'
                   AND matched_partner_id = ?
                   AND partner_match_source = 'MANUAL'
                   AND is_deleted = FALSE
                """, Integer.class, PARTNER_ID);
        assertThat(resolvedManually).isEqualTo(1);
    }

    private org.springframework.test.web.servlet.ResultActions importCodef() throws Exception {
        return mockMvc.perform(post(BASE_URL)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "from": "2026-06-01",
                          "to": "2026-06-03",
                          "accountRef": "국민 123-456",
                          "cardRef": "법인카드-001",
                          "submitMethod": "DRY_RUN"
                        }
                        """)
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "ACCOUNTANT"));
    }

    private static String scopeJson(String connectedId, Long version, String accountRefs, String cardRefs) {
        String versionJson = version == null ? "null" : version.toString();
        return """
                {
                  "connectedId": "%s",
                  "version": %s,
                  "scopeMode": "SELECTED",
                  "accountRefs": %s,
                  "cardRefs": %s,
                  "loanRefs": [],
                  "defaultImportType": "ALL"
                }
                """.formatted(connectedId, versionJson, accountRefs, cardRefs);
    }

    private org.springframework.test.web.servlet.ResultActions importCodefBank(String accountRef) throws Exception {
        return mockMvc.perform(post(BASE_URL)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "from": "2026-06-01",
                          "to": "2026-06-03",
                          "type": "BANK",
                          "accountRef": "%s",
                          "submitMethod": "DRY_RUN"
                        }
                        """.formatted(accountRef))
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "ACCOUNTANT"));
    }

    private org.springframework.test.web.servlet.ResultActions importCodefLoan() throws Exception {
        return mockMvc.perform(post(BASE_URL)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "from": "2026-06-01",
                          "to": "2026-06-03",
                          "type": "LOAN",
                          "loanRef": "기업운전자금대출-001",
                          "submitMethod": "DRY_RUN"
                        }
                        """)
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "ACCOUNTANT"));
    }
}
