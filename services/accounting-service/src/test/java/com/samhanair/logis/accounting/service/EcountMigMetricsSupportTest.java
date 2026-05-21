package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.web.dto.EcountMig4ImportResult;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** MIG-21 importer result -> Micrometer 변환 회귀 테스트. */
class EcountMigMetricsSupportTest {

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

        assertThat(counter(registry, "ERR_A").count()).isEqualTo(10);
        assertThat(counter(registry, "ERR_B").count()).isEqualTo(10);
        assertThat(counter(registry, "UNSPECIFIED").count()).isEqualTo(5);
        assertThat(counter(registry, "ERR_A").count()
                + counter(registry, "ERR_B").count()
                + counter(registry, "UNSPECIFIED").count()).isEqualTo(25);
    }

    private static Counter counter(SimpleMeterRegistry registry, String errorCode) {
        return registry.get("ecount_mig_rejected")
                .tag("slice", "mig-4")
                .tag("errorCode", errorCode)
                .counter();
    }
}
