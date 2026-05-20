package com.samhanair.logis.common.ecount;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

class EcountXlsxSupportTest {

    private static final String[] HEADERS = {"월/일", "거래처명", "매출합계"};

    @Test
    void 정상_parse는_meta_row를_건너뛰고_hash를_계산한다() {
        EcountXlsxSupport.ParsedXlsx parsed = EcountXlsxSupport.parse(workbook(
                new String[]{"회사명 : 테스트 / 매출장"},
                HEADERS,
                new String[]{"2026/05/01 -1", "거래처A", "1,100"}
        ), HEADERS);

        assertThat(parsed.headerRowNo()).isEqualTo(2);
        assertThat(parsed.dataRowCount()).isEqualTo(1);
        assertThat(parsed.rows().get(0).sourceRowNo()).isEqualTo(3);
        assertThat(parsed.rows().get(0).get("거래처명")).isEqualTo("거래처A");
        assertThat(parsed.sourceFileHash()).hasSize(64);
    }

    @Test
    void header_mismatch는_MIG11_HEADER_MISMATCH() {
        InputStream xlsx = workbook(new String[]{"회사명 : 테스트 / 매출장"},
                new String[]{"월/일", "거래처", "매출합계"},
                new String[]{"2026/05/01 -1", "거래처A", "1,100"});

        assertThatThrownBy(() -> EcountXlsxSupport.parse(xlsx, HEADERS))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.MIG11_HEADER_MISMATCH);
    }

    @Test
    void 빈_row는_skip한다() {
        EcountXlsxSupport.ParsedXlsx parsed = EcountXlsxSupport.parse(workbook(
                null,
                HEADERS,
                new String[]{"2026/05/01 -1", "거래처A", "1,100"},
                new String[]{"", "", ""},
                new String[]{"2026/05/02 -2", "거래처B", "2,200"}
        ), HEADERS);

        assertThat(parsed.dataRowCount()).isEqualTo(2);
    }

    @Test
    void footer_정확_매칭_합계_총계는_skip한다() {
        EcountXlsxSupport.ParsedXlsx parsed = EcountXlsxSupport.parse(workbook(
                null,
                HEADERS,
                new String[]{"2026/05/01 -1", "거래처A", "1,100"},
                new String[]{"합계", "", "1,100"},
                new String[]{"총계", "", "1,100"}
        ), HEADERS);

        assertThat(parsed.dataRowCount()).isEqualTo(1);
    }

    @Test
    void 한글_cell은_깨지지_않고_strip된다() {
        EcountXlsxSupport.ParsedXlsx parsed = EcountXlsxSupport.parse(workbook(
                new String[]{"회사명 : 테스트 / 매출장"},
                HEADERS,
                new String[]{"2026/05/01 -1", "거래처A\t", "1,100"}
        ), HEADERS);

        assertThat(parsed.rows().get(0).get("거래처명")).isEqualTo("거래처A");
    }

    private static InputStream workbook(String[] metaRow, String[] header, String[]... rows) {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("매입 매출장");
            int rowIndex = 0;
            if (metaRow != null) {
                writeRow(sheet.createRow(rowIndex++), metaRow);
            }
            writeRow(sheet.createRow(rowIndex++), header);
            for (String[] row : rows) {
                writeRow(sheet.createRow(rowIndex++), row);
            }
            workbook.write(out);
            return new ByteArrayInputStream(out.toByteArray());
        } catch (java.io.IOException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static void writeRow(Row row, String[] values) {
        for (int i = 0; i < values.length; i++) {
            row.createCell(i).setCellValue(values[i]);
        }
    }
}
