package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import java.io.InputStream;
import org.junit.jupiter.api.Test;

/** MIG-3 매출전표 fixture/header cross-check. */
class EcountSalesSlipImporterTest {

    @Test
    void rawHeaderCrossCheck() throws Exception {
        try (InputStream fixture = EcountSalesSlipImporterTest.class
                .getResourceAsStream("/ecount-raw-fixtures/voucher-sales.csv")) {
            assertThat(fixture).isNotNull();
            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(fixture.readAllBytes());
            EcountCsvSupport.validateHeader(parsed.header(), EcountSalesSlipImporter.HEADERS);
        }
    }
}
