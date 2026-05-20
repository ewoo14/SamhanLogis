package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.common.ecount.EcountMig5ImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** MIG-5 입금보고서 importer behavior 회귀 가드. */
@ExtendWith(MockitoExtension.class)
class EcountDepositReportImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    @Mock private PartnerLookupClient partnerLookupClient;

    private EcountDepositReportImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountDepositReportImporter(jdbcTemplate, partnerLookupClient);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Long.class)))
                .thenReturn(1L);
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
        lenient().when(partnerLookupClient.findByPartnerNameStrict(anyString()))
                .thenReturn(Optional.of(partner()));
        stubAgingRows(List.of());
    }

    @Test
    void staging_적재_정상() {
        EcountMig5ImportResult result = importer.importCsv(stream(csv(row("2026/05/19 -192", "입금보고서", "25,568,610", "거래처A"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void MIG5_TRANSACTION_TYPE_INVALID() {
        EcountMig5ImportResult result = importer.importCsv(stream(csv(row("2026/05/19 -192", "지출결의서", "1,000", "거래처A"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig5ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG5_TRANSACTION_TYPE_INVALID");
    }

    @Test
    void MIG5_LOOKUP_MISS() {
        when(partnerLookupClient.findByPartnerNameStrict(anyString())).thenReturn(Optional.empty());

        EcountMig5ImportResult result = importer.importCsv(stream(csv(row("2026/05/19 -192", "입금보고서", "1,000", "미등록"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig5ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG5_LOOKUP_MISS");
    }

    @Test
    void MIG5_AMOUNT_INVALID() {
        EcountMig5ImportResult result = importer.importCsv(stream(csv(row("2026/05/19 -192", "입금보고서", "-1", "거래처A"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig5ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG5_AMOUNT_INVALID");
    }

    @Test
    void aging_검증_PASS() {
        EcountMig5ImportResult result = importer.importCsv(stream(csv(row("2026/05/19 -192", "입금보고서", "1,000", "거래처A"))), "tester");

        assertThat(result.agingMismatchCount()).isZero();
    }

    @Test
    void aging_검증_FAIL_MISMATCH_SAMPLE() {
        stubAgingRows(List.<String[]>of(new String[]{"거래처A", "1000", "0"}));

        EcountMig5ImportResult result = importer.importCsv(stream(csv(row("2026/05/19 -192", "입금보고서", "1,000", "거래처A"))), "tester");

        assertThat(result.agingMismatchCount()).isEqualTo(1);
        assertThat(result.agingMismatchSamples().get(0).message()).contains("MIG5_AGING_BALANCE_MISMATCH");
    }

    @Test
    void BOM_INPUT() {
        EcountMig5ImportResult result = importer.importCsv(stream("\uFEFF" + csv(row("2026/05/19 -192", "입금보고서", "1,000", "거래처A"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void aging_원장_없으면_INFO성_skip_flag() {
        when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Long.class)))
                .thenReturn(0L);

        EcountMig5ImportResult result = importer.importCsv(stream(csv(row("2026/05/19 -192", "입금보고서", "1,000", "거래처A"))), "tester");

        assertThat(result.agingValidationSkipped()).isTrue();
        assertThat(result.agingMismatchCount()).isZero();
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private void stubAgingRows(List<String[]> rows) {
        lenient().when(jdbcTemplate.query(anyString(), any(SqlParameterSource.class), any(RowMapper.class)))
                .thenAnswer(invocation -> {
                    RowMapper mapper = invocation.getArgument(2);
                    java.util.ArrayList<Object> mapped = new java.util.ArrayList<>();
                    for (int i = 0; i < rows.size(); i++) {
                        ResultSet rs = mock(ResultSet.class);
                        when(rs.getString("partner_name")).thenReturn(rows.get(i)[0]);
                        when(rs.getString("raw_value")).thenReturn(rows.get(i)[1]);
                        when(rs.getString("aging_value")).thenReturn(rows.get(i)[2]);
                        mapped.add(mapper.mapRow(rs, i));
                    }
                    return mapped;
                });
    }

    private static PartnerSummary partner() {
        return new PartnerSummary(UUID.fromString("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"),
                "P-001", "거래처A", null, null);
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String csv(String rows) {
        return """
                "데이터관리>입금보고서-Excel다운로드"
                "전표번호\t","거래유형\t","금액\t","거래처명\t","적요명\t",""
                """ + rows;
    }

    private static String row(String slipNo, String type, String amount, String partnerName) {
        return "\"%s\t\",\"%s\t\",\"%s\",\"%s\t\",\"적요\t\",\"\"\n"
                .formatted(slipNo, type, amount, partnerName);
    }
}
