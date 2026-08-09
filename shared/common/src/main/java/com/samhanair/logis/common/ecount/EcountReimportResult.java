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
            String message,
            int heldParseFailureRows,
            int infrastructureFailureRows,
            boolean infrastructureFailure,
            List<HeldSample> heldSample,
            List<HeldSample> rejectedSample) {
        public SliceResult(String target, String fileName, String sourceFileHash,
                           String status, int imported, int rejected, String message) {
            this(target, fileName, sourceFileHash, status, imported, rejected, message,
                    0, 0, false, List.of(), List.of());
        }

        public SliceResult(String target, String fileName, String sourceFileHash,
                           String status, int imported, int rejected, String message,
                           int heldParseFailureRows, int infrastructureFailureRows,
                           boolean infrastructureFailure,
                           List<HeldSample> heldSample) {
            this(target, fileName, sourceFileHash, status, imported, rejected, message,
                    heldParseFailureRows, infrastructureFailureRows, infrastructureFailure,
                    heldSample, List.of());
        }

        public SliceResult(String target, String fileName, String sourceFileHash,
                           String status, int imported, int rejected, String message,
                           int heldParseFailureRows, int infrastructureFailureRows,
                           boolean infrastructureFailure) {
            this(target, fileName, sourceFileHash, status, imported, rejected, message,
                    heldParseFailureRows, infrastructureFailureRows, infrastructureFailure,
                    List.of(), List.of());
        }
    }

    /** 원격 import가 보류한 행의 사용자 검토용 식별 정보. UUID는 포함하지 않는다. */
    public record HeldSample(
            int rowNumber,
            String reason,
            String rawPartnerCode,
            String rawName) {
    }

    public record ErrorSample(
            String target,
            String fileName,
            String errorCode,
            String message) {
    }
}
