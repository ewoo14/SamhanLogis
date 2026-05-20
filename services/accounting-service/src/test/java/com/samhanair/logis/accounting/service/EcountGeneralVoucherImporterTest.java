package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import java.io.InputStream;
import org.junit.jupiter.api.Test;

/** MIG-3 일반전표 fixture/header cross-check. */
class EcountGeneralVoucherImporterTest {

    @Test
    void rawHeaderCrossCheck() throws Exception {
        try (InputStream fixture = EcountGeneralVoucherImporterTest.class
                .getResourceAsStream("/ecount-raw-fixtures/voucher-general.csv")) {
            assertThat(fixture).isNotNull();
            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(fixture.readAllBytes());
            EcountCsvSupport.validateHeader(parsed.header(), EcountGeneralVoucherImporter.HEADERS);
        }
    }
}
