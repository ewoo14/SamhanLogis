package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

/** MIG-11 fixture xlsx 헤더가 실제 raw 분석 결과와 같은지 고정한다. */
class Mig11FixtureHeaderCrossCheckTest {

    @Test
    void sales_fixture_header_matches_raw_header() throws Exception {
        assertThat(header("/fixtures/mig11-sales-ledger.xlsx", EcountSalesLedgerImporter.HEADERS.length))
                .containsExactly(EcountSalesLedgerImporter.HEADERS);
    }

    @Test
    void purchase_fixture_header_matches_raw_header() throws Exception {
        assertThat(header("/fixtures/mig11-purchase-ledger.xlsx", EcountPurchaseLedgerImporter.HEADERS.length))
                .containsExactly(EcountPurchaseLedgerImporter.HEADERS);
    }

    private static String[] header(String resource, int width) throws Exception {
        try (InputStream in = Mig11FixtureHeaderCrossCheckTest.class.getResourceAsStream(resource);
             Workbook workbook = new XSSFWorkbook(in)) {
            Row row = workbook.getSheetAt(0).getRow(1);
            DataFormatter formatter = new DataFormatter(java.util.Locale.KOREA);
            String[] values = new String[width];
            for (int i = 0; i < width; i++) {
                values[i] = formatter.formatCellValue(row.getCell(i)).strip();
            }
            return values;
        }
    }
}
