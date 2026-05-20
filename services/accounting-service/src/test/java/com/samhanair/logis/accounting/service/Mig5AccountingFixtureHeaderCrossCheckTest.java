package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig5ImportSupport;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

/** MIG-5 accounting fixture 헤더와 운영 raw 헤더 교차 확인. */
class Mig5AccountingFixtureHeaderCrossCheckTest {

    @Test
    void expenseVoucherFixtureHeaderMatchesRaw() throws Exception {
        assertHeader("/fixtures/mig5-expense-voucher.csv",
                "지출결의서-Excel다운로드(20260501~20260519_1).csv");
    }

    @Test
    void depositReportFixtureHeaderMatchesRaw() throws Exception {
        assertHeader("/fixtures/mig5-deposit-report.csv",
                "입금보고서-Excel다운로드(20260501~20260519_1).csv");
    }

    private static void assertHeader(String fixturePath, String rawFileName) throws Exception {
        try (InputStream fixture = Mig5AccountingFixtureHeaderCrossCheckTest.class.getResourceAsStream(fixturePath)) {
            assertThat(fixture).isNotNull();
            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(fixture.readAllBytes());
            EcountMig5ImportSupport.validateHeader(parsed.header(), AbstractEcountMig5CashImporter.HEADERS);

            Path raw = Path.of("docs", "migration", "ecount-data", "raw", rawFileName);
            Assumptions.assumeTrue(Files.exists(raw), "raw CSV 미존재 → cross-check skip: " + raw);
            EcountCsvSupport.ParsedCsv rawCsv = EcountCsvSupport.parse(Files.readAllBytes(raw));
            assertThat(normalized(parsed.header())).containsExactly(normalized(rawCsv.header()));
        }
    }

    private static String[] normalized(String[] row) {
        return java.util.Arrays.stream(row)
                .map(EcountCsvSupport::stripCell)
                .toArray(String[]::new);
    }
}
