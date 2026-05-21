package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.web.dto.EcountAccountImportResult;
import com.samhanair.logis.accounting.web.dto.EcountCardImportResult;
import com.samhanair.logis.accounting.web.dto.EcountMig4ImportResult;
import com.samhanair.logis.accounting.web.dto.EcountVoucherImportResult;
import com.samhanair.logis.common.ecount.EcountMig10Result;
import com.samhanair.logis.common.ecount.EcountMig11Result;
import com.samhanair.logis.common.ecount.EcountMig5ImportResult;
import com.samhanair.logis.common.ecount.EcountMig6ImportResult;
import com.samhanair.logis.common.ecount.EcountMig7TransformResult;
import com.samhanair.logis.common.ecount.EcountMig8TransformResult;
import com.samhanair.logis.common.ecount.EcountMig9JournalResult;

/** MIG-21 importer/transform 결과를 Micrometer 운영 지표로 변환하는 공통 helper. */
final class EcountMigMetricsSupport {

    private EcountMigMetricsSupport() {
    }

    static void recordImportResult(MigOpsMetricsRecorder recorder, String slice,
                                   EcountAccountImportResult result) {
        if (recorder == null || result == null) {
            return;
        }
        recordStandard(recorder, slice, result.imported(), result.updated(), 0, result.rejectedNullName());
        for (EcountAccountImportResult.RejectedRow row : result.rejectedSample()) {
            recorder.recordRejected(slice, row.reason(), 1);
        }
    }

    static void recordImportResult(MigOpsMetricsRecorder recorder, String slice,
                                   EcountCardImportResult result) {
        if (recorder == null || result == null) {
            return;
        }
        recordStandard(recorder, slice, result.imported(), result.updated(), 0, result.rejectedNullName());
        for (EcountCardImportResult.RejectedRow row : result.rejectedSample()) {
            recorder.recordRejected(slice, row.reason(), 1);
        }
    }

    static void recordImportResult(MigOpsMetricsRecorder recorder, String slice,
                                   EcountVoucherImportResult result) {
        if (recorder == null || result == null) {
            return;
        }
        recordStandard(recorder, slice, result.imported(), result.updated(), result.skipped(), result.rejected());
        for (EcountVoucherImportResult.RejectedRow row : result.rejectedSample()) {
            recorder.recordRejected(slice, row.errorCode(), 1);
        }
    }

    static void recordImportResult(MigOpsMetricsRecorder recorder, String slice,
                                   EcountMig4ImportResult result) {
        if (recorder == null || result == null) {
            return;
        }
        recordStandard(recorder, slice, result.imported(), result.updated(), result.skipped(), result.rejected());
        recorder.recordTransformStatus(slice, "MISMATCH", result.mismatchCount());
        recorder.recordTransformStatus(slice, "UNKNOWN_STATUS", result.unknownStatusCount());
        for (EcountMig4ImportResult.RejectedRow row : result.rejectedSample()) {
            recorder.recordRejected(slice, row.errorCode(), 1);
        }
    }

    static void recordImportResult(MigOpsMetricsRecorder recorder, String slice,
                                   EcountMig5ImportResult result) {
        if (recorder == null || result == null) {
            return;
        }
        recordStandard(recorder, slice, result.imported(), result.updated(), result.skipped(), result.rejected());
        recorder.recordTransformStatus(slice, "AGING_MISMATCH", result.agingMismatchCount());
        for (EcountMig5ImportResult.RejectedRow row : result.rejectedSample()) {
            recorder.recordRejected(slice, row.errorCode(), 1);
        }
    }

    static void recordImportResult(MigOpsMetricsRecorder recorder, String slice,
                                   EcountMig6ImportResult result) {
        if (recorder == null || result == null) {
            return;
        }
        recordStandard(recorder, slice, result.imported(), result.updated(), result.skipped(), result.rejected());
        for (EcountMig6ImportResult.RejectedRow row : result.rejectedSample()) {
            recorder.recordRejected(slice, row.errorCode(), 1);
        }
    }

