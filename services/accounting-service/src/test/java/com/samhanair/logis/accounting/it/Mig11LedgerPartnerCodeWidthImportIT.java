package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.service.EcountSalesLedgerImporter;
import com.samhanair.logis.common.ecount.EcountMig11Result;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.util.UUID;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/** 실 MIG-11 sales ledger importer가 86자 거래처코드를 staging에 적재하는지 검증한다. */
@SpringBootTest(classes = AccountingServiceApplication.class)
class Mig11LedgerPartnerCodeWidthImportIT extends AbstractPostgresIT {

    @Autowired private EcountSalesLedgerImporter salesLedgerImporter;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private DynamicPermissionClient permissionClient;

    @BeforeEach
    void clean() {
        jdbcTemplate.update("DELETE FROM staging.ecount_sales_ledger_raw");
    }

    @Test
    @DisplayName("MIG-11 실 importer는 86자 partnerCode XLSX를 행 거부 없이 import한다")
    void imports86CharacterPartnerCode() throws Exception {
        String code = "M".repeat(86);
        EcountMig11Result result = salesLedgerImporter.importXlsx(workbook(code), "mig11-width-it");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
        assertThat(jdbcTemplate.queryForObject("""
                SELECT partner_code FROM staging.ecount_sales_ledger_raw
                 WHERE source_file_hash = ?
                """, String.class, result.sourceFileHash())).isEqualTo(code);
    }

    private static java.io.InputStream workbook(String partnerCode) throws Exception {
        try (Workbook workbook = new XSSFWorkbook()) {
            var sheet = workbook.createSheet("매출장");
            String[] headers = {"월/일", "유형명", "전자구분", "거래처코드", "거래처명", "적요",
                    "매출공급가액", "매출부가세", "매출합계"};
            Row header = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                header.createCell(i).setCellValue(headers[i]);
            }
            Row row = sheet.createRow(1);
            row.createCell(0).setCellValue("2026/07/20 - 1");
            row.createCell(1).setCellValue("매출");
            row.createCell(2).setCellValue("전자");
            row.createCell(3).setCellValue(partnerCode);
            row.createCell(4).setCellValue("86자 거래처");
            row.createCell(5).setCellValue("MIG-11 폭 회귀");
            row.createCell(6).setCellValue(new BigDecimal("1000").doubleValue());
            row.createCell(7).setCellValue(new BigDecimal("100").doubleValue());
            row.createCell(8).setCellValue(new BigDecimal("1100").doubleValue());
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            workbook.write(output);
            return new java.io.ByteArrayInputStream(output.toByteArray());
        }
    }
}
