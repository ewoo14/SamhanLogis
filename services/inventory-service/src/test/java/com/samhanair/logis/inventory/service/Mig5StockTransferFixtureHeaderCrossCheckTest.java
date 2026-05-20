package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig5ImportSupport;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

/** MIG-5 창고이동 fixture 헤더와 운영 raw 헤더 교차 확인. */
class Mig5StockTransferFixtureHeaderCrossCheckTest {

    @Test
    void stockTransferFixtureHeaderMatchesRaw() throws Exception {
        try (InputStream fixture = getClass().getResourceAsStream("/fixtures/mig5-stock-transfer.csv")) {
            assertThat(fixture).isNotNull();
            byte[] fixtureContent = fixture.readAllBytes();
            assertUtf8Bom(fixtureContent);
            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(fixtureContent);
            EcountMig5ImportSupport.validateHeader(parsed.header(), EcountStockTransferImporter.HEADERS);

            Path raw = Path.of("docs", "migration", "ecount-data", "raw",
                    "창고이동-Excel다운로드(20260501~20260519_1).csv");
            Assumptions.assumeTrue(Files.exists(raw), "raw CSV 미존재 → cross-check skip: " + raw);
            byte[] rawContent = Files.readAllBytes(raw);
            assertUtf8Bom(rawContent);
            EcountCsvSupport.ParsedCsv rawCsv = EcountCsvSupport.parse(rawContent);
            assertThat(normalized(parsed.header())).containsExactly(normalized(rawCsv.header()));
        }
    }

    private static void assertUtf8Bom(byte[] content) {
        assertThat(content).startsWith(new byte[] {
                (byte) 0xEF, (byte) 0xBB, (byte) 0xBF
        });
    }

    private static String[] normalized(String[] row) {
        return java.util.Arrays.stream(row)
                .map(EcountCsvSupport::stripCell)
                .toArray(String[]::new);
    }
}
