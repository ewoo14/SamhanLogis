package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** MIG-21 운영 지표 recorder call site 회귀 가드. */
class MigOpsMetricsCallSiteTest {

    private static final Path SOURCE_ROOT = Path.of("src/main/java/com/samhanair/logis/accounting/service");

    @Test
    void migration_importers_record_initial_import_metrics() throws IOException {
        Map<String, String> expected = Map.ofEntries(
                Map.entry("EcountAccountImporter.java", "recordImportResult(metricsRecorder, \"mig-2\""),
                Map.entry("EcountCardImporter.java", "recordImportResult(metricsRecorder, \"mig-2\""),
                Map.entry("EcountBankAccountImporter.java", "recordImportResult(metricsRecorder, \"mig-6\""),
                Map.entry("EcountFixedAssetTypeImporter.java", "recordImportResult(metricsRecorder, \"mig-6\""),
                Map.entry("AbstractEcountSlipImporter.java", "recordImportResult(metricsRecorder, \"mig-3\""),
                Map.entry("AbstractEcountMig5CashImporter.java", "recordImportResult(metricsRecorder, \"mig-5\""),
                Map.entry("AbstractMig7CashTransformService.java", "recordTransformResult(metricsRecorder, \"mig-7\""),
                Map.entry("Mig8OrderTransformService.java", "recordTransformResult(metricsRecorder, \"mig-8\""),
                Map.entry("Mig9CashJournalService.java", "recordJournalResult(metricsRecorder, \"mig-9\""),
                Map.entry("Mig10OrderEmployeeBackfillService.java", "recordBackfillResult(metricsRecorder, \"mig-10\""),
                Map.entry("AbstractEcountMig11LedgerImporter.java", "recordImportResult(metricsRecorder, \"mig-11\""));

        for (Map.Entry<String, String> entry : expected.entrySet()) {
            assertThat(read(entry.getKey()))
                    .as(entry.getKey())
                    .contains("MigOpsMetricsRecorder")
                    .contains(entry.getValue());
        }
    }

    @Test
    void aging_and_daily_closing_recorders_have_call_sites() throws IOException {
        assertThat(read("Mig9AgingSnapshotRefreshService.java"))
                .contains("recordAgingSnapshotNet");
        assertThat(read("AbstractEcountMig11LedgerImporter.java"))
                .contains("recordDailyClosingDiff");
    }

    private static String read(String fileName) throws IOException {
        return Files.readString(SOURCE_ROOT.resolve(fileName));
    }
}
