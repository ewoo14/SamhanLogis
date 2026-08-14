package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

/** MIG-4 classpath fixture 헤더와 운영 raw 헤더의 byte-for-byte 정규화 교차 확인. */
class Mig4FixtureHeaderCrossCheckTest {

    @Test
    void taxInvoiceFixtureHeaderMatchesRaw() throws Exception {
        assertHeader("/fixtures/mig4-tax-invoice.csv",
                "세금계산서용 출고전표-Excel다운로드(20260501~20260519_1).csv",
                EcountTaxInvoiceImporter.HEADERS);
    }

    @Test
    void salesSlipLineFixtureHeaderMatchesRaw() throws Exception {
        assertHeader("/fixtures/mig4-sales-slip-line.csv",
                "출고전표-Excel다운로드(20260501~20260519_1).csv",
                EcountSalesSlipLineImporter.HEADERS);
    }

    @Test
    void salesPurchaseSummaryFixtureHeaderMatchesRaw() throws Exception {
        assertHeader("/fixtures/mig4-sales-purchase-summary.csv",
                "매출매입내역-Excel다운로드(20260501~20260519_1).csv",
                EcountSalesPurchaseSummaryImporter.HEADERS);
    }

    @Test
    void orderFixtureHeaderMatchesRaw() throws Exception {
        assertHeader("/fixtures/mig4-order.csv",
                "주문서-Excel다운로드(20260501~20260519_1).csv",
                EcountOrderImporter.HEADERS);
    }

    private static void assertHeader(String fixturePath, String rawFileName, String[] expected) throws Exception {
        try (InputStream fixture = Mig4FixtureHeaderCrossCheckTest.class.getResourceAsStream(fixturePath)) {
            assertThat(fixture).isNotNull();
            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(fixture.readAllBytes());
            EcountMig4ImportSupport.validateHeader(parsed.header(), expected);

            Path raw = rawPath(rawFileName);
            Assumptions.assumeTrue(Files.exists(raw), "raw CSV 미존재 → cross-check skip: " + raw);
            EcountCsvSupport.ParsedCsv rawCsv = EcountCsvSupport.parse(Files.readAllBytes(raw));
            assertThat(normalized(parsed.header())).containsExactly(normalized(rawCsv.header()));
        }
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
