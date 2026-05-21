package com.samhanair.logis.common.ecount;

import java.util.List;

/** MIG-20 이카운트 raw 재import 실행 결과. UUID 없이 slice/file/hash와 카운트만 노출한다. */
public record EcountReimportResult(
        String slice,
        int filesScanned,
        int filesProcessed,
        int filesSkipped,
        int totalImported,
        int totalRejected,
        List<SliceResult> details,
        List<ErrorSample> errors) {

    public record SliceResult(
            String target,
            String fileName,
            String sourceFileHash,
            String status,
            int imported,
            int rejected,
            String message) {
    }

    public record ErrorSample(
            String target,
            String fileName,
            String errorCode,
            String message) {
    }
}
