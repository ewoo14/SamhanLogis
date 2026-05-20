package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.ecount.EcountMig11Result;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.sql.ResultSet;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** MIG-11 매입장 XLSX importer behavior 회귀 가드. */
@ExtendWith(MockitoExtension.class)
class EcountPurchaseLedgerImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;

    private EcountPurchaseLedgerImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountPurchaseLedgerImporter(jdbcTemplate);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
        stubDailyClosingRows(List.of());
    }

    @Test
    void 정상_적재() {
        EcountMig11Result result = importer.importXlsx(xlsx(row("2026/05/01 -28", "거래처A", "1,000", "100")), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void header_mismatch는_MIG11_HEADER_MISMATCH() {
        assertThatThrownBy(() -> importer.importXlsx(xlsxWithHeader(new String[]{"월/일", "거래처명"}, row("2026/05/01 -28", "거래처A", "1", "0")), "tester"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.MIG11_HEADER_MISMATCH);
    }

    @Test
    void amount_invalid는_rejected_sample() {
        EcountMig11Result result = importer.importXlsx(xlsx(row("2026/05/01 -28", "거래처A", "BAD", "100")), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig11Result.RejectedRow::errorCode)
                .containsExactly("MIG11_AMOUNT_INVALID");
    }

    @Test
    void date_invalid는_rejected_sample() {
        EcountMig11Result result = importer.importXlsx(xlsx(row("2026-05-01", "거래처A", "1,000", "100")), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig11Result.RejectedRow::errorCode)
                .containsExactly("MIG11_DATE_INVALID");
    }

    @Test
    void duplicate_source_hash_row는_skipped() {
        when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(0);

        EcountMig11Result result = importer.importXlsx(xlsx(row("2026/05/01 -28", "거래처A", "1,000", "100")), "tester");

        assertThat(result.skipped()).isEqualTo(1);
        assertThat(result.imported()).isZero();
    }

    @Test
    void multi_row_source_row_no는_여러_row를_적재한다() {
        EcountMig11Result result = importer.importXlsx(xlsx(
                row("2026/05/01 -28", "거래처A", "1,000", "100"),
                row("2026/05/02 -75", "거래처B", "2,000", "200")
        ), "tester");

        assertThat(result.totalRows()).isEqualTo(2);
        assertThat(result.imported()).isEqualTo(2);
    }

    @Test
    void footer_총계는_skip된다() {
        EcountMig11Result result = importer.importXlsx(xlsx(
                row("2026/05/01 -28", "거래처A", "1,000", "100"),
                new String[]{"총계", "", "", "", "", "", "1,000", "100"}
        ), "tester");

        assertThat(result.totalRows()).isEqualTo(1);
        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void daily_closing_mismatch는_warning_sample만_남긴다() {
        stubDailyClosingRows(List.<String[]>of(new String[]{"2026-05-01", "1100.00", "0.00", "1100.00"}));

        EcountMig11Result result = importer.importXlsx(xlsx(row("2026/05/01 -28", "거래처A", "1,000", "100")), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.dailyClosingMismatchCount()).isEqualTo(1);
        assertThat(result.dailyClosingMismatchSamples().get(0).message()).contains("MIG11_DAILY_CLOSING_MISMATCH");
    }

    @Test
    void 빈_row는_skip된다() {
        EcountMig11Result result = importer.importXlsx(xlsx(
                row("2026/05/01 -28", "거래처A", "1,000", "100"),
                new String[]{"", "", "", "", "", "", "", ""}
        ), "tester");

        assertThat(result.totalRows()).isEqualTo(1);
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private void stubDailyClosingRows(List<String[]> rows) {
        lenient().when(jdbcTemplate.query(anyString(), any(SqlParameterSource.class), any(RowMapper.class)))
                .thenAnswer(invocation -> {
                    RowMapper mapper = invocation.getArgument(2);
                    java.util.ArrayList<Object> mapped = new java.util.ArrayList<>();
                    for (int i = 0; i < rows.size(); i++) {
                        ResultSet rs = mock(ResultSet.class);
                        when(rs.getString("transaction_date")).thenReturn(rows.get(i)[0]);
                        when(rs.getString("raw_value")).thenReturn(rows.get(i)[1]);
                        when(rs.getString("closing_value")).thenReturn(rows.get(i)[2]);
                        when(rs.getString("diff_value")).thenReturn(rows.get(i)[3]);
                        mapped.add(mapper.mapRow(rs, i));
                    }
                    return mapped;
                });
    }

    private static InputStream xlsx(String[]... rows) {
        return xlsxWithHeader(EcountPurchaseLedgerImporter.HEADERS, rows);
    }

    private static InputStream xlsxWithHeader(String[] header, String[]... rows) {
        try (org.apache.poi.ss.usermodel.Workbook workbook = new org.apache.poi.xssf.usermodel.XSSFWorkbook();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            org.apache.poi.ss.usermodel.Sheet sheet = workbook.createSheet("매입 매출장");
            writeRow(sheet.createRow(0), new String[]{"회사명 : 테스트 / 매입장"});
            writeRow(sheet.createRow(1), header);
            for (int i = 0; i < rows.length; i++) {
                writeRow(sheet.createRow(i + 2), rows[i]);
            }
            workbook.write(out);
            return new ByteArrayInputStream(out.toByteArray());
        } catch (java.io.IOException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String[] row(String date, String partnerName, String supply, String vat) {
        return new String[]{date, "P001", "세금계산서", "전자-신", partnerName, "적요", supply, vat};
    }

    private static void writeRow(org.apache.poi.ss.usermodel.Row row, String[] values) {
        for (int i = 0; i < values.length; i++) {
            row.createCell(i).setCellValue(values[i]);
        }
    }
}
