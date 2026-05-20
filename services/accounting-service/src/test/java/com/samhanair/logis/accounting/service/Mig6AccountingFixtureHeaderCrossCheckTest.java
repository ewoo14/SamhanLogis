package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import java.io.InputStream;
import org.junit.jupiter.api.Test;

class Mig6AccountingFixtureHeaderCrossCheckTest {

    @Test
    void bankAccount_fixture_BOM과_header를_검증한다() throws Exception {
        assertFixture("/fixtures/mig6-bank-account.csv", EcountBankAccountImporter.HEADERS);
    }

    @Test
    void fixedAssetType_fixture_BOM과_header를_검증한다() throws Exception {
        assertFixture("/fixtures/mig6-fixed-asset-type.csv", EcountFixedAssetTypeImporter.HEADERS);
    }

    private static void assertFixture(String path, String[] expectedHeaders) throws Exception {
        try (InputStream input = Mig6AccountingFixtureHeaderCrossCheckTest.class.getResourceAsStream(path)) {
            assertThat(input).isNotNull();
            byte[] bytes = input.readAllBytes();
            assertThat(bytes).startsWith((byte) 0xEF, (byte) 0xBB, (byte) 0xBF);
            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(bytes);
            EcountCsvSupport.validateHeader(parsed.header(), expectedHeaders);
        }
    }
}