    static void recordTransformResult(MigOpsMetricsRecorder recorder, String slice,
                                      EcountMig7TransformResult result) {
        if (recorder == null || result == null) {
            return;
        }
        int transformed = result.imported() + result.updated();
        recorder.recordImport(slice, result.imported());
        recorder.recordTransformStatus(slice, "TRANSFORMED", transformed);
        recorder.recordTransformStatus(slice, "UPDATED", result.updated());
        recorder.recordTransformStatus(slice, "SKIPPED", result.skipped());
        recorder.recordTransformStatus(slice, "REJECTED", result.rejected());
        for (EcountMig7TransformResult.RejectedRow row : result.rejectedSample()) {
            recorder.recordRejected(slice, row.errorCode(), 1);
        }
    }

    static void recordTransformResult(MigOpsMetricsRecorder recorder, String slice,
                                      EcountMig8TransformResult result) {
        if (recorder == null || result == null) {
            return;
        }
        int transformed = result.imported() + result.updated();
        recorder.recordImport(slice, result.imported());
        recorder.recordTransformStatus(slice, "TRANSFORMED", transformed);
        recorder.recordTransformStatus(slice, "UPDATED", result.updated());
        recorder.recordTransformStatus(slice, "SKIPPED", result.skipped());
        recorder.recordTransformStatus(slice, "REJECTED", result.rejected());
        recorder.recordTransformStatus(slice, "LINKED_SLIP", result.completedLinkedSlipCount());
        for (EcountMig8TransformResult.Sample row : result.samples()) {
            if ("ERROR".equals(row.level())) {
                recorder.recordRejected(slice, row.code(), 1);
            }
        }
    }

    static void recordJournalResult(MigOpsMetricsRecorder recorder, String slice,
                                    EcountMig9JournalResult result) {
        if (recorder == null || result == null) {
            return;
        }
        int created = result.cashDisbursementJournalsCreated() + result.cashReceiptJournalsCreated();
        recorder.recordImport(slice, created);
        recorder.recordTransformStatus(slice, "JOURNAL_CREATED", created);
        recorder.recordTransformStatus(slice, "SKIPPED", result.skipped());
        recorder.recordTransformStatus(slice, "REJECTED", result.rejected());
        for (EcountMig9JournalResult.Sample row : result.samples()) {
            if ("ERROR".equals(row.level())) {
                recorder.recordRejected(slice, row.code(), 1);
            }
        }
    }

    static void recordBackfillResult(MigOpsMetricsRecorder recorder, String slice,
                                     EcountMig10Result result) {
        if (recorder == null || result == null) {
            return;
        }
        recorder.recordImport(slice, result.backfilled());
        recorder.recordTransformStatus(slice, "BACKFILLED", result.backfilled());
        recorder.recordTransformStatus(slice, "LOOKUP_MISS", result.lookupMissCount());
        recorder.recordTransformStatus(slice, "AMBIGUOUS", result.ambiguousCount());
        recorder.recordRejected(slice, "MIG10_EMPLOYEE_LOOKUP_MISS", result.lookupMissCount());
        recorder.recordRejected(slice, "MIG10_EMPLOYEE_AMBIGUOUS", result.ambiguousCount());
    }

    static void recordImportResult(MigOpsMetricsRecorder recorder, String slice,
                                   EcountMig11Result result) {
        if (recorder == null || result == null) {
            return;
        }
        recordStandard(recorder, slice, result.imported(), 0, result.skipped(), result.rejected());
        recorder.recordTransformStatus(slice, "DAILY_CLOSING_MISMATCH", result.dailyClosingMismatchCount());
        for (EcountMig11Result.RejectedRow row : result.rejectedSample()) {
            recorder.recordRejected(slice, row.errorCode(), 1);
        }
    }

    private static void recordStandard(MigOpsMetricsRecorder recorder, String slice, int imported,
                                       int updated, int skipped, int rejected) {
        recorder.recordImport(slice, imported);
        recorder.recordTransformStatus(slice, "IMPORTED", imported);
        recorder.recordTransformStatus(slice, "UPDATED", updated);
        recorder.recordTransformStatus(slice, "SKIPPED", skipped);
        recorder.recordTransformStatus(slice, "REJECTED", rejected);
    }
}
