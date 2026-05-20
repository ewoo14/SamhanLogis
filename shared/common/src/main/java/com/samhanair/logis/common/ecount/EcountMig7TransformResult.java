package com.samhanair.logis.common.ecount;

import java.util.List;

/** MIG-7 Cash staging transform 결과. UUID 없이 전표번호/externalRef 등 비즈니스 식별자만 노출한다. */
public record EcountMig7TransformResult(
        int totalRows,
        int imported,
        int updated,
        int skipped,
        int rejected,
        List<RejectedRow> rejectedSample) {

    public record RejectedRow(int rowNumber, String errorCode, String message,
                              String businessKey, String rawValue) {
    }

    public static Builder builder(int totalRows) {
        return new Builder(totalRows);
    }

    public static final class Builder {
        private final int totalRows;
        private int imported;
        private int updated;
        private int skipped;
        private int rejected;
        private final java.util.ArrayList<RejectedRow> rejectedSample = new java.util.ArrayList<>();

        private Builder(int totalRows) {
            this.totalRows = totalRows;
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

        public EcountMig7TransformResult build() {
            return new EcountMig7TransformResult(totalRows, imported, updated, skipped, rejected,
                    List.copyOf(rejectedSample));
        }
    }
}
