package com.samhanair.logis.accounting.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/**
 * MIG-21 마이그레이션 운영 지표 기록기.
 *
 * <p>Counter 는 Micrometer naming convention 에 따라 base name 으로 등록한다. Prometheus exporter 는
 * counter sample 에 {@code _total} suffix 를 붙이므로 actuator 노출명은 스펙의
 * {@code ecount_*_total} 과 일치한다.
 */
@Component
public class MigOpsMetricsRecorder {

    private final MeterRegistry registry;
    private final ConcurrentMap<String, AtomicReference<Double>> dailyClosingDiffGauges =
            new ConcurrentHashMap<>();
    private final AtomicReference<Double> agingNetReceivable = new AtomicReference<>(0.0);
    private final AtomicReference<Double> agingNetPayable = new AtomicReference<>(0.0);

    public MigOpsMetricsRecorder(MeterRegistry registry) {
        this.registry = registry;
        Gauge.builder("ecount_aging_snapshot_net_receivable_total", agingNetReceivable,
                        value -> value.get() == null ? 0.0 : value.get())
                .description("Ecount aging snapshot net receivable total")
                .register(registry);
        Gauge.builder("ecount_aging_snapshot_net_payable_total", agingNetPayable,
                        value -> value.get() == null ? 0.0 : value.get())
                .description("Ecount aging snapshot net payable total")
                .register(registry);
    }

    public void recordTransformStatus(String slice, String status, Number count) {
        increment("ecount_mig_transform_status", amount(count), "slice", normalize(slice), "status", normalize(status));
    }

    public void recordImport(String slice, Number count) {
        increment("ecount_mig_imported", amount(count), "slice", normalize(slice));
    }

    public void recordRejected(String slice, String errorCode, Number count) {
        increment("ecount_mig_rejected", amount(count),
                "slice", normalize(slice),
                "errorCode", normalize(errorCode));
    }

    public void recordDailyClosingDiff(String closingKind, String sourceKind, Number diffCount) {
        String normalizedClosingKind = normalize(closingKind);
        String normalizedSourceKind = normalize(sourceKind);
        String key = normalizedClosingKind + "|" + normalizedSourceKind;
        AtomicReference<Double> gauge = dailyClosingDiffGauges.computeIfAbsent(key, ignored -> {
            AtomicReference<Double> value = new AtomicReference<>(0.0);
            Gauge.builder("ecount_daily_closing_diff_count", value,
                            ref -> ref.get() == null ? 0.0 : ref.get())
                    .tag("closing_kind", normalizedClosingKind)
                    .tag("source_kind", normalizedSourceKind)
                    .description("DailyClosing mismatch count by closing/source kind")
                    .register(registry);
            return value;
        });
        gauge.set(amount(diffCount));
    }

    public void recordAgingSnapshotNet(Number netReceivable, Number netPayable) {
        agingNetReceivable.set(amount(netReceivable));
        agingNetPayable.set(amount(netPayable));
    }

    public void recordReimportRun(String slice, String status) {
        increment("ecount_reimport_runs", 1, "slice", normalize(slice), "status", normalize(status));
    }

    public void recordReimportFilesScanned(String slice, Number count) {
        increment("ecount_reimport_files_scanned", amount(count), "slice", normalize(slice));
    }

    private void increment(String name, double amount, String... tags) {
        if (amount <= 0) {
            return;
        }
        Counter.builder(name).tags(tags).register(registry).increment(amount);
    }

    private static double amount(Number value) {
        return value == null ? 0.0 : value.doubleValue();
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? "UNKNOWN" : value.trim();
    }
}
