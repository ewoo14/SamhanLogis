package com.samhanair.logis.common.ecount;

import java.util.List;

/** MIG-6 이카운트 잔여 마스터 import 결과. UUID 없이 비즈니스 식별자만 노출한다. */
public record EcountMig6ImportResult(
        int totalRows,
        int imported,
        int updated,
        int skipped,
        int rejected,
        String sourceFileHash,
        List<RejectedRow> rejectedSample) {

    public record RejectedRow(int rowNumber, String errorCode, String message,
                              String businessKey, String rawValue) {
    }

    public static Builder builder(int totalRows, String sourceFileHash) {
        return new Builder(totalRows, sourceFileHash);
    }

    public static final class Builder {
        private final int totalRows;
        private final String sourceFileHash;
        private int imported;
        private int updated;
        private int skipped;
        private int rejected;
        private final java.util.ArrayList<RejectedRow> rejectedSample = new java.util.ArrayList<>();

        private Builder(int totalRows, String sourceFileHash) {
            this.totalRows = totalRows;
            this.sourceFileHash = sourceFileHash;
        }

        public void imported() {
            imported++;
        }

        public void updated() {
            updated++;
        }

        public void skipped() {
            skipped++;
        }

        public void reject(int rowNumber, String errorCode, String message, String businessKey, String rawValue) {
            rejected++;
            if (rejectedSample.size() < 20) {
                rejectedSample.add(new RejectedRow(rowNumber, errorCode, message, businessKey, rawValue));
            }
        }

        public EcountMig6ImportResult build() {
            return new EcountMig6ImportResult(totalRows, imported, updated, skipped, rejected,
                    sourceFileHash, List.copyOf(rejectedSample));
        }
    }
}
