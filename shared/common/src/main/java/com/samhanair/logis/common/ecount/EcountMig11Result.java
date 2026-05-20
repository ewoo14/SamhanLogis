package com.samhanair.logis.common.ecount;

import java.util.List;

/** MIG-11 매출장/매입장 XLSX staging import 결과. UUID 없이 원천 행/거래처명만 노출한다. */
public record EcountMig11Result(
        int totalRows,
        int imported,
        int skipped,
        int rejected,
        int dailyClosingMismatchCount,
        String sourceFileHash,
        List<RejectedRow> rejectedSample,
        List<DailyClosingMismatchSample> dailyClosingMismatchSamples) {

    public record RejectedRow(int rowNumber, String errorCode, String message,
                              String businessKey, String rawValue) {
    }

    public record DailyClosingMismatchSample(String transactionDate, String rawValue,
                                             String closingValue, String diffValue,
                                             String message) {
    }

    public static Builder builder(int totalRows, String sourceFileHash) {
        return new Builder(totalRows, sourceFileHash);
    }

    public static final class Builder {
        private final int totalRows;
        private final String sourceFileHash;
        private int imported;
        private int skipped;
        private int rejected;
        private int dailyClosingMismatchCount;
        private final java.util.ArrayList<RejectedRow> rejectedSample = new java.util.ArrayList<>();
        private final java.util.ArrayList<DailyClosingMismatchSample> dailyClosingMismatchSamples =
                new java.util.ArrayList<>();

        private Builder(int totalRows, String sourceFileHash) {
            this.totalRows = totalRows;
            this.sourceFileHash = sourceFileHash;
        }

        public void imported() {
            imported++;
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

        public void dailyClosingMismatch(String transactionDate, String rawValue,
                                         String closingValue, String diffValue, String message) {
            dailyClosingMismatchCount++;
            if (dailyClosingMismatchSamples.size() < 5) {
                dailyClosingMismatchSamples.add(new DailyClosingMismatchSample(
                        transactionDate, rawValue, closingValue, diffValue, message));
            }
        }

        public EcountMig11Result build() {
            return new EcountMig11Result(totalRows, imported, skipped, rejected, dailyClosingMismatchCount,
                    sourceFileHash, List.copyOf(rejectedSample), List.copyOf(dailyClosingMismatchSamples));
        }
    }
}
