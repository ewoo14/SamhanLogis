package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.MatchStatus;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
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
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * E3 S3 통장연계 입금보고서 IT.
 *
 * <p>요청은 통장 거래 UUID 대신 자연키 4-키 튜플만 사용하고, 생성 응답도 통장 거래 UUID 를 노출하지 않는다.
 * 입금보고서 내부 UUID 는 mutation path 전용이므로 본 endpoint 응답에서는 제거한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
class BankDepositReceiptIT extends AbstractPostgresIT {

    private static final String CASH_RECEIPT_URL = "/accounting/cash-receipts";
    private static final String FROM_BANK_URL = CASH_RECEIPT_URL + "/from-bank-transactions";
    private static final String BANK_URL = "/accounting/bank-transactions";
    private static final String ACTOR = "00000000-0000-0000-0000-000000000104";
    private static final String BANK_LABEL = "S3 테스트계좌";
    private static final UUID PARTNER_ID = UUID.fromString("30000000-0000-0000-0000-000000000001");
    private static final UUID PARTNER_2_ID = UUID.fromString("30000000-0000-0000-0000-000000000002");
    private static final PartnerSummary PARTNER = new PartnerSummary(
            PARTNER_ID, "P-S3-001", "통장연계상사", "321-45-67890", "서울");
    private static final PartnerSummary PARTNER_2 = new PartnerSummary(
            PARTNER_2_ID, "P-S3-002", "다른거래처", "987-65-43210", "부산");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private DataSource dataSource;

    @SpyBean private NamedParameterJdbcTemplate namedParameterJdbcTemplate;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        cleanup();
        lenient().when(partnerLookupClient.findByPartnerId(any())).thenReturn(java.util.Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(any()))
                .thenAnswer(invocation -> {
                    @SuppressWarnings("unchecked")
                    List<UUID> ids = invocation.getArgument(0, List.class);
                    java.util.LinkedHashMap<UUID, PartnerSummary> result = new java.util.LinkedHashMap<>();
                    if (ids.contains(PARTNER_ID)) {
                        result.put(PARTNER_ID, PARTNER);
                    }
                    if (ids.contains(PARTNER_2_ID)) {
                        result.put(PARTNER_2_ID, PARTNER_2);
                    }
                    return result;
                });
        lenient().when(approvalLineAuthorizeClient.authorize(any(), any(), any()))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    @DisplayName("N건 자연키 선택은 BANK_LINKED 입금보고서 1건을 확정 생성하고 거래를 REFLECTED 링크한다")
    void createFromMatchedDepositsAggregatesAndLinksTransactions() throws Exception {
        insertBankTransaction("S3-BANK-001", "2026-07-04T09:00:00", "DEPOSIT", "10000.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_ID, false);
        insertBankTransaction("S3-BANK-002", "2026-07-04T10:00:00", "DEPOSIT", "25000.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_ID, false);

        MvcResult result = mockMvc.perform(post(FROM_BANK_URL)
                        .header("X-User-Id", ACTOR)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactions": [
                                    %s,
                                    %s,
                                    %s
                                  ],
                                  "transactionDate": "2026-07-04",
                                  "memo": "S3-BANK-IT 정상 합산",
                                  "debitAccountCode": "1039",
                                  "creditAccountCode": "1089"
                                }
                                """.formatted(keyJson("S3-BANK-001", "2026-07-04T09:00:00", "10000.00"),
                                keyJson("S3-BANK-001", "2026-07-04T09:00:00", "10000.00"),
                                keyJson("S3-BANK-002", "2026-07-04T10:00:00", "25000.00"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").doesNotExist())
                .andExpect(jsonPath("$.data.kind").value("BANK_LINKED"))
                .andExpect(jsonPath("$.data.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.data.amount").value(35000))
                .andExpect(jsonPath("$.data.partnerCode").value("P-S3-001"))
                .andExpect(jsonPath("$.data.bizNo").value("3214567890"))
                .andExpect(jsonPath("$.data.partnerName").value("통장연계상사"))
                .andExpect(jsonPath("$.data.journalNo").isNotEmpty())
                .andReturn();

        JsonNode data = data(result);
        Map<String, Object> receipt = receiptBySlipNo(data.get("slipNo").asText());
        UUID receiptId = (UUID) receipt.get("id");
        UUID journalId = (UUID) receipt.get("journal_id");
        assertThat(receipt.get("kind")).isEqualTo("BANK_LINKED");
        assertThat(receipt.get("status")).isEqualTo("CONFIRMED");
        assertThat((BigDecimal) receipt.get("amount")).isEqualByComparingTo("35000.00");
        assertThat(journalId).isNotNull();
        assertJournalLines(journalId, "1039", "1089", new BigDecimal("35000.00"));

        Integer reflected = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM bank_transaction
                 WHERE external_ref IN ('S3-BANK-001', 'S3-BANK-002')
                   AND match_status = 'REFLECTED'
                   AND matched_journal_id = ?
                   AND cash_receipt_id = ?
                """, Integer.class, journalId, receiptId);
        assertThat(reflected).isEqualTo(2);
    }

