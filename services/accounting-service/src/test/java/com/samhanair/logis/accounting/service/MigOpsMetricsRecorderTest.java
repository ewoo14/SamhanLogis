package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

class MigOpsMetricsRecorderTest {

    @Test
    void records_import_reject_transform_reimport_and_gauge_metrics() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        MigOpsMetricsRecorder recorder = new MigOpsMetricsRecorder(registry);

        recorder.recordImport("mig-4", 3);
        recorder.recordRejected("mig-4", "MIG4_ORDER_STATUS_INVALID", 2);
        recorder.recordTransformStatus("mig-8", "TRANSFORMED", 5);
        recorder.recordTransformStatus("mig-8", "REJECTED", 1);
        recorder.recordDailyClosingDiff("SALES", "TAX_INVOICE", 7);
        recorder.recordAgingSnapshotNet(1200, 300);
        recorder.recordReimportRun("mig-4", "SUCCESS");
        recorder.recordReimportFilesScanned("mig-4", 6);

        assertThat(registry.counter("ecount_mig_imported", "slice", "mig-4").count()).isEqualTo(3);
        assertThat(registry.counter("ecount_mig_rejected", "slice", "mig-4",
                "errorCode", "MIG4_ORDER_STATUS_INVALID").count()).isEqualTo(2);
        assertThat(registry.counter("ecount_mig_transform_status", "slice", "mig-8",
                "status", "TRANSFORMED").count()).isEqualTo(5);
        assertThat(registry.counter("ecount_mig_transform_status", "slice", "mig-8",
                "status", "REJECTED").count()).isEqualTo(1);
        assertThat(registry.get("ecount_daily_closing_diff_count")
                .tag("closing_kind", "SALES")
                .tag("source_kind", "TAX_INVOICE")
                .gauge()
                .value()).isEqualTo(7);
        assertThat(registry.get("ecount_aging_snapshot_net_receivable_total").gauge().value()).isEqualTo(1200);
        assertThat(registry.get("ecount_aging_snapshot_net_payable_total").gauge().value()).isEqualTo(300);
        assertThat(registry.counter("ecount_reimport_runs", "slice", "mig-4", "status", "SUCCESS").count())
                .isEqualTo(1);
        assertThat(registry.counter("ecount_reimport_files_scanned", "slice", "mig-4").count()).isEqualTo(6);
    }
}
