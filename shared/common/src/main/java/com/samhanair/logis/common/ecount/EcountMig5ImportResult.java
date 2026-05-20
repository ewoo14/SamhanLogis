package com.samhanair.logis.common.ecount;

import java.util.List;

/** MIG-5 이카운트 raw import 결과. UUID 없이 비즈니스 식별자만 노출한다. */
public record EcountMig5ImportResult(
        int totalRows,
        int imported,
        int updated,
        int lineAdded,
        int skipped,
        int rejected,
        int agingMismatchCount,
        boolean agingValidationSkipped,
        String sourceFileHash,
        List<RejectedRow> rejectedSample,
        List<AgingMismatchSample> agingMismatchSamples) {

    public record RejectedRow(int rowNumber, String errorCode, String message,
                              String businessKey, String rawValue) {
    }

    public record AgingMismatchSample(String partnerName, String rawValue, String agingValue,
                                      String message) {
    }

    public static Builder builder(int totalRows, String sourceFileHash) {
        return new Builder(totalRows, sourceFileHash);
    }

    public static final class Builder {
        private final int totalRows;
        private final String sourceFileHash;
        private int imported;
        private int updated;
        private int lineAdded;
        private int skipped;
        private int rejected;
        private int agingMismatchCount;
        private boolean agingValidationSkipped;
        private final java.util.ArrayList<RejectedRow> rejectedSample = new java.util.ArrayList<>();
        private final java.util.ArrayList<AgingMismatchSample> agingMismatchSamples = new java.util.ArrayList<>();

        private Builder(int totalRows, String sourceFileHash) {
            this.totalRows = totalRows;
            this.sourceFileHash = sourceFileHash;
        }

        public void imported() { imported++; }
        public void updated() { updated++; }
        public void lineAdded() { lineAdded++; }
        public void skipped() { skipped++; }
        public void agingValidationSkipped() { agingValidationSkipped = true; }

        public void reject(int rowNumber, String errorCode, String message, String businessKey, String rawValue) {
            rejected++;
            if (rejectedSample.size() < 20) {
                rejectedSample.add(new RejectedRow(rowNumber, errorCode, message, businessKey, rawValue));
            }
        }

        public void agingMismatch(String partnerName, String rawValue, String agingValue, String message) {
            agingMismatchCount++;
            if (agingMismatchSamples.size() < 5) {
                agingMismatchSamples.add(new AgingMismatchSample(partnerName, rawValue, agingValue, message));
            }
        }

        public EcountMig5ImportResult build() {
            return new EcountMig5ImportResult(totalRows, imported, updated, lineAdded, skipped, rejected,
                    agingMismatchCount, agingValidationSkipped, sourceFileHash,
                    List.copyOf(rejectedSample), List.copyOf(agingMismatchSamples));
        }
    }
}
