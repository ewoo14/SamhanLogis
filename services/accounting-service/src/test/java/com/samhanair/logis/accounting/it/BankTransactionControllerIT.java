package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import com.samhanair.logis.accounting.domain.BankTransaction;
import com.samhanair.logis.accounting.domain.PartnerMatchSource;
import com.samhanair.logis.accounting.repository.BankTransactionRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.nio.charset.Charset;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/**
 * H-1 BankTransaction 통합 테스트.
 *
 * <p>실 PostgreSQL + Flyway V43 기반으로 CSV 범용 매핑 import, 중복 skip 멱등성,
 * CHECK 제약, 탭 필터, 상태전이 가드를 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BankTransactionControllerIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/accounting/bank-transactions";
    private static final String BANK_ACCOUNT_LABEL = "국민 123-456";
    private static final UUID PARTNER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final PartnerSummary PARTNER = new PartnerSummary(
            PARTNER_ID,
            "P-2026-0001",
            "삼한테스트상사",
            "111-22-33333",
            "서울");
    private static final UUID PARTNER_2_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final PartnerSummary PARTNER_2 = new PartnerSummary(
            PARTNER_2_ID,
            "P-2026-0002",
            "두번째거래처",
            "222-33-44444",
            "부산");

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private BankTransactionRepository repository;

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
        jdbcTemplate.update("DELETE FROM bank_depositor_partner_mapping");
        jdbcTemplate.update("DELETE FROM accounting_audit_logs WHERE field_name LIKE 'mapping.%'");
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(any())).thenReturn(Map.of());
    }

    @Test
    @DisplayName("CSV import: MS949 한글 적요 적재 + 재업로드 중복 skip + UUID 미노출")
    void importCsv_idempotentAndHidesUuid() throws Exception {
        MockMultipartFile file = ms949Csv();

        importCsv(file)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRows").value(2))
                .andExpect(jsonPath("$.data.importedCount").value(2))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(0));

        importCsv(ms949Csv())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRows").value(2))
                .andExpect(jsonPath("$.data.importedCount").value(0))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(2));

        mockMvc.perform(get(BASE_URL)
                        .param("matchStatus", "UNREFLECTED")
                        .param("from", "2026-06-23")
                        .param("to", "2026-06-23")
                        .param("bankAccountLabel", BANK_ACCOUNT_LABEL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].description").value("이체 수수료"))
                .andExpect(jsonPath("$.data[1].description").value("삼한테스트상사 입금"))
                .andExpect(jsonPath("$.data[0].id").doesNotExist())
                .andExpect(jsonPath("$.data[0].matchedPartnerId").doesNotExist())
                .andExpect(jsonPath("$.data[0].matchedJournalId").doesNotExist());

        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM bank_transaction", Integer.class);
        assertThat(count).isEqualTo(2);
    }

    @Test
    @DisplayName("계좌 필터는 계좌 소스행에만 IN 적용하고 카드/대출 소스는 면제로 유지한다")
    void list_filtersAccountLabelsSourceAware() throws Exception {
        insertNative("DEPOSIT", "CSV_IMPORT", "UNREFLECTED", "1000.00", "multi-a-001", "국민 111");
        insertNative("DEPOSIT", "CODEF_BANK", "UNREFLECTED", "2000.00", "multi-b-001", "신한 222");
        insertNative("DEPOSIT", "CSV_IMPORT", "UNREFLECTED", "3000.00", "multi-c-001", "농협 333");
        insertNative("DEPOSIT", "CODEF_CARD", "UNREFLECTED", "4000.00", "multi-d-001", "법인카드 A");
        insertNative("WITHDRAWAL", "CODEF_LOAN", "UNREFLECTED", "5000.00", "multi-e-001", "우리 대출");

        // 계좌 부분선택: 계좌 소스는 선택 label 만(농협 제외), 카드/대출 소스는 필터 면제로 유지.
        mockMvc.perform(get(BASE_URL)
                        .param("accountLabels", "국민 111", "신한 222")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(4))
                .andExpect(jsonPath("$.data[*].bankAccountLabel")
                        .value(org.hamcrest.Matchers.containsInAnyOrder(
                                "국민 111", "신한 222", "법인카드 A", "우리 대출")));
    }

    @Test
    @DisplayName("카드 필터는 카드 소스행에만 IN 적용하고 계좌/대출 소스는 면제로 유지한다")
    void list_filtersCardLabelsSourceAware() throws Exception {
        insertNative("DEPOSIT", "CSV_IMPORT", "UNREFLECTED", "1000.00", "card-a-001", "국민 111");
        insertNative("DEPOSIT", "CODEF_CARD", "UNREFLECTED", "2000.00", "card-b-001", "법인카드 A");
        insertNative("DEPOSIT", "CODEF_CARD", "UNREFLECTED", "3000.00", "card-c-001", "법인카드 B");
        insertNative("WITHDRAWAL", "CODEF_LOAN", "UNREFLECTED", "4000.00", "card-d-001", "우리 대출");

        // 카드 부분선택: 카드 소스는 선택 label 만(법인카드 B 제외), 계좌/대출 소스는 면제로 유지.
        mockMvc.perform(get(BASE_URL)
                        .param("cardLabels", "법인카드 A")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(3))
                .andExpect(jsonPath("$.data[*].bankAccountLabel")
                        .value(org.hamcrest.Matchers.containsInAnyOrder(
                                "국민 111", "법인카드 A", "우리 대출")));
    }

    @Test
    @DisplayName("필터 설정은 X-User-Id 별로 저장/복원하고 UUID 를 응답하지 않는다")
    void filterPreferences_areStoredPerUser() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID otherUserId = UUID.randomUUID();

        mockMvc.perform(get(BASE_URL + "/filter-preferences")
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accountLabels.length()").value(0))
                .andExpect(jsonPath("$.data.cardLabels.length()").value(0))
                .andExpect(jsonPath("$.data.id").doesNotExist())
                .andExpect(jsonPath("$.data.userId").doesNotExist());

        mockMvc.perform(put(BASE_URL + "/filter-preferences")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "accountLabels": ["국민 111", "신한 222", "국민 111"],
                                  "cardLabels": ["법인카드 A"]
                                }
                                """)
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accountLabels[0]").value("국민 111"))
                .andExpect(jsonPath("$.data.accountLabels[1]").value("신한 222"))
                .andExpect(jsonPath("$.data.accountLabels.length()").value(2))
                .andExpect(jsonPath("$.data.cardLabels[0]").value("법인카드 A"));

        mockMvc.perform(get(BASE_URL + "/filter-preferences")
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accountLabels.length()").value(2))
                .andExpect(jsonPath("$.data.cardLabels[0]").value("법인카드 A"));

        mockMvc.perform(get(BASE_URL + "/filter-preferences")
                        .header("X-User-Id", otherUserId.toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accountLabels.length()").value(0))
                .andExpect(jsonPath("$.data.cardLabels.length()").value(0));
    }

    @Test
    @DisplayName("필터 label 목록은 soft-delete 행을 제외하고 계좌/카드 label 을 분리한다")
    void filterLabels_excludeSoftDeletedRows() throws Exception {
        insertNative("DEPOSIT", "CSV_IMPORT", "UNREFLECTED", "1000.00", "label-bank-001", "CSV 국민");
        insertNative("WITHDRAWAL", "CODEF_CARD", "UNREFLECTED", "2000.00", "label-card-001", "법인카드 A");
        jdbcTemplate.update("""
                INSERT INTO bank_transaction (
                    id, transacted_at, txn_type, amount, description, bank_account_label,
                    source, external_ref, match_status, created_at, created_by, deleted_at, deleted_by, is_deleted
                ) VALUES (
                    ?, TIMESTAMP '2026-06-23 09:20:00', 'DEPOSIT', 3000.00, '삭제 label',
                    '삭제 계좌', 'CSV_IMPORT', 'label-deleted-001', 'UNREFLECTED',
                    NOW(), 'it', NOW(), 'it', TRUE
                )
                """, UUID.randomUUID());

        mockMvc.perform(get(BASE_URL + "/filter-labels")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accountLabels")
                        .value(org.hamcrest.Matchers.hasItem("CSV 국민")))
                .andExpect(jsonPath("$.data.cardLabels")
                        .value(org.hamcrest.Matchers.hasItem("법인카드 A")))
                .andExpect(jsonPath("$.data.accountLabels")
                        .value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("삭제 계좌"))));
    }

    @Test
    @DisplayName("RequirePermission: accounting.bank-matching CREATE deny 시 import 403")
    void importCsv_requiresCreatePermission() throws Exception {
        denyRequirePermission("accounting.bank-matching", PermissionAction.CREATE);

        importCsv(ms949Csv())
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("RequirePermission: accounting.bank-matching UPDATE deny 시 필터 설정 저장 403")
    void updateFilterPreferences_requiresUpdatePermission() throws Exception {
        denyRequirePermission("accounting.bank-matching", PermissionAction.UPDATE);

        mockMvc.perform(put(BASE_URL + "/filter-preferences")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "accountLabels": ["국민 111"],
                                  "cardLabels": []
                                }
                                """)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("CSV dedup: 같은 계좌/시각/금액이어도 externalRef 가 다르면 둘 다 적재, 재업로드는 멱등 skip")
    void importCsv_keepsDistinctExternalRefsForSameAccountTimeAmount() throws Exception {
        importCsv(sameKeyDifferentExternalRefCsv())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRows").value(2))
                .andExpect(jsonPath("$.data.importedCount").value(2))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(0));

        importCsv(sameKeyDifferentExternalRefCsv())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRows").value(2))
                .andExpect(jsonPath("$.data.importedCount").value(0))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(2));

        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE bank_account_label = ?
                   AND transacted_at = TIMESTAMP '2026-06-23 09:10:00'
                   AND amount = 150000.00
                """, Integer.class, BANK_ACCOUNT_LABEL);
        assertThat(count).isEqualTo(2);
    }

    @Test
    @DisplayName("CSV import: 악성/범위초과 컬럼 인덱스는 INVALID_INPUT 400")
    void importCsv_rejectsMaliciousColumnIndexWithBadRequest() throws Exception {
        importCsvWithDateColumn(ms949Csv(), "999999999999999999999999999999")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("컬럼 인덱스")));

        importCsvWithDateColumn(ms949Csv(), "-1")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("컬럼 인덱스")));

        importCsvWithDateColumn(ms949Csv(), "99")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("컬럼 인덱스")));
    }

    @Test
    @DisplayName("CHECK 제약: txn_type/source/match_status/amount native INSERT 거부")
    void checkConstraint_rejectsInvalidEnumAndAmount() {
        assertThatThrownBy(() -> insertNative("TRANSFER", "CSV_IMPORT", "UNREFLECTED", "1000.00", "bad-type"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertNative("DEPOSIT", "MANUAL", "UNREFLECTED", "1000.00", "bad-source"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertNative("DEPOSIT", "CSV_IMPORT", "MATCHED", "1000.00", "bad-status"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertNative("DEPOSIT", "CSV_IMPORT", "UNREFLECTED", "0.00", "bad-amount"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("상태전이 가드: 반영 후 강제 전환 거부")
    void domainTransition_rejectsInvalidTransition() throws Exception {
        importCsv(ms949Csv()).andExpect(status().isOk());

        BankTransaction transaction = repository.findByExternalRefAndIsDeletedFalse("BANK-001")
                .orElseThrow();
        transaction.markReflected(UUID.randomUUID());
        repository.saveAndFlush(transaction);

        assertThatThrownBy(() -> transaction.markForced(UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("전환이 허용되지 않습니다");

        mockMvc.perform(get(BASE_URL)
                        .param("matchStatus", "REFLECTED")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].matchStatus").value("REFLECTED"));
    }

    @Test
    @DisplayName("상태전이 가드: 강제 반영도 journalId null 거부")
    void domainTransition_markForcedRejectsNullJournalId() throws Exception {
        importCsv(ms949Csv()).andExpect(status().isOk());

        BankTransaction transaction = repository.findByExternalRefAndIsDeletedFalse("BANK-001")
                .orElseThrow();

        assertThatThrownBy(() -> transaction.markForced(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("journalId 는 필수입니다");
    }

    @Test
    @DisplayName("거래처 수동지정: partnerCode 로 매칭하고 응답에는 UUID 를 노출하지 않는다")
    void matchPartner_updatesDisplayAndHidesUuid() throws Exception {
        importCsv(ms949Csv()).andExpect(status().isOk());
        when(partnerLookupClient.findByPartnerCode("P-2026-0001")).thenReturn(Optional.of(PARTNER));

        matchPartner("BANK-001", "P-2026-0001")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.externalRef").value("BANK-001"))
                .andExpect(jsonPath("$.data.matchStatus").value("UNREFLECTED"))
                .andExpect(jsonPath("$.data.matchedPartnerCode").value("P-2026-0001"))
                .andExpect(jsonPath("$.data.matchedBizNo").value("1112233333"))
                .andExpect(jsonPath("$.data.matchedPartnerName").value("삼한테스트상사"))
                .andExpect(jsonPath("$.data.id").doesNotExist())
                .andExpect(jsonPath("$.data.matchedPartnerId").doesNotExist());

        BankTransaction transaction = repository.findByExternalRefAndIsDeletedFalse("BANK-001")
                .orElseThrow();
        assertThat(transaction.getMatchedPartnerId()).isEqualTo(PARTNER_ID);
    }

    @Test
    @DisplayName("거래처 수동지정 해제: UNREFLECTED 거래의 matchedPartnerId 를 null 로 되돌린다")
    void clearPartner_removesDisplayAndInternalMatch() throws Exception {
        importCsv(ms949Csv()).andExpect(status().isOk());
        when(partnerLookupClient.findByPartnerCode("P-2026-0001")).thenReturn(Optional.of(PARTNER));
        matchPartner("BANK-001", "P-2026-0001").andExpect(status().isOk());

        clearPartner("BANK-001")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.externalRef").value("BANK-001"))
                .andExpect(jsonPath("$.data.matchStatus").value("UNREFLECTED"))
                .andExpect(jsonPath("$.data.matchedPartnerId").doesNotExist());

        BankTransaction transaction = repository.findByExternalRefAndIsDeletedFalse("BANK-001")
                .orElseThrow();
        assertThat(transaction.getMatchedPartnerId()).isNull();
    }

    @Test
    @DisplayName("거래처 수동지정: 미등록 partnerCode 는 NOT_FOUND 404")
    void matchPartner_returnsNotFoundForUnknownPartnerCode() throws Exception {
        importCsv(ms949Csv()).andExpect(status().isOk());
        when(partnerLookupClient.findByPartnerCode("NO-PARTNER")).thenReturn(Optional.empty());

        matchPartner("BANK-001", "NO-PARTNER")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("등록된 거래처")));
    }

    @Test
    @DisplayName("거래처 수동지정: REFLECTED 거래 재지정은 CONFLICT 409")
    void matchPartner_rejectsReflectedTransactionWithConflict() throws Exception {
        importCsv(ms949Csv()).andExpect(status().isOk());
        BankTransaction transaction = repository.findByExternalRefAndIsDeletedFalse("BANK-001")
                .orElseThrow();
        transaction.markReflected(UUID.randomUUID());
        repository.saveAndFlush(transaction);
        when(partnerLookupClient.findByPartnerCode("P-2026-0001")).thenReturn(Optional.of(PARTNER));

        matchPartner("BANK-001", "P-2026-0001")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("미반영 상태가 아니")));
    }

    @Test
    @DisplayName("거래처 수동지정 해제: REFLECTED 거래의 해제는 CONFLICT 409")
    void clearPartner_rejectsReflectedTransactionWithConflict() throws Exception {
        importCsv(ms949Csv()).andExpect(status().isOk());
        BankTransaction transaction = repository.findByExternalRefAndIsDeletedFalse("BANK-001")
                .orElseThrow();
        transaction.markReflected(UUID.randomUUID());
        repository.saveAndFlush(transaction);

        clearPartner("BANK-001")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("미반영 상태가 아니")));
    }

    @Test
    @DisplayName("거래처 수동지정: 미반영 거래 재지정(덮어쓰기) 허용")
    void matchPartner_allowsReMatchOverwriteForUnreflected() throws Exception {
        importCsv(ms949Csv()).andExpect(status().isOk());
        when(partnerLookupClient.findByPartnerCode("P-2026-0001")).thenReturn(Optional.of(PARTNER));
        when(partnerLookupClient.findByPartnerCode("P-2026-0002")).thenReturn(Optional.of(PARTNER_2));
        matchPartner("BANK-001", "P-2026-0001").andExpect(status().isOk());

        matchPartner("BANK-001", "P-2026-0002")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.matchStatus").value("UNREFLECTED"))
                .andExpect(jsonPath("$.data.matchedPartnerCode").value("P-2026-0002"));

        BankTransaction transaction = repository.findByExternalRefAndIsDeletedFalse("BANK-001")
                .orElseThrow();
        assertThat(transaction.getMatchedPartnerId()).isEqualTo(PARTNER_2_ID);
    }

    @Test
    @DisplayName("#810 R1: deposit-mapping DELETE 없이 clear-and-delete-mapping은 403이고 거래 해제도 롤백된다")
    void clearAndDeleteMapping_deniesWithoutDepositMappingDeleteAndRollsBack() throws Exception {
        seedActiveMapping("삼한테스트상사", PARTNER_ID);
        when(partnerLookupClient.findByPartnerId(PARTNER_ID)).thenReturn(Optional.of(PARTNER));
        importCsv(ms949Csv()).andExpect(status().isOk());
        BankTransaction matched = repository.findByExternalRefAndIsDeletedFalse("BANK-001").orElseThrow();
        assertThat(matched.getPartnerMatchSource()).isEqualTo(PartnerMatchSource.DEPOSITOR_MAPPING);

        denyRequirePermission("accounting.deposit-mapping", PermissionAction.DELETE);

        clearAndDeleteMapping("BANK-001")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        BankTransaction after = repository.findByExternalRefAndIsDeletedFalse("BANK-001").orElseThrow();
        assertThat(after.getMatchedPartnerId()).isEqualTo(PARTNER_ID);
        assertThat(after.getPartnerMatchSource()).isEqualTo(PartnerMatchSource.DEPOSITOR_MAPPING);
        Integer activeMappings = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_depositor_partner_mapping WHERE is_deleted = FALSE",
                Integer.class);
        assertThat(activeMappings).isEqualTo(1);
    }

    @Test
    @DisplayName("#810 R1: 양쪽 권한 보유 시 clear-and-delete-mapping은 거래 해제와 매핑 soft delete를 함께 수행한다")
    void clearAndDeleteMapping_clearsTransactionAndSoftDeletesMappingWithBothPermissions() throws Exception {
        seedActiveMapping("삼한테스트상사", PARTNER_ID);
        when(partnerLookupClient.findByPartnerId(PARTNER_ID)).thenReturn(Optional.of(PARTNER));
        importCsv(ms949Csv()).andExpect(status().isOk());

        clearAndDeleteMapping("BANK-001")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.matchedPartnerId").doesNotExist());

        BankTransaction after = repository.findByExternalRefAndIsDeletedFalse("BANK-001").orElseThrow();
        assertThat(after.getMatchedPartnerId()).isNull();
        assertThat(after.getPartnerMatchSource()).isNull();
        Integer activeMappings = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_depositor_partner_mapping WHERE is_deleted = FALSE",
                Integer.class);
        assertThat(activeMappings).isZero();
    }

    @Test
    @DisplayName("MASTER 실 HTTP: X-Is-System-Master=true이면 clear-and-delete가 200이고 매핑도 삭제된다")
    void systemMaster_clearAndDeleteBypassesInternalMappingPermission() throws Exception {
        seedActiveMapping("삼한테스트상사", PARTNER_ID);
        when(partnerLookupClient.findByPartnerId(PARTNER_ID)).thenReturn(Optional.of(PARTNER));
        importCsv(ms949Csv()).andExpect(status().isOk());

        clearAndDeleteMappingWithSystemMaster("BANK-001")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.matchedPartnerId").doesNotExist());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_depositor_partner_mapping WHERE is_deleted = FALSE", Integer.class))
                .isZero();
        assertThat(repository.findByExternalRefAndIsDeletedFalse("BANK-001").orElseThrow()
                .getMatchedPartnerId()).isNull();
    }

    @Test
    @DisplayName("MASTER 실 HTTP: 수동 입금 매칭은 deposit mapping upsert를 학습한다")
    void systemMaster_manualDepositMatchLearnsMapping() throws Exception {
        insertNativeWithCounterparty("DEPOSIT", "CSV_IMPORT", "7000.00", "learn-master-001", "마스터학습상사");
        when(partnerLookupClient.findByPartnerCode("P-2026-0001")).thenReturn(Optional.of(PARTNER));

        matchPartnerWithSystemMaster("learn-master-001", "P-2026-0001")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.matchedPartnerCode").value("P-2026-0001"));

        assertThat(jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_depositor_partner_mapping
                 WHERE normalized_name = '마스터학습상사' AND is_deleted = FALSE
                """, Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("#810 R1: 수동지정 학습은 입금+입금성 source에 한정한다 (출금·CODEF_CARD 학습 금지)")
    void matchPartner_learnsOnlyForDepositAndDepositSources() throws Exception {
        insertNativeWithCounterparty("WITHDRAWAL", "CSV_IMPORT", "3000.00", "learn-wd-001", "출금상대처");
        insertNativeWithCounterparty("DEPOSIT", "CODEF_CARD", "4000.00", "learn-card-001", "카드상대처");
        insertNativeWithCounterparty("DEPOSIT", "CSV_IMPORT", "5000.00", "learn-dep-001", "입금상대처");
        when(partnerLookupClient.findByPartnerCode("P-2026-0001")).thenReturn(Optional.of(PARTNER));

        matchPartner("learn-wd-001", "P-2026-0001").andExpect(status().isOk());
        matchPartner("learn-card-001", "P-2026-0001").andExpect(status().isOk());
        matchPartner("learn-dep-001", "P-2026-0001").andExpect(status().isOk());

        Integer withdrawalLearned = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_depositor_partner_mapping WHERE normalized_name = '출금상대처'",
                Integer.class);
        Integer cardLearned = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_depositor_partner_mapping WHERE normalized_name = '카드상대처'",
                Integer.class);
        Integer depositLearned = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_depositor_partner_mapping WHERE normalized_name = '입금상대처' AND is_deleted = FALSE",
                Integer.class);
        assertThat(withdrawalLearned).isZero();
        assertThat(cardLearned).isZero();
        assertThat(depositLearned).isEqualTo(1);
    }

    @Test
    @DisplayName("#810 R1: 학습 실패(정규화 팽창 120자 초과)는 best-effort로 격리되고 수동 매칭은 커밋된다")
    void matchPartner_learnFailureDoesNotRollBackManualMatch() throws Exception {
        // 'ß'는 Locale.ROOT 대문자화에서 'SS'로 팽창 — raw 100자(컬럼 120 이내) → 정규화 200자 > 120.
        String expandingName = "ß".repeat(100);
        insertNativeWithCounterparty("DEPOSIT", "CSV_IMPORT", "6000.00", "learn-fail-001", expandingName);
        when(partnerLookupClient.findByPartnerCode("P-2026-0001")).thenReturn(Optional.of(PARTNER));

        matchPartner("learn-fail-001", "P-2026-0001")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.matchedPartnerCode").value("P-2026-0001"));

        BankTransaction after = repository.findByExternalRefAndIsDeletedFalse("learn-fail-001").orElseThrow();
        assertThat(after.getMatchedPartnerId()).isEqualTo(PARTNER_ID);
        Integer learned = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_depositor_partner_mapping", Integer.class);
        assertThat(learned).isZero();
    }

    @Test
    @DisplayName("#810 R3: 거래처 조회 일시 장애 행은 저장 없이 격리되고 배치는 계속되며 재시도에서 재처리된다")
    void importCsv_isolatesUnavailableRowAndRetriesOnNextImport() throws Exception {
        seedActiveMapping("삼한테스트상사", PARTNER_ID);
        when(partnerLookupClient.findByPartnerIdResult(PARTNER_ID))
                .thenReturn(PartnerLookupClient.LookupResult.unavailable());

        // 1행(삼한테스트상사 입금)만 조회 장애로 격리 — 2행(출금)은 정상 적재, 배치는 중단되지 않는다.
        importCsv(ms949Csv())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRows").value(2))
                .andExpect(jsonPath("$.data.importedCount").value(1))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(0))
                .andExpect(jsonPath("$.data.staleSkippedCount").value(0))
                .andExpect(jsonPath("$.data.unavailableSkippedCount").value(1))
                .andExpect(jsonPath("$.data.unavailableNames[0]").value("삼한테스트상사"));

        // 격리 행은 저장되지 않는다(중복 오인 방지 — 재시도에서 재처리 가능해야 함).
        assertThat(repository.findByExternalRefAndIsDeletedFalse("BANK-001")).isEmpty();
        assertThat(repository.findByExternalRefAndIsDeletedFalse("BANK-002")).isPresent();

        // 장애 복구 후 재업로드: 격리됐던 행이 자동 매핑과 함께 적재되고, 기존 행만 중복 skip 된다.
        when(partnerLookupClient.findByPartnerIdResult(PARTNER_ID))
                .thenReturn(PartnerLookupClient.LookupResult.found(PARTNER));

        importCsv(ms949Csv())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.importedCount").value(1))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(1))
                .andExpect(jsonPath("$.data.unavailableSkippedCount").value(0));

        BankTransaction retried = repository.findByExternalRefAndIsDeletedFalse("BANK-001").orElseThrow();
        assertThat(retried.getMatchedPartnerId()).isEqualTo(PARTNER_ID);
        assertThat(retried.getPartnerMatchSource()).isEqualTo(PartnerMatchSource.DEPOSITOR_MAPPING);
    }

    @Test
    @DisplayName("#810 R3: 수동지정 거래처 조회 일시 장애는 404가 아닌 재시도 오류(500)로 구분된다")
    void matchPartner_returnsRetryableErrorWhenLookupUnavailable() throws Exception {
        importCsv(ms949Csv()).andExpect(status().isOk());
        when(partnerLookupClient.findByPartnerCodeResult("P-2026-0001"))
                .thenReturn(PartnerLookupClient.LookupResult.unavailable());

        matchPartner("BANK-001", "P-2026-0001")
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.message")
                        .value(org.hamcrest.Matchers.containsString("일시적으로")));

        // 오진(404→중복등록 유도)과 달리 거래는 그대로 미매칭으로 남는다.
        BankTransaction after = repository.findByExternalRefAndIsDeletedFalse("BANK-001").orElseThrow();
        assertThat(after.getMatchedPartnerId()).isNull();
    }

    @Test
    @DisplayName("#810 R1: 매핑 stale(비활성 거래처)은 import 응답에 보류 건수와 정규화 키로 표면화된다")
    void importCsv_surfacesStaleMappingHoldInResponse() throws Exception {
        seedActiveMapping("삼한테스트상사", PARTNER_ID);
        when(partnerLookupClient.findByPartnerId(PARTNER_ID)).thenReturn(Optional.of(new PartnerSummary(
                PARTNER_ID, "P-2026-0001", "삼한테스트상사", null, null, null, "SUSPENDED")));

        importCsv(ms949Csv())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.importedCount").value(2))
                .andExpect(jsonPath("$.data.staleSkippedCount").value(1))
                .andExpect(jsonPath("$.data.staleNormalizedNames[0]").value("삼한테스트상사"));

        BankTransaction row = repository.findByExternalRefAndIsDeletedFalse("BANK-001").orElseThrow();
        assertThat(row.getMatchedPartnerId()).isNull();
        assertThat(row.getPartnerMatchSource()).isNull();
    }

    private void seedActiveMapping(String rawName, UUID partnerId) {
        jdbcTemplate.update("""
                INSERT INTO bank_depositor_partner_mapping
                    (raw_name, normalized_name, partner_id, created_by, is_deleted)
                VALUES (?, ?, ?, 'it', FALSE)
                """, rawName, rawName, partnerId);
    }

    private void insertNativeWithCounterparty(String txnType, String source, String amount,
                                              String externalRef, String counterpartyName) {
        jdbcTemplate.update("""
                INSERT INTO bank_transaction (
                    id, transacted_at, txn_type, amount, description, bank_account_label,
                    counterparty_name, source, external_ref, match_status, created_at, created_by, is_deleted
                ) VALUES (
                    ?, TIMESTAMP '2026-06-23 09:00:00', ?, ?::numeric, '학습게이트', ?,
                    ?, ?, ?, 'UNREFLECTED', NOW(), 'it', FALSE
                )
                """, UUID.randomUUID(), txnType, amount, BANK_ACCOUNT_LABEL, counterpartyName, source, externalRef);
    }

    private org.springframework.test.web.servlet.ResultActions clearAndDeleteMapping(String externalRef)
            throws Exception {
        BankTransaction txn = repository.findByExternalRefAndIsDeletedFalse(externalRef).orElseThrow();
        return mockMvc.perform(patch(BASE_URL + "/match-partner/clear-and-delete-mapping")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "bankAccountLabel": "%s",
                          "transactedAt": "%s",
                          "amount": %s,
                          "externalRef": "%s"
                        }
                        """.formatted(BANK_ACCOUNT_LABEL, txn.getTransactedAt(),
                        txn.getAmount().toPlainString(), externalRef))
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "ACCOUNTANT"));
    }

    private org.springframework.test.web.servlet.ResultActions clearAndDeleteMappingWithSystemMaster(String externalRef)
            throws Exception {
        BankTransaction txn = repository.findByExternalRefAndIsDeletedFalse(externalRef).orElseThrow();
        return mockMvc.perform(patch(BASE_URL + "/match-partner/clear-and-delete-mapping")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "bankAccountLabel": "%s",
                          "transactedAt": "%s",
                          "amount": %s,
                          "externalRef": "%s"
                        }
                        """.formatted(BANK_ACCOUNT_LABEL, txn.getTransactedAt(),
                        txn.getAmount().toPlainString(), externalRef))
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-Is-System-Master", "true"));
    }

    private org.springframework.test.web.servlet.ResultActions importCsv(MockMultipartFile file) throws Exception {
        return mockMvc.perform(multipart(BASE_URL + "/import")
                .file(file)
                .param("bankAccountLabel", BANK_ACCOUNT_LABEL)
                .param("dateColumn", "거래일시")
                .param("depositColumn", "입금액")
                .param("withdrawalColumn", "출금액")
                .param("balanceColumn", "잔액")
                .param("descriptionColumn", "적요")
                .param("counterpartyColumn", "상대")
                .param("externalRefColumn", "참조")
                .param("headerRow", "true")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "ACCOUNTANT"));
    }

    private org.springframework.test.web.servlet.ResultActions matchPartner(String externalRef, String partnerCode)
            throws Exception {
        BankTransaction txn = repository.findByExternalRefAndIsDeletedFalse(externalRef).orElseThrow();
        return mockMvc.perform(patch(BASE_URL + "/match-partner")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "bankAccountLabel": "%s",
                          "transactedAt": "%s",
                          "amount": %s,
                          "externalRef": "%s",
                          "partnerCode": "%s"
                        }
                        """.formatted(BANK_ACCOUNT_LABEL, txn.getTransactedAt(),
                        txn.getAmount().toPlainString(), externalRef, partnerCode))
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "ACCOUNTANT"));
    }

    private org.springframework.test.web.servlet.ResultActions matchPartnerWithSystemMaster(
            String externalRef, String partnerCode) throws Exception {
        BankTransaction txn = repository.findByExternalRefAndIsDeletedFalse(externalRef).orElseThrow();
        return mockMvc.perform(patch(BASE_URL + "/match-partner")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "bankAccountLabel": "%s",
                          "transactedAt": "%s",
                          "amount": %s,
                          "externalRef": "%s",
                          "partnerCode": "%s"
                        }
                        """.formatted(BANK_ACCOUNT_LABEL, txn.getTransactedAt(),
                        txn.getAmount().toPlainString(), externalRef, partnerCode))
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-Is-System-Master", "true"));
    }

    private org.springframework.test.web.servlet.ResultActions clearPartner(String externalRef)
            throws Exception {
        BankTransaction txn = repository.findByExternalRefAndIsDeletedFalse(externalRef).orElseThrow();
        return mockMvc.perform(patch(BASE_URL + "/match-partner/clear")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "bankAccountLabel": "%s",
                          "transactedAt": "%s",
                          "amount": %s,
                          "externalRef": "%s"
                        }
                        """.formatted(BANK_ACCOUNT_LABEL, txn.getTransactedAt(),
                        txn.getAmount().toPlainString(), externalRef))
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "ACCOUNTANT"));
    }

    private org.springframework.test.web.servlet.ResultActions importCsvWithDateColumn(
            MockMultipartFile file,
            String dateColumn) throws Exception {
        return mockMvc.perform(multipart(BASE_URL + "/import")
                .file(file)
                .param("bankAccountLabel", BANK_ACCOUNT_LABEL)
                .param("dateColumn", dateColumn)
                .param("depositColumn", "입금액")
                .param("withdrawalColumn", "출금액")
                .param("balanceColumn", "잔액")
                .param("descriptionColumn", "적요")
                .param("counterpartyColumn", "상대")
                .param("externalRefColumn", "참조")
                .param("headerRow", "true")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "ACCOUNTANT"));
    }

    private static MockMultipartFile ms949Csv() {
        String csv = """
                거래일시,입금액,출금액,잔액,적요,상대,참조
                2026-06-23 09:10,150000,,1150000,삼한테스트상사 입금,삼한테스트상사,BANK-001
                2026-06-23 11:30,,50000,1100000,이체 수수료,국민은행,BANK-002
                """;
        return new MockMultipartFile(
                "file",
                "bank-ms949.csv",
                MediaType.TEXT_PLAIN_VALUE,
                csv.getBytes(Charset.forName("MS949")));
    }

    private static MockMultipartFile sameKeyDifferentExternalRefCsv() {
        String csv = """
                거래일시,입금액,출금액,잔액,적요,상대,참조
                2026-06-23 09:10,150000,,1150000,삼한테스트상사 입금,삼한테스트상사,BANK-DIFF-001
                2026-06-23 09:10,150000,,1300000,동일금액 별도 입금,다른거래처,BANK-DIFF-002
                """;
        return new MockMultipartFile(
                "file",
                "bank-same-key-different-ref.csv",
                MediaType.TEXT_PLAIN_VALUE,
                csv.getBytes(Charset.forName("MS949")));
    }

    private void insertNative(String txnType, String source, String matchStatus, String amount, String externalRef) {
        insertNative(txnType, source, matchStatus, amount, externalRef, "국민 123-456");
    }

    private void insertNative(String txnType, String source, String matchStatus, String amount, String externalRef,
                              String bankAccountLabel) {
        jdbcTemplate.update("""
                INSERT INTO bank_transaction (
                    id, transacted_at, txn_type, amount, description, bank_account_label,
                    source, external_ref, match_status, created_at, created_by, is_deleted
                ) VALUES (
                    ?, TIMESTAMP '2026-06-23 09:00:00', ?, ?::numeric, 'bad', ?,
                    ?, ?, ?, NOW(), 'it', FALSE
                )
                """, UUID.randomUUID(), txnType, amount, bankAccountLabel, source, externalRef, matchStatus);
    }
}
