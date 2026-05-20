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
    void importCsv_soft_deleted_line은_새_uuid_삽입이_아니라_CTE로_복구한다() {
        lenient().when(jdbcTemplate.queryForObject(
                org.mockito.ArgumentMatchers.contains("WHERE journal_no = :journalNo AND is_deleted = FALSE"),
                any(SqlParameterSource.class),
                eq(Integer.class))).thenReturn(1);

        EcountVoucherImportResult result = importer.importCsv(stream(journalEntryCsv("""
                "2026/05/01 -1-1\t","현금\t","삼한상사\t","1,000\t","0\t","입금\t",""
                "2026/05/01 -1-2\t","매출\t","삼한상사\t","0\t","1,000\t","입금\t",""
                """)), "tester");

        assertThat(result.updated()).isEqualTo(1);
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(sql.capture(), any(SqlParameterSource.class));
        assertThat(sql.getAllValues())
                .anySatisfy(value -> assertThat(value)
                        .contains("WITH restored AS")
                        .contains("WHERE journal_id = :journalId AND line_no = :lineNo AND is_deleted = TRUE")
                        .contains("ON CONFLICT (journal_id, line_no) DO UPDATE"));
    }

    @Test
    void rawHeaderCrossCheck() throws Exception {
        try (InputStream fixture = EcountJournalEntryImporterTest.class
                .getResourceAsStream("/ecount-raw-fixtures/voucher-journal-entry.csv")) {
            assertThat(fixture).isNotNull();
            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(fixture.readAllBytes());
            EcountCsvSupport.validateHeader(parsed.header(), EcountJournalEntryImporter.HEADERS);
            EcountCsvSupport.ParsedCsv raw = EcountCsvSupport.parse(Files.readAllBytes(rawPath(
                    "회계전표분개-Excel다운로드(20260501~20260519_1).csv")));
            assertThat(normalized(parsed.header())).containsExactly(normalized(raw.header()));
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
