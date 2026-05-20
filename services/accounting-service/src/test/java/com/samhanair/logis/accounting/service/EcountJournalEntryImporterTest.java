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
        lenient().when(partnerLookupClient.findByPartnerName("삼한상사"))
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
    void rawHeaderCrossCheck() throws Exception {
        try (InputStream fixture = EcountJournalEntryImporterTest.class
                .getResourceAsStream("/ecount-raw-fixtures/voucher-journal-entry.csv")) {
            assertThat(fixture).isNotNull();
            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(fixture.readAllBytes());
            EcountCsvSupport.validateHeader(parsed.header(), EcountJournalEntryImporter.HEADERS);
        }
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String journalEntryCsv(String rows) {
        return """
                "데이터관리>회계전표분개-Excel다운로드"
                "일자-No-순번\t","계정명\t","거래처명\t","차변금액\t","대변금액\t","적요\t"
                """ + rows;
    }
}