    @Test
    @DisplayName("1:1 통장거래 선택도 동일 경로로 허용하고 목록 응답은 cashReceiptSlipNo 만 노출한다")
    void createFromSingleTransactionAndExposeSlipNoOnBankList() throws Exception {
        insertBankTransaction("S3-BANK-ONE", "2026-07-04T11:00:00", "DEPOSIT", "12000.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_ID, false);

        MvcResult created = createFromBank("S3-BANK-ONE", "2026-07-04T11:00:00", "12000.00");
        String slipNo = data(created).get("slipNo").asText();

        mockMvc.perform(get(BANK_URL)
                        .header("X-User-Id", ACTOR)
                        .header("X-User-Role", "ACCOUNTANT")
                        .param("matchStatus", MatchStatus.REFLECTED.name())
                        .param("bankAccountLabel", BANK_LABEL))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].externalRef").value("S3-BANK-ONE"))
                .andExpect(jsonPath("$.data[0].cashReceiptSlipNo").value(slipNo))
                .andExpect(jsonPath("$.data[0].cashReceiptId").doesNotExist());
    }

    @Test
    @DisplayName("검증 가드: 거래처 불일치·미매칭·REFLECTED 포함·CODEF_LOAN·출금은 409")
    void validationGuardsRejectInvalidSelections() throws Exception {
        insertBankTransaction("S3-BANK-MISMATCH-1", "2026-07-04T12:00:00", "DEPOSIT", "1000.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_ID, false);
        insertBankTransaction("S3-BANK-MISMATCH-2", "2026-07-04T12:01:00", "DEPOSIT", "2000.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_2_ID, false);
        expectCreateConflict("""
                [%s,%s]
                """.formatted(
                keyJson("S3-BANK-MISMATCH-1", "2026-07-04T12:00:00", "1000.00"),
                keyJson("S3-BANK-MISMATCH-2", "2026-07-04T12:01:00", "2000.00")),
                "동일 거래처");

        insertBankTransaction("S3-BANK-UNMATCHED", "2026-07-04T12:02:00", "DEPOSIT", "3000.00",
                "CSV_IMPORT", "UNREFLECTED", null, false);
        expectCreateConflict("[%s]".formatted(
                keyJson("S3-BANK-UNMATCHED", "2026-07-04T12:02:00", "3000.00")),
                "거래처 매칭");

        insertBankTransaction("S3-BANK-REFLECTED", "2026-07-04T12:03:00", "DEPOSIT", "4000.00",
                "CSV_IMPORT", "REFLECTED", PARTNER_ID, false);
        expectCreateConflict("[%s]".formatted(
                keyJson("S3-BANK-REFLECTED", "2026-07-04T12:03:00", "4000.00")),
                "미반영");

        insertBankTransaction("S3-BANK-LOAN", "2026-07-04T12:04:00", "DEPOSIT", "5000.00",
                "CODEF_LOAN", "UNREFLECTED", PARTNER_ID, false);
        expectCreateConflict("[%s]".formatted(
                keyJson("S3-BANK-LOAN", "2026-07-04T12:04:00", "5000.00")),
                "CODEF_LOAN");

        insertBankTransaction("S3-BANK-WITHDRAWAL", "2026-07-04T12:05:00", "WITHDRAWAL", "6000.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_ID, false);
        expectCreateConflict("[%s]".formatted(
                keyJson("S3-BANK-WITHDRAWAL", "2026-07-04T12:05:00", "6000.00")),
                "입금");

        assertNoBankLinkedReceipts();
    }

    @Test
    @DisplayName("transactions 배열에 null 원소가 있으면 400 INVALID_INPUT 으로 차단한다")
    void nullTransactionElementReturnsBadRequest() throws Exception {
        mockMvc.perform(post(FROM_BANK_URL)
                        .header("X-User-Id", ACTOR)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactions": [
                                    null,
                                    %s
                                  ],
                                  "transactionDate": "2026-07-04",
                                  "memo": "S3-BANK-IT null 원소"
                                }
                                """.formatted(keyJson("S3-BANK-NULL", "2026-07-04T12:10:00", "1000.00"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("transactions")));

        assertNoBankLinkedReceipts();
    }

    @Test
    @DisplayName("transactions 원소의 내부 필드가 무효(externalRef blank)면 @Valid 캐스케이드로 400 INVALID_INPUT 처리한다")
    void invalidTransactionElementFieldReturnsBadRequest() throws Exception {
        mockMvc.perform(post(FROM_BANK_URL)
                        .header("X-User-Id", ACTOR)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactions": [
                                    {
                                      "bankAccountLabel": "S3 IT 계좌",
                                      "transactedAt": "2026-07-04T12:15:00",
                                      "amount": 1000.00,
                                      "externalRef": "  "
                                    }
                                  ],
                                  "transactionDate": "2026-07-04",
                                  "memo": "S3-BANK-IT 내부 필드 무효"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("externalRef")));

        assertNoBankLinkedReceipts();
    }

    @Test
    @DisplayName("마감월 transactionDate 는 confirm 재사용 가드로 409 처리하고 입금보고서/분개를 남기지 않는다")
    void closedPeriodRollsBackReceiptAndJournal() throws Exception {
        jdbcTemplate.update("""
                INSERT INTO accounting_periods (
                    id, period_type, period_date, status, total_sales, total_purchase, total_expense,
                    locked_slip_count, version, created_at, created_by, is_deleted
                ) VALUES (gen_random_uuid(), 'MONTHLY', '2026-06-01', 'CLOSED', 0, 0, 0, 0, 0, NOW(), 'S3-BANK-IT', FALSE)
                """);
        insertBankTransaction("S3-BANK-CLOSED", "2026-07-04T13:00:00", "DEPOSIT", "7000.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_ID, false);

        mockMvc.perform(post(FROM_BANK_URL)
                        .header("X-User-Id", ACTOR)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactions": [%s],
                                  "transactionDate": "2026-06-15",
                                  "memo": "S3-BANK-IT 마감월"
                                }
                                """.formatted(keyJson("S3-BANK-CLOSED", "2026-07-04T13:00:00", "7000.00"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("마감된 회계 기간")));

        assertNoBankLinkedReceipts();
        assertThat(journalCountContaining("S3-BANK-IT 마감월")).isZero();
    }

    @Test
    @DisplayName("soft-delete 된 통장거래 자연키는 조회 대상에서 제외되어 404")
    void softDeletedBankTransactionIsNotSelectable() throws Exception {
        insertBankTransaction("S3-BANK-DELETED", "2026-07-04T13:30:00", "DEPOSIT", "8000.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_ID, true);

        mockMvc.perform(post(FROM_BANK_URL)
                        .header("X-User-Id", ACTOR)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactions": [%s],
                                  "transactionDate": "2026-07-04",
                                  "memo": "S3-BANK-IT 삭제행"
                                }
                                """.formatted(keyJson("S3-BANK-DELETED", "2026-07-04T13:30:00", "8000.00"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("통장 거래")));
    }

    @Test
    @DisplayName("조건부 UPDATE 0행 레이스는 전체 롤백되어 입금보고서/고아 분개를 남기지 않는다")
    @SuppressWarnings({"rawtypes", "unchecked"})
    void conditionalUpdateRaceRollsBackReceiptAndJournal() throws Exception {
        insertBankTransaction("S3-BANK-RACE", "2026-07-04T14:00:00", "DEPOSIT", "9000.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_ID, false);
        AtomicBoolean raceInjected = new AtomicBoolean(false);
        doAnswer(invocation -> {
            String sql = invocation.getArgument(0, String.class);
            if (sql.contains("UPDATE bank_transaction")
                    && sql.contains("cash_receipt_id")
                    && raceInjected.compareAndSet(false, true)) {
                try (Connection connection = dataSource.getConnection()) {
                    connection.setAutoCommit(true);
                    try (PreparedStatement ps = connection.prepareStatement("""
                            UPDATE bank_transaction
                               SET match_status = 'FORCED',
                                   matched_journal_id = ?,
                                   modified_at = NOW(),
                                   modified_by = 'race'
                             WHERE external_ref = 'S3-BANK-RACE'
                            """)) {
                        ps.setObject(1, UUID.randomUUID());
                        assertThat(ps.executeUpdate()).isEqualTo(1);
                    }
                }
            }
            return invocation.callRealMethod();
        }).when(namedParameterJdbcTemplate)
                .update(anyString(), any(SqlParameterSource.class));

        mockMvc.perform(post(FROM_BANK_URL)
                        .header("X-User-Id", ACTOR)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactions": [%s],
                                  "transactionDate": "2026-07-04",
                                  "memo": "S3-BANK-IT 레이스"
                                }
                                """.formatted(keyJson("S3-BANK-RACE", "2026-07-04T14:00:00", "9000.00"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("이미 반영")));

        assertThat(raceInjected.get()).isTrue();
        assertNoBankLinkedReceipts();
        assertThat(journalCountContaining("S3-BANK-IT 레이스")).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT match_status FROM bank_transaction WHERE external_ref = 'S3-BANK-RACE'",
                String.class)).isEqualTo("FORCED");
    }

    @Test
    @DisplayName("로드~승격 사이 매칭 해제 커밋 시 409 롤백되고 해제 상태가 보존된다")
    @SuppressWarnings({"rawtypes", "unchecked"})
    void concurrentPartnerClearBetweenLoadAndRawUpdateRollsBackCreation() throws Exception {
        insertBankTransaction("S3-BANK-CLEARRACE-1", "2026-07-04T14:30:00", "DEPOSIT", "9500.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_ID, false);
        insertBankTransaction("S3-BANK-CLEARRACE-2", "2026-07-04T14:31:00", "DEPOSIT", "9600.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_ID, false);
        insertBankTransaction("S3-BANK-CLEARRACE-3", "2026-07-04T14:32:00", "DEPOSIT", "9700.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_ID, false);
        AtomicBoolean raceInjected = new AtomicBoolean(false);
        AtomicInteger rawUpdateCalls = new AtomicInteger(0);
        // "선택 로드"(findUniqueByNaturalKey)는 이미 관리 엔티티를 이전 matched_partner_id 스냅샷으로
        // persistence context 에 적재한 상태다. 두 번째 raw UPDATE(반영 조건부 UPDATE) 직전에 별도 커넥션이
        // matched_partner_id 만 NULL 로 커밋(match_status 는 UNREFLECTED 유지)한다.
        // 서비스는 같은 partner 조건을 raw UPDATE WHERE 에 재확인해 0행 -> 409 -> 전체 롤백해야 한다.
        doAnswer(invocation -> {
            String sql = invocation.getArgument(0, String.class);
            if (sql.contains("UPDATE bank_transaction")
                    && sql.contains("cash_receipt_id")
                    && rawUpdateCalls.incrementAndGet() == 2
                    && raceInjected.compareAndSet(false, true)) {
                try (Connection connection = dataSource.getConnection()) {
                    connection.setAutoCommit(true);
                    try (PreparedStatement ps = connection.prepareStatement("""
                            UPDATE bank_transaction
                               SET matched_partner_id = NULL,
                                   partner_match_source = NULL,
                                   matched_mapping_id = NULL,
                                   partner_matched_at = NULL,
                                   partner_matched_by = NULL,
                                   matched_mapping_raw_name = NULL,
                                   matched_mapping_normalized_name = NULL,
                                   modified_at = NOW(),
                                   modified_by = 'race-clear-partner'
                             WHERE external_ref = 'S3-BANK-CLEARRACE-2'
                            """)) {
                        assertThat(ps.executeUpdate()).isEqualTo(1);
                    }
                }
            }
            return invocation.callRealMethod();
        }).when(namedParameterJdbcTemplate)
                .update(anyString(), any(SqlParameterSource.class));

        mockMvc.perform(post(FROM_BANK_URL)
                        .header("X-User-Id", ACTOR)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactions": [%s,%s,%s],
                                  "transactionDate": "2026-07-04",
                                  "memo": "S3-BANK-IT 파트너해제레이스"
                                }
                                """.formatted(
                                keyJson("S3-BANK-CLEARRACE-1", "2026-07-04T14:30:00", "9500.00"),
                                keyJson("S3-BANK-CLEARRACE-2", "2026-07-04T14:31:00", "9600.00"),
                                keyJson("S3-BANK-CLEARRACE-3", "2026-07-04T14:32:00", "9700.00"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("매칭이 변경")));

        assertThat(raceInjected.get()).isTrue();
        assertNoBankLinkedReceipts();
        assertThat(journalCountContaining("S3-BANK-IT 파트너해제레이스")).isZero();

        Integer unreflectedCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM bank_transaction
                 WHERE external_ref IN ('S3-BANK-CLEARRACE-1', 'S3-BANK-CLEARRACE-2', 'S3-BANK-CLEARRACE-3')
                   AND match_status = 'UNREFLECTED'
                   AND matched_journal_id IS NULL
                   AND cash_receipt_id IS NULL
                """, Integer.class);
        assertThat(unreflectedCount).isEqualTo(3);

        Map<String, Object> row = jdbcTemplate.queryForMap("""
                SELECT match_status, matched_partner_id, matched_journal_id, cash_receipt_id
                  FROM bank_transaction
                 WHERE external_ref = 'S3-BANK-CLEARRACE-2'
                """);
        assertThat(row.get("match_status")).isEqualTo("UNREFLECTED");
        assertThat(row.get("matched_partner_id")).isNull();
        assertThat(row.get("matched_journal_id")).isNull();
        assertThat(row.get("cash_receipt_id")).isNull();
    }

    @Test
    @DisplayName("BANK_LINKED 취소는 역분개 후 연결 통장거래를 UNREFLECTED 로 원복한다")
    void cancelBankLinkedReceiptUnlinksBankTransactions() throws Exception {
        insertBankTransaction("S3-BANK-CANCEL", "2026-07-04T15:00:00", "DEPOSIT", "15000.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_ID, false);
        MvcResult created = createFromBank("S3-BANK-CANCEL", "2026-07-04T15:00:00", "15000.00");
        UUID receiptId = receiptIdBySlipNo(data(created).get("slipNo").asText());

        mockMvc.perform(post(CASH_RECEIPT_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACTOR)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.reverseJournalNo").isNotEmpty());

        Map<String, Object> row = jdbcTemplate.queryForMap("""
                SELECT match_status, matched_journal_id, cash_receipt_id
                  FROM bank_transaction
                 WHERE external_ref = 'S3-BANK-CANCEL'
                """);
        assertThat(row.get("match_status")).isEqualTo("UNREFLECTED");
        assertThat(row.get("matched_journal_id")).isNull();
        assertThat(row.get("cash_receipt_id")).isNull();
    }

    @Test
    @DisplayName("BANK_LINKED 입금보고서 PATCH 는 409로 거부하고 취소 후 재생성을 안내한다")
    void patchBankLinkedReceiptIsRejected() throws Exception {
        insertBankTransaction("S3-BANK-PATCH", "2026-07-04T16:00:00", "DEPOSIT", "16000.00",
                "CSV_IMPORT", "UNREFLECTED", PARTNER_ID, false);
        MvcResult created = createFromBank("S3-BANK-PATCH", "2026-07-04T16:00:00", "16000.00");
        UUID receiptId = receiptIdBySlipNo(data(created).get("slipNo").asText());

        mockMvc.perform(patch(CASH_RECEIPT_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACTOR)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "partnerCode": "P-S3-001",
                                  "amount": 17000.00,
                                  "transactionDate": "2026-07-04",
                                  "memo": "수정 금지",
                                  "debitAccountCode": "1039",
                                  "creditAccountCode": "1089"
                                }
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("취소 후 재생성")));
    }

    @Test
    @DisplayName("V53 fresh DB에는 BANK_LINKED kind 제약과 bank_transaction.cash_receipt_id FK/index가 존재한다")
    void v53MigrationAddsBankLinkedKindAndCashReceiptLink() {
        Integer columnCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM information_schema.columns
                 WHERE table_name = 'bank_transaction'
                   AND column_name = 'cash_receipt_id'
                   AND data_type = 'uuid'
                """, Integer.class);
        assertThat(columnCount).isOne();

        Integer fkCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM pg_constraint c
                  JOIN pg_class t ON t.oid = c.conrelid
                 WHERE t.relname = 'bank_transaction'
                   AND c.contype = 'f'
                   AND pg_get_constraintdef(c.oid) LIKE '%cash_receipts%'
                """, Integer.class);
        assertThat(fkCount).isOne();

        Integer indexCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM pg_indexes
                 WHERE tablename = 'bank_transaction'
                   AND indexname = 'idx_bank_transaction_cash_receipt'
                """, Integer.class);
        assertThat(indexCount).isOne();

        Integer checkCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM pg_constraint c
                  JOIN pg_class t ON t.oid = c.conrelid
                 WHERE t.relname = 'cash_receipts'
                   AND c.conname = 'cash_receipts_kind_ck'
                   AND pg_get_constraintdef(c.oid) LIKE '%BANK_LINKED%'
                """, Integer.class);
        assertThat(checkCount).isOne();
    }

    private MvcResult createFromBank(String externalRef, String transactedAt, String amount) throws Exception {
        return mockMvc.perform(post(FROM_BANK_URL)
                        .header("X-User-Id", ACTOR)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactions": [%s],
                                  "transactionDate": "2026-07-04",
                                  "memo": "S3-BANK-IT 1건"
                                }
                                """.formatted(keyJson(externalRef, transactedAt, amount))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").doesNotExist())
                .andExpect(jsonPath("$.data.kind").value("BANK_LINKED"))
                .andReturn();
    }

    private void expectCreateConflict(String transactionsJson, String messagePart) throws Exception {
        mockMvc.perform(post(FROM_BANK_URL)
                        .header("X-User-Id", ACTOR)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactions": %s,
                                  "transactionDate": "2026-07-04",
                                  "memo": "S3-BANK-IT 검증"
                                }
                                """.formatted(transactionsJson)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(messagePart)))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("UNREFLECTED"))));
    }

    private static String keyJson(String externalRef, String transactedAt, String amount) {
        return """
                {
                  "bankAccountLabel": "%s",
                  "transactedAt": "%s",
                  "amount": %s,
                  "externalRef": "%s"
                }
                """.formatted(BANK_LABEL, transactedAt, amount, externalRef);
    }

    private void insertBankTransaction(String externalRef, String transactedAt, String txnType, String amount,
                                       String source, String matchStatus, UUID partnerId, boolean deleted) {
        String partnerMatchSource = partnerId == null ? "NULL" : "'MANUAL'";
        jdbcTemplate.update("""
                INSERT INTO bank_transaction (
                    id, transacted_at, txn_type, amount, balance_after, description, counterparty_name,
                    bank_account_label, source, external_ref, match_status, matched_partner_id,
                    partner_match_source, matched_journal_id,
                    created_at, created_by, deleted_at, deleted_by, is_deleted
                ) VALUES (
                    gen_random_uuid(), ?, ?, CAST(? AS numeric), NULL, ?, '테스트상대',
                    ?, ?, ?, ?, ?, %s, ?, NOW(), 'S3-BANK-IT',
                    CASE WHEN ? THEN NOW() ELSE NULL END,
                    CASE WHEN ? THEN 'S3-BANK-IT' ELSE NULL END,
                    ?
                )
                """.formatted(partnerMatchSource),
                LocalDateTime.parse(transactedAt),
                txnType,
                amount,
                "S3-BANK-IT " + externalRef,
                BANK_LABEL,
                source,
                externalRef,
                matchStatus,
                partnerId,
                "REFLECTED".equals(matchStatus) ? UUID.randomUUID() : null,
                deleted,
                deleted,
                deleted);
    }

    private JsonNode data(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse()
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).get("data");
    }

    private Map<String, Object> receiptBySlipNo(String slipNo) {
        return jdbcTemplate.queryForMap("""
                SELECT id, slip_no, amount, kind, status, journal_id
                  FROM cash_receipts
                 WHERE slip_no = ?
                """, slipNo);
    }

    private UUID receiptIdBySlipNo(String slipNo) {
        return jdbcTemplate.queryForObject(
                "SELECT id FROM cash_receipts WHERE slip_no = ?",
                UUID.class,
                slipNo);
    }

    private void assertJournalLines(UUID journalId, String debitAccount, String creditAccount, BigDecimal amount) {
        List<Map<String, Object>> lines = jdbcTemplate.queryForList("""
                SELECT line_no, account_code, debit_amount, credit_amount, partner_id
                  FROM journal_lines
                 WHERE journal_id = ?
                 ORDER BY line_no
                """, journalId);
        assertThat(lines).hasSize(2);
        assertThat(lines.get(0).get("account_code")).isEqualTo(debitAccount);
        assertThat((BigDecimal) lines.get(0).get("debit_amount")).isEqualByComparingTo(amount);
        assertThat((BigDecimal) lines.get(0).get("credit_amount")).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(lines.get(0).get("partner_id")).isEqualTo(PARTNER_ID);
        assertThat(lines.get(1).get("account_code")).isEqualTo(creditAccount);
        assertThat((BigDecimal) lines.get(1).get("debit_amount")).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat((BigDecimal) lines.get(1).get("credit_amount")).isEqualByComparingTo(amount);
        assertThat(lines.get(1).get("partner_id")).isEqualTo(PARTNER_ID);
    }

    private void assertNoBankLinkedReceipts() {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM cash_receipts
                 WHERE kind = 'BANK_LINKED'
                    OR external_ref LIKE 'BANK_LINKED:%'
                    OR memo LIKE 'S3-BANK-IT%'
                """, Integer.class);
        assertThat(count).isZero();
    }

    private Integer journalCountContaining(String descriptionPart) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM journals WHERE description LIKE ?",
                Integer.class,
                "%" + descriptionPart + "%");
    }

    private void cleanup() {
        jdbcTemplate.update("""
                DELETE FROM journal_lines
                 WHERE journal_id IN (
                       SELECT j.id
                         FROM journals j
                         LEFT JOIN cash_receipts cr ON cr.id = j.source_ref_id
                        WHERE j.description LIKE '%S3-BANK-IT%'
                           OR cr.external_ref LIKE 'BANK_LINKED:%'
                           OR cr.memo LIKE 'S3-BANK-IT%')
                """);
        jdbcTemplate.update("""
                DELETE FROM journals
                 WHERE id IN (
                       SELECT j.id
                         FROM journals j
                         LEFT JOIN cash_receipts cr ON cr.id = j.source_ref_id
                        WHERE j.description LIKE '%S3-BANK-IT%'
                           OR cr.external_ref LIKE 'BANK_LINKED:%'
                           OR cr.memo LIKE 'S3-BANK-IT%')
                """);
        jdbcTemplate.update("DELETE FROM bank_transaction WHERE external_ref LIKE 'S3-BANK-%'");
        jdbcTemplate.update("""
                DELETE FROM cash_receipts
                 WHERE external_ref LIKE 'BANK_LINKED:%'
                    OR memo LIKE 'S3-BANK-IT%'
                """);
        jdbcTemplate.update("DELETE FROM accounting_periods WHERE created_by = 'S3-BANK-IT'");
    }
}
