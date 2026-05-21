package com.samhanair.logis.dashboard.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record EcountMigOpsDashboardResponse(
        List<TransformStatusMetric> transformStatus,
        List<SliceTotalMetric> importedTotals,
        List<RejectedMetric> rejectedTotals,
        List<DailyClosingDiffMetric> dailyClosingDiffs,
        AgingNetMetric agingNet,
        List<ReimportRunMetric> reimportRuns,
        List<SliceTotalMetric> reimportFilesScanned,
        Instant observedAt) {

    public record TransformStatusMetric(String slice, String status, BigDecimal count) {
    }

    public record SliceTotalMetric(String slice, BigDecimal count) {
    }

    public record RejectedMetric(String slice, String errorCode, BigDecimal count) {
    }

    public record DailyClosingDiffMetric(String closingKind, String sourceKind, BigDecimal diffCount) {
    }

    public record AgingNetMetric(BigDecimal netReceivable, BigDecimal netPayable) {
    }

    public record ReimportRunMetric(String slice, String status, BigDecimal count) {
    }
}
