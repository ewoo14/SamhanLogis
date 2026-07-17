package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
    @DisplayName("#810 R3: 특정 거래처 조회 일시 장애 행만 격리되고 나머지 배치는 완주하며 재시도에서 재처리된다")
    void importCodef_isolatesUnavailableRowAndRetriesOnNextImport() throws Exception {
        // 전 거래처 NOT_FOUND, (주)삼성상사 행만 UNAVAILABLE — poison-pill 시나리오.
        lenient().when(partnerLookupClient.findByPartnerCodeResult(anyString()))
                .thenReturn(PartnerLookupClient.LookupResult.notFound());
        lenient().when(partnerLookupClient.findByPartnerCodeResult("(주)삼성상사"))
                .thenReturn(PartnerLookupClient.LookupResult.unavailable());

        importCodef()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(10))
                .andExpect(jsonPath("$.data.importedCount").value(9))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(0))
                .andExpect(jsonPath("$.data.matchedCount").value(0))
                .andExpect(jsonPath("$.data.unavailableSkippedCount").value(1))
                .andExpect(jsonPath("$.data.unavailableNames[0]").value("(주)삼성상사"));

        // 격리 행은 저장되지 않는다 — 재시도에서 중복으로 오인되지 않아야 한다.
        Integer isolatedCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE counterparty_name = '(주)삼성상사' AND is_deleted = FALSE
                """, Integer.class);
        assertThat(isolatedCount).isZero();

        // 장애 복구 후 재실행: 격리됐던 행이 정확일치 매칭과 함께 적재되고 나머지는 중복 skip.
        lenient().when(partnerLookupClient.findByPartnerCodeResult("(주)삼성상사"))
                .thenReturn(PartnerLookupClient.LookupResult.found(new PartnerSummary(
                        PARTNER_ID, "SS-001", "(주)삼성상사", "123-45-67890", "서울")));

        importCodef()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.importedCount").value(1))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(9))
                .andExpect(jsonPath("$.data.matchedCount").value(1))
                .andExpect(jsonPath("$.data.unavailableSkippedCount").value(0));

        Integer retriedMatched = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE counterparty_name = '(주)삼성상사'
                   AND matched_partner_id = ?
                   AND partner_match_source = 'PARTNER_CODE_EXACT'
                   AND is_deleted = FALSE
                """, Integer.class, PARTNER_ID);
        assertThat(retriedMatched).isEqualTo(1);
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
