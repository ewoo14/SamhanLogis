package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.web.dto.EcountAccountImportResult;
import com.samhanair.logis.accounting.web.dto.EcountMig4ImportResult;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** MIG-21 importer result -> Micrometer 변환 회귀 테스트. */
class EcountMigMetricsSupportTest {

    @Test
    void mig2_account_rejected_attributes_full_count_to_REJECT_NAME_NULL() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        MigOpsMetricsRecorder recorder = new MigOpsMetricsRecorder(registry);
        EcountAccountImportResult result = new EcountAccountImportResult(
                10, 0, 0, 10, 0, "hash", List.of());

        EcountMigMetricsSupport.recordImportResult(recorder, "mig-2", result);

        assertThat(counter(registry, "mig-2", "REJECT_NAME_NULL").count()).isEqualTo(10);
        assertThat(registry.find("ecount_mig_rejected")
                .tag("slice", "mig-2")
                .tag("errorCode", "UNSPECIFIED")
                .counter()).isNull();
    }

    @Test
    void records_rejected_total_beyond_capped_samples_as_unspecified() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        MigOpsMetricsRecorder recorder = new MigOpsMetricsRecorder(registry);
        List<EcountMig4ImportResult.RejectedRow> samples = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            samples.add(new EcountMig4ImportResult.RejectedRow(i + 1, "ERR_A", "A", "A-" + i, "raw"));
        }
        for (int i = 0; i < 10; i++) {
            samples.add(new EcountMig4ImportResult.RejectedRow(i + 11, "ERR_B", "B", "B-" + i, "raw"));
        }
        EcountMig4ImportResult result = new EcountMig4ImportResult(
                30, 5, 0, 0, 25, 0, 0, 0, 0, "hash",
                samples,
                List.of());

        EcountMigMetricsSupport.recordImportResult(recorder, "mig-4", result);

        assertThat(counter(registry, "mig-4", "ERR_A").count()).isEqualTo(10);
        assertThat(counter(registry, "mig-4", "ERR_B").count()).isEqualTo(10);
        assertThat(counter(registry, "mig-4", "UNSPECIFIED").count()).isEqualTo(5);
        assertThat(counter(registry, "mig-4", "ERR_A").count()
                + counter(registry, "mig-4", "ERR_B").count()
                + counter(registry, "mig-4", "UNSPECIFIED").count()).isEqualTo(25);
    }

    private static Counter counter(SimpleMeterRegistry registry, String slice, String errorCode) {
        return registry.get("ecount_mig_rejected")
                .tag("slice", slice)
                .tag("errorCode", errorCode)
                .counter();
    }
}
