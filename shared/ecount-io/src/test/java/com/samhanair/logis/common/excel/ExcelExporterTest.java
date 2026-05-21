package com.samhanair.logis.common.excel;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * ExcelExporter 단위 테스트 — P1-6.
 *
 * <p>Apache POI 를 직접 활용해 생성된 .xlsx 의 시트명 / 헤더 / 데이터 셀값을 검증.
 * 외부 의존 없음 (순수 Java 단위 테스트).
 */
class ExcelExporterTest {

    @Test
    @DisplayName("헤더 행이 컬럼 순서대로 출력된다")
    void export_headerRow() throws Exception {
        List<ExcelColumn> cols = List.of(
                ExcelColumn.text("거래처코드", "partnerCode"),
                ExcelColumn.text("거래처명",   "name"),
                ExcelColumn.numeric("미수금",  "balance")
        );
        List<Map<String, Object>> rows = List.of();
        byte[] xlsx = ExcelExporter.export(new ExcelExportRequest("테스트시트", cols, rows));

        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
            var sheet = wb.getSheet("테스트시트");
            assertThat(sheet).isNotNull();
            var header = sheet.getRow(0);
            assertThat(header.getCell(0).getStringCellValue()).isEqualTo("거래처코드");
            assertThat(header.getCell(1).getStringCellValue()).isEqualTo("거래처명");
            assertThat(header.getCell(2).getStringCellValue()).isEqualTo("미수금");
        }
    }

    @Test
    @DisplayName("데이터 행이 올바르게 출력된다 — 문자열 / BigDecimal / LocalDate")
    void export_dataRows() throws Exception {
        List<ExcelColumn> cols = List.of(
                ExcelColumn.text("코드",    "code"),
                ExcelColumn.numeric("금액", "amount"),
                ExcelColumn.text("날짜",    "date")
        );

        Map<String, Object> row1 = new HashMap<>();
        row1.put("code",   "P-001");
        row1.put("amount", new BigDecimal("1234567"));
        row1.put("date",   LocalDate.of(2026, 5, 11));

        byte[] xlsx = ExcelExporter.export(new ExcelExportRequest("데이터", cols, List.of(row1)));

        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
            var sheet = wb.getSheet("데이터");
            var dataRow = sheet.getRow(1);
            assertThat(dataRow.getCell(0).getStringCellValue()).isEqualTo("P-001");
            assertThat(dataRow.getCell(1).getNumericCellValue()).isEqualTo(1234567.0);
            assertThat(dataRow.getCell(2).getStringCellValue()).isEqualTo("2026-05-11");
        }
    }

    @Test
    @DisplayName("null 값은 빈 문자열로 처리된다")
    void export_nullValue_emptyString() throws Exception {
        List<ExcelColumn> cols = List.of(ExcelColumn.text("주소", "address"));
        Map<String, Object> row = new HashMap<>();
        row.put("address", null);

        byte[] xlsx = ExcelExporter.export(new ExcelExportRequest("Null테스트", cols, List.of(row)));

        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
            var cell = wb.getSheet("Null테스트").getRow(1).getCell(0);
            assertThat(cell.getStringCellValue()).isEmpty();
        }
    }

    @Test
    @DisplayName("시트명 31자 초과 시 31자로 잘린다")
    void export_longSheetName_truncated() throws Exception {
        String longName = "A".repeat(40);
        byte[] xlsx = ExcelExporter.export(
                new ExcelExportRequest(longName, List.of(ExcelColumn.text("h", "k")), List.of()));

        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
            assertThat(wb.getSheetAt(0).getSheetName()).hasSize(31);
        }
    }

    @Test
    @DisplayName("빈 row 목록도 헤더만 있는 xlsx 를 반환한다")
    void export_emptyRows_onlyHeader() throws Exception {
        List<ExcelColumn> cols = List.of(ExcelColumn.text("컬럼", "key"));
        byte[] xlsx = ExcelExporter.export(new ExcelExportRequest("빈시트", cols, List.of()));

        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
            var sheet = wb.getSheet("빈시트");
            assertThat(sheet.getLastRowNum()).isEqualTo(0); // 헤더 행(0번) 만 존재
        }
    }
}
