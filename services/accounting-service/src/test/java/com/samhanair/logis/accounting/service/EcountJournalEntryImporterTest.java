package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.web.dto.EcountVoucherImportResult;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** MIG-3 회계전표분개 importer RED 가드. */
@ExtendWith(MockitoExtension.class)
class EcountJournalEntryImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    @Mock private PartnerLookupClient partnerLookupClient;

    private EcountJournalEntryImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountJournalEntryImporter(jdbcTemplate, partnerLookupClient);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000401"));
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
        lenient().when(jdbcTemplate.queryForList(
                        org.mockito.ArgumentMatchers.contains("staging.ecount_account_map"),
                        any(SqlParameterSource.class),
                        eq(String.class)))
                .thenReturn(List.of("101"));
        lenient().when(partnerLookupClient.findByPartnerNameStrict("삼한상사"))
                .thenReturn(Optional.of(new PartnerSummary(
                        UUID.fromString("00000000-0000-0000-0000-000000000101"),
                        "P-001", "삼한상사", "123-45-67890", "서울")));
    }

    @Test
    void importCsv_차대일치_journal은_POSTED로_보고한다() {
        EcountVoucherImportResult result = importer.importCsv(stream(journalEntryCsv("""
                "2026/05/01 -1-1\t","현금\t","삼한상사\t","1,000\t","0\t","입금\t"
                "2026/05/01 -1-2\t","매출\t","삼한상사\t","0\t","1,000\t","입금\t"
                """)), "tester");

        assertThat(result.totalRows()).isEqualTo(2);
        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.posted()).isEqualTo(1);
        assertThat(result.draft()).isZero();
        assertThat(result.rejected()).isZero();
    }

    @Test
    void importCsv_차대불일치_journal은_DRAFT_유지하고_warn으로_보고한다() {
        EcountVoucherImportResult result = importer.importCsv(stream(journalEntryCsv("""
                "2026/05/01 -1-1\t","현금\t","삼한상사\t","1,000\t","0\t","입금\t"
                "2026/05/01 -1-2\t","매출\t","삼한상사\t","0\t","900\t","입금\t"
                """)), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.posted()).isZero();
        assertThat(result.draft()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
        assertThat(result.warnings())
                .extracting(EcountVoucherImportResult.ImportWarning::errorCode)
                .containsExactly("MIG3_JOURNAL_BALANCE_MISMATCH");
    }

    @Test
    void importCsv_account_lookup_miss는_MIG3_LOOKUP_MISS로_reject한다() {
        when(jdbcTemplate.queryForList(
                org.mockito.ArgumentMatchers.contains("staging.ecount_account_map"),
                any(SqlParameterSource.class),
                eq(String.class))).thenReturn(List.of());

        EcountVoucherImportResult result = importer.importCsv(stream(journalEntryCsv("""
                "2026/05/01 -1-1\t","미등록계정\t","삼한상사\t","1,000\t","0\t","입금\t"
                """)), "tester");

        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsExactly("MIG3_LOOKUP_MISS");
        assertThat(result.rejectedSample().get(0).message()).contains("미등록계정");
    }

    @Test
    void importCsv_account_lookup_다중매칭은_MIG3_LOOKUP_AMBIGUOUS로_reject한다() {
        when(jdbcTemplate.queryForList(
                org.mockito.ArgumentMatchers.contains("staging.ecount_account_map"),
                any(SqlParameterSource.class),
                eq(String.class))).thenReturn(List.of("101", "102"));

        EcountVoucherImportResult result = importer.importCsv(stream(journalEntryCsv("""
                "2026/05/01 -1-1\t","현금\t","삼한상사\t","1,000\t","0\t","입금\t",""
                """)), "tester");

        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsExactly("MIG3_LOOKUP_AMBIGUOUS");
    }

    @Test
    void importCsv_행별_형식오류가_다른행_import를_막지_않는다() {
        EcountVoucherImportResult result = importer.importCsv(stream(journalEntryCsv("""
                "bad-key\t","현금\t","삼한상사\t","1,000\t","0\t","오류\t",""
                "2026/05/01 -1-1\t","현금\t","삼한상사\t","1,000\t","0\t","입금\t",""
                "2026/05/01 -1-2\t","매출\t","삼한상사\t","0\t","1,000\t","입금\t",""
                """)), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsExactly("MIG3_VOUCHER_NO_INVALID");
    }

    @Test
    void importCsv_lineSequence_순서를_보존한다() {
        importer.importCsv(stream(journalEntryCsv("""
                "2026/05/01 -1-1\t","현금\t","삼한상사\t","1,000\t","0\t","입금\t"
                "2026/05/01 -1-2\t","매출\t","삼한상사\t","0\t","500\t","입금\t"
                "2026/05/01 -1-3\t","매출\t","삼한상사\t","0\t","500\t","입금\t"
                """)), "tester");

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(anyString(), params.capture());
        assertThat(params.getAllValues().stream()
                .filter(p -> p.hasValue("lineNo"))
                .map(p -> (Integer) p.getValue("lineNo"))
                .distinct()
                .toList()).containsExactly(1, 2, 3);
    }

    @Test
    void importCsv_같은_journalNo_group_의_sibling_reject_시_group_전체_reject() {
        // Codex BE H2 cycle 2 — 같은 group 안에 1 row 라도 lookup miss 등으로 reject 되면 group 전체 거부.
        // line 2 는 미등록 계정 → reject. line 1 은 정상이지만 group 차원에서 MIG3_JOURNAL_GROUP_INVALID 처리.
        when(jdbcTemplate.queryForList(
                        org.mockito.ArgumentMatchers.contains("staging.ecount_account_map"),
                        any(SqlParameterSource.class),
                        eq(String.class)))
                .thenAnswer(invocation -> {
                    SqlParameterSource src = invocation.getArgument(1);
                    String accountName = (String) src.getValue("accountName");
                    return "미등록계정".equals(accountName) ? List.of() : List.of("101");
                });

        EcountVoucherImportResult result = importer.importCsv(stream(journalEntryCsv("""
                "2026/05/01 -1-1\t","현금\t","삼한상사\t","1,000\t","0\t","입금\t",""
                "2026/05/01 -1-2\t","미등록계정\t","삼한상사\t","0\t","1,000\t","입금\t",""
                """)), "tester");

        // 두 row 모두 reject. line 2 = MIG3_LOOKUP_MISS, line 1 = MIG3_JOURNAL_GROUP_INVALID (poison 방지).
        assertThat(result.rejected()).isEqualTo(2);
        assertThat(result.imported()).isZero();
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsExactlyInAnyOrder("MIG3_LOOKUP_MISS", "MIG3_JOURNAL_GROUP_INVALID");
    }

    @Test
    void importCsv_음수_금액은_MIG3_SLIP_AMOUNT_INVALID로_reject() {
        // Codex BE H3 cycle 2 — 음수 차변/대변 금액은 BusinessException 으로 row reject (DB CHECK 도달 전).
        EcountVoucherImportResult result = importer.importCsv(stream(journalEntryCsv("""
                "2026/05/01 -1-1\t","현금\t","삼한상사\t","-1,000\t","0\t","음수\t",""
                """)), "tester");

        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsExactly("MIG3_SLIP_AMOUNT_INVALID");
    }

    @Test
    void importCsv_동일_line_no_에_다른_데이터_존재_시_MIG3_JOURNAL_LINE_DUPLICATE() {
        // Codex BE H1 cycle 2 — (journal_id, line_no) 동일하지만 다른 데이터인 line 이 이미 존재할 때
        // silent overwrite 대신 MIG3_JOURNAL_LINE_DUPLICATE 로 reject.
        java.util.Map<String, Object> conflictingLine = new java.util.HashMap<>();
        conflictingLine.put("account_code", "DIFFERENT");
        conflictingLine.put("debit_amount", new java.math.BigDecimal("999"));
        conflictingLine.put("credit_amount", java.math.BigDecimal.ZERO);
        conflictingLine.put("partner_id", null);
        conflictingLine.put("memo", "다른_데이터");
        conflictingLine.put("is_deleted", false);
        lenient().when(jdbcTemplate.queryForList(
                org.mockito.ArgumentMatchers.contains("FROM journal_lines"),
                any(SqlParameterSource.class)))
                .thenReturn(java.util.List.of(conflictingLine));

        EcountVoucherImportResult result = importer.importCsv(stream(journalEntryCsv("""
                "2026/05/01 -1-1\t","현금\t","삼한상사\t","1,000\t","0\t","입금\t",""
                "2026/05/01 -1-2\t","매출\t","삼한상사\t","0\t","1,000\t","입금\t",""
                """)), "tester");

        assertThat(result.rejected()).isEqualTo(2);
        assertThat(result.rejectedSample())
                .extracting(EcountVoucherImportResult.RejectedRow::errorCode)
                .containsOnly("MIG3_JOURNAL_LINE_DUPLICATE");
    }

    @Test
    void importCsv_soft_deleted_line은_새_uuid_삽입이_아니라_기존_row_UPDATE로_복구한다() {
        // Codex H1/M4 cycle 2 — soft-deleted line 이 존재할 때 새 INSERT 가 아니라 기존 row 를 UPDATE.
        // active journal 이 이미 존재하는 케이스 (M4 — soft-deleted journal + active 동시 존재 시
        // active 만 update 하여 partial unique conflict 회피).
        lenient().when(jdbcTemplate.queryForObject(
                org.mockito.ArgumentMatchers.contains("WHERE journal_no = :journalNo AND is_deleted = FALSE"),
                any(SqlParameterSource.class),
                eq(Integer.class))).thenReturn(1);
        // findExistingLine — soft-deleted line 반환 시 restore UPDATE 경로로 가도록.
        java.util.Map<String, Object> deletedLine = new java.util.HashMap<>();
        deletedLine.put("account_code", "old");
        deletedLine.put("debit_amount", java.math.BigDecimal.ZERO);
        deletedLine.put("credit_amount", java.math.BigDecimal.ZERO);
        deletedLine.put("partner_id", null);
        deletedLine.put("memo", null);
        deletedLine.put("is_deleted", true);
        lenient().when(jdbcTemplate.queryForList(
                org.mockito.ArgumentMatchers.contains("FROM journal_lines"),
                any(SqlParameterSource.class)))
                .thenReturn(java.util.List.of(deletedLine));

        EcountVoucherImportResult result = importer.importCsv(stream(journalEntryCsv("""
                "2026/05/01 -1-1\t","현금\t","삼한상사\t","1,000\t","0\t","입금\t",""
                "2026/05/01 -1-2\t","매출\t","삼한상사\t","0\t","1,000\t","입금\t",""
                """)), "tester");

        assertThat(result.updated()).isEqualTo(1);
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(sql.capture(), any(SqlParameterSource.class));
        // soft-deleted line restore UPDATE — is_deleted = FALSE 로 되돌리고 new UUID 사용 X.
        assertThat(sql.getAllValues())
                .anySatisfy(value -> assertThat(value)
                        .contains("UPDATE journal_lines")
                        .contains("is_deleted = FALSE")
                        .contains("WHERE journal_id = :journalId AND line_no = :lineNo AND is_deleted = TRUE"));
        // 새 INSERT line 은 호출되지 않아야 함 (UUID 재사용).
        assertThat(sql.getAllValues())
                .noneSatisfy(value -> assertThat(value)
                        .contains("INSERT INTO journal_lines")
                        .contains("gen_random_uuid()"));
    }

    @Test
    void rawHeaderCrossCheck() throws Exception {
        try (InputStream fixture = EcountJournalEntryImporterTest.class
                .getResourceAsStream("/ecount-raw-fixtures/voucher-journal-entry.csv")) {
            assertThat(fixture).isNotNull();
            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(fixture.readAllBytes());
            EcountCsvSupport.validateHeader(parsed.header(), EcountJournalEntryImporter.HEADERS);
            // raw 파일은 docs/migration/ecount-data/raw/ 에 회사/자택 PC 에만 존재 (CI Linux 미존재).
            Path raw = rawPath("회계전표분개-Excel다운로드(20260501~20260519_1).csv");
            org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(raw),
                    "raw CSV (" + raw + ") 미존재 → cross-check skip");
            EcountCsvSupport.ParsedCsv rawCsv = EcountCsvSupport.parse(Files.readAllBytes(raw));
            assertThat(normalized(parsed.header())).containsExactly(normalized(rawCsv.header()));
        }
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String journalEntryCsv(String rows) {
        return """
                "데이터관리>회계전표분개-Excel다운로드"
                "일자-No-순번\t","계정명\t","거래처명\t","차변금액\t","대변금액\t","적요\t",""
                """ + rows;
    }

    private static Path rawPath(String fileName) {
        Path fromRoot = Path.of("docs", "migration", "ecount-data", "raw", fileName);
        if (Files.exists(fromRoot)) {
            return fromRoot;
        }
        return Path.of("..", "..", "docs", "migration", "ecount-data", "raw", fileName).normalize();
    }

    private static String[] normalized(String[] row) {
        return java.util.Arrays.stream(row)
                .map(EcountCsvSupport::stripCell)
                .toArray(String[]::new);
    }
}
