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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
        recordRejected(recorder, slice, "REJECT_NAME_NULL", result.rejectedNullName());
    }

    static void recordImportResult(MigOpsMetricsRecorder recorder, String slice,
                                   EcountCardImportResult result) {
        if (recorder == null || result == null) {
            return;
        }
        recordStandard(recorder, slice, result.imported(), result.updated(), 0, result.rejectedNullName());
        recordRejected(recorder, slice, "REJECT_NAME_NULL", result.rejectedNullName());
    }

    static void recordImportResult(MigOpsMetricsRecorder recorder, String slice,
                                   EcountVoucherImportResult result) {
        if (recorder == null || result == null) {
            return;
        }
        recordStandard(recorder, slice, result.imported(), result.updated(), result.skipped(), result.rejected());
        recordRejected(recorder, slice,
                result.rejectedSample().stream().map(EcountVoucherImportResult.RejectedRow::errorCode).toList(),
                result.rejected());
    }

    static void recordImportResult(MigOpsMetricsRecorder recorder, String slice,
                                   EcountMig4ImportResult result) {
        if (recorder == null || result == null) {
            return;
        }
        recordStandard(recorder, slice, result.imported(), result.updated(), result.skipped(), result.rejected());
        recorder.recordTransformStatus(slice, "MISMATCH", result.mismatchCount());
        recorder.recordTransformStatus(slice, "UNKNOWN_STATUS", result.unknownStatusCount());
        recordRejected(recorder, slice,
                result.rejectedSample().stream().map(EcountMig4ImportResult.RejectedRow::errorCode).toList(),
                result.rejected());
    }

    static void recordImportResult(MigOpsMetricsRecorder recorder, String slice,
                                   EcountMig5ImportResult result) {
        if (recorder == null || result == null) {
            return;
        }
        recordStandard(recorder, slice, result.imported(), result.updated(), result.skipped(), result.rejected());
        recorder.recordTransformStatus(slice, "AGING_MISMATCH", result.agingMismatchCount());
        recordRejected(recorder, slice,
                result.rejectedSample().stream().map(EcountMig5ImportResult.RejectedRow::errorCode).toList(),
                result.rejected());
    }

    static void recordImportResult(MigOpsMetricsRecorder recorder, String slice,
                                   EcountMig6ImportResult result) {
        if (recorder == null || result == null) {
            return;
        }
        recordStandard(recorder, slice, result.imported(), result.updated(), result.skipped(), result.rejected());
        recordRejected(recorder, slice,
                result.rejectedSample().stream().map(EcountMig6ImportResult.RejectedRow::errorCode).toList(),
                result.rejected());
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
        recordRejected(recorder, slice,
                result.rejectedSample().stream().map(EcountMig7TransformResult.RejectedRow::errorCode).toList(),
                result.rejected());
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
        recordRejected(recorder, slice,
                result.samples().stream()
                        .filter(row -> "ERROR".equals(row.level()))
                        .map(EcountMig8TransformResult.Sample::code)
                        .toList(),
                result.rejected());
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
        recordRejected(recorder, slice,
                result.samples().stream()
                        .filter(row -> "ERROR".equals(row.level()))
                        .map(EcountMig9JournalResult.Sample::code)
                        .toList(),
                result.rejected());
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
        recordRejected(recorder, slice,
                result.rejectedSample().stream().map(EcountMig11Result.RejectedRow::errorCode).toList(),
                result.rejected());
    }

    private static void recordStandard(MigOpsMetricsRecorder recorder, String slice, int imported,
                                       int updated, int skipped, int rejected) {
        recorder.recordImport(slice, imported);
        recorder.recordTransformStatus(slice, "IMPORTED", imported);
        recorder.recordTransformStatus(slice, "UPDATED", updated);
        recorder.recordTransformStatus(slice, "SKIPPED", skipped);
        recorder.recordTransformStatus(slice, "REJECTED", rejected);
    }

    private static void recordRejected(MigOpsMetricsRecorder recorder, String slice,
                                       List<String> sampledErrorCodes, int totalRejected) {
        if (totalRejected <= 0) {
            return;
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        int counted = 0;
        for (String errorCode : sampledErrorCodes) {
            if (counted >= totalRejected) {
                break;
            }
            counts.merge(errorCode == null || errorCode.isBlank() ? "UNSPECIFIED" : errorCode, 1, Integer::sum);
            counted++;
        }
        counts.forEach((errorCode, count) -> recorder.recordRejected(slice, errorCode, count));
        int unspecified = totalRejected - counted;
        if (unspecified > 0) {
            recorder.recordRejected(slice, "UNSPECIFIED", unspecified);
        }
    }

    private static void recordRejected(MigOpsMetricsRecorder recorder, String slice,
                                       String errorCode, int count) {
        if (count > 0) {
            recorder.recordRejected(slice, errorCode, count);
        }
    }
}
