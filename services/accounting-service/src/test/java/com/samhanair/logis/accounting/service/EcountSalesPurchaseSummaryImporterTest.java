package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.web.dto.EcountMig4ImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** MIG-4 매출매입내역 importer behavior 회귀 가드. */
@ExtendWith(MockitoExtension.class)
class EcountSalesPurchaseSummaryImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;

    private EcountSalesPurchaseSummaryImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountSalesPurchaseSummaryImporter(jdbcTemplate);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
        lenient().when(jdbcTemplate.query(anyString(), any(SqlParameterSource.class),
                org.mockito.ArgumentMatchers.<RowMapper<Object>>any())).thenReturn(List.of());
    }

    @Test
    void staging_적재_정상() {
        EcountMig4ImportResult result = importer.importCsv(stream(summaryCsv(row("2026/05/01 -1", "110,000"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void 검증_PASS_도메인_합계_일치() {
        EcountMig4ImportResult result = importer.importCsv(stream(summaryCsv(row("2026/05/01 -1", "110,000"))), "tester");

        assertThat(result.mismatchCount()).isZero();
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void 검증_FAIL_MISMATCH_SAMPLE은_MIG4_SUMMARY_BALANCE_MISMATCH를_보고한다() {
        when(jdbcTemplate.query(anyString(), any(SqlParameterSource.class), any(RowMapper.class)))
                .thenAnswer(invocation -> {
                    RowMapper mapper = invocation.getArgument(2);
                    java.util.ArrayList<Object> rows = new java.util.ArrayList<>();
                    for (int i = 1; i <= 6; i++) {
                        java.sql.ResultSet rs = org.mockito.Mockito.mock(java.sql.ResultSet.class);
                        when(rs.getString("business_key")).thenReturn("2026-05-%02d".formatted(i));
                        when(rs.getString("raw_value")).thenReturn("110000.00");
                        when(rs.getString("domain_value")).thenReturn("0");
                        rows.add(mapper.mapRow(rs, i - 1));
                    }
                    return rows;
                });

        EcountMig4ImportResult result = importer.importCsv(stream(summaryCsv(row("2026/05/01 -1", "110,000"))), "tester");

        assertThat(result.mismatchCount()).isEqualTo(6);
        assertThat(result.mismatchSamples()).hasSize(5);
        assertThat(result.mismatchSamples().get(0).message()).contains("MIG4_SUMMARY_BALANCE_MISMATCH");
    }

    @Test
    void footer_월계_누계_timestamp는_skip한다() {
        EcountMig4ImportResult result = importer.importCsv(stream(summaryCsv(
                row("2026/05/01 -1", "110,000") +
                "\"2026/05  계 (2237 건)\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n" +
                "\"누계 (2237 건)\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n" +
                "\"2026/05/19  오후 3:13:45\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\"\n")), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.skipped()).isEqualTo(3);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void BOM_INPUT을_정상_strip한다() {
        EcountMig4ImportResult result = importer.importCsv(stream("\uFEFF" + summaryCsv(row("2026/05/01 -1", "110,000"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void rawHeaderCrossCheck() {
        EcountMig4ImportResult result = importer.importCsv(stream(summaryCsv(row("2026/05/01 -1", "110,000"))), "tester");

        assertThat(result.totalRows()).isEqualTo(1);
    }

    @Test
    void malformed_row_빈일자_nonblank_금액_MIG4_DATE_INVALID() {
        EcountMig4ImportResult result = importer.importCsv(stream(summaryCsv(
                "\"\",\"?멸툑怨꾩궛??t\",\"?꾩옄-??t\",\"?쇳븳?곸궗\t\",\"malformed\t\",\"\",\"\",\"100,000\",\"10,000\",\"110,000\",\"\"\n"
        )), "tester");

        assertThat(result.skipped()).isZero();
        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample()).extracting(EcountMig4ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG4_DATE_INVALID");
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String summaryCsv(String rows) {
        return """
                "데이터관리>매출/매입내역-Excel다운로드"
                "월/일\t","유형명\t","전자구분\t","거래처명\t","세부내역\t","매입공급가액\t","매입부가세\t","매출공급가액\t","매출부가세\t","매출합계\t",""
                """ + rows;
    }

    private static String row(String monthDay, String total) {
        return "\"%s\t\",\"세금계산서\t\",\"전자-신\t\",\"삼한상사\t\",\"정상\t\",\"\",\"\",\"100,000\",\"10,000\",\"%s\",\"\"\n"
                .formatted(monthDay, total);
    }
}
