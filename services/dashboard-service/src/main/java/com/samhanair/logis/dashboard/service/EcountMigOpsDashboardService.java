package com.samhanair.logis.dashboard.service;

import com.samhanair.logis.dashboard.client.AccountingClient;
import com.samhanair.logis.dashboard.dto.EcountMigOpsDashboardResponse;
import com.samhanair.logis.dashboard.dto.EcountMigOpsDashboardResponse.AgingNetMetric;
import com.samhanair.logis.dashboard.dto.EcountMigOpsDashboardResponse.DailyClosingDiffMetric;
import com.samhanair.logis.dashboard.dto.EcountMigOpsDashboardResponse.ReimportRunMetric;
import com.samhanair.logis.dashboard.dto.EcountMigOpsDashboardResponse.RejectedMetric;
import com.samhanair.logis.dashboard.dto.EcountMigOpsDashboardResponse.SliceTotalMetric;
import com.samhanair.logis.dashboard.dto.EcountMigOpsDashboardResponse.TransformStatusMetric;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** accounting-service actuator Prometheus text 를 MIG-21 운영 대시보드 DTO 로 변환한다. */
@Service
@RequiredArgsConstructor
public class EcountMigOpsDashboardService {

    private static final Pattern SAMPLE =
            Pattern.compile("^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\\{([^}]*)})?\\s+([-+0-9.eE]+).*$");
    private static final Pattern LABEL =
            Pattern.compile("([a-zA-Z_][a-zA-Z0-9_]*)=\"((?:\\\\.|[^\"])*)\"");

    private final AccountingClient accountingClient;

    public EcountMigOpsDashboardResponse load() {
        return parse(accountingClient.fetchPrometheusMetrics());
    }

    EcountMigOpsDashboardResponse parse(String prometheusText) {
        List<TransformStatusMetric> transformStatus = new ArrayList<>();
        List<SliceTotalMetric> importedTotals = new ArrayList<>();
        List<RejectedMetric> rejectedTotals = new ArrayList<>();
        List<DailyClosingDiffMetric> dailyClosingDiffs = new ArrayList<>();
        List<ReimportRunMetric> reimportRuns = new ArrayList<>();
        List<SliceTotalMetric> reimportFilesScanned = new ArrayList<>();
        BigDecimal netReceivable = BigDecimal.ZERO;
        BigDecimal netPayable = BigDecimal.ZERO;

        String text = prometheusText == null ? "" : prometheusText;
        for (String line : text.split("\\R")) {
            if (line.isBlank() || line.startsWith("#")) {
                continue;
            }
            Matcher sample = SAMPLE.matcher(line);
            if (!sample.matches()) {
                continue;
            }
            String name = sample.group(1);
            Map<String, String> labels = labels(sample.group(2));
            BigDecimal value = decimal(sample.group(3));

            switch (name) {
                case "ecount_mig_transform_status_total" -> transformStatus.add(
                        new TransformStatusMetric(label(labels, "slice"), label(labels, "status"), value));
                case "ecount_mig_imported_total" -> importedTotals.add(
                        new SliceTotalMetric(label(labels, "slice"), value));
                case "ecount_mig_rejected_total" -> rejectedTotals.add(
                        new RejectedMetric(label(labels, "slice"), label(labels, "errorCode"), value));
                case "ecount_daily_closing_diff_count" -> dailyClosingDiffs.add(
                        new DailyClosingDiffMetric(label(labels, "closing_kind"),
                                label(labels, "source_kind"), value));
                case "ecount_aging_snapshot_net_receivable_total" -> netReceivable = value;
                case "ecount_aging_snapshot_net_payable_total" -> netPayable = value;
                case "ecount_reimport_runs_total" -> reimportRuns.add(
                        new ReimportRunMetric(label(labels, "slice"), label(labels, "status"), value));
                case "ecount_reimport_files_scanned_total" -> reimportFilesScanned.add(
                        new SliceTotalMetric(label(labels, "slice"), value));
                default -> {
                    // 다른 actuator metric 은 대시보드 산출에서 제외.
                }
            }
        }

        return new EcountMigOpsDashboardResponse(
                List.copyOf(transformStatus),
                List.copyOf(importedTotals),
                List.copyOf(rejectedTotals),
                List.copyOf(dailyClosingDiffs),
                new AgingNetMetric(netReceivable, netPayable),
                List.copyOf(reimportRuns),
                List.copyOf(reimportFilesScanned),
                Instant.now());
    }

    private static Map<String, String> labels(String raw) {
        Map<String, String> labels = new HashMap<>();
        if (raw == null || raw.isBlank()) {
            return labels;
        }
        Matcher matcher = LABEL.matcher(raw);
        while (matcher.find()) {
            labels.put(matcher.group(1), matcher.group(2).replace("\\\"", "\""));
        }
        return labels;
    }

    private static String label(Map<String, String> labels, String key) {
        return labels.getOrDefault(key, "UNKNOWN");
    }

    private static BigDecimal decimal(String raw) {
        try {
            return new BigDecimal(raw);
        } catch (NumberFormatException ex) {
            return BigDecimal.ZERO;
        }
    }
}
