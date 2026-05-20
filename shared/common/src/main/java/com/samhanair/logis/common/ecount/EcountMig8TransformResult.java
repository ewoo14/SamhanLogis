package com.samhanair.logis.common.ecount;

import java.util.List;

/** MIG-8 Order staging transform 결과. UUID 없이 주문번호/전표번호 등 비즈니스 식별자만 노출한다. */
public record EcountMig8TransformResult(
        int totalRows,
        int imported,
        int updated,
        int skipped,
        int rejected,
        int completedLinkedSlipCount,
        List<Sample> samples) {

    public record Sample(int rowNumber, String level, String code, String message,
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
        private int completedLinkedSlipCount;
        private final java.util.ArrayList<Sample> samples = new java.util.ArrayList<>();

        private Builder(int totalRows) {
            this.totalRows = totalRows;
        }

        public void imported() {
            imported++;
        }

        public void updated() {
            updated++;
        }

        public void skipped(int count) {
            skipped += count;
        }

        public void linkedSlip() {
            completedLinkedSlipCount++;
        }

        public void warning(int rowNumber, String code, String message, String businessKey, String rawValue) {
            sample(rowNumber, "WARN", code, message, businessKey, rawValue);
        }

        public void reject(int rowNumber, String code, String message, String businessKey, String rawValue) {
            rejected++;
            sample(rowNumber, "ERROR", code, message, businessKey, rawValue);
        }

        public EcountMig8TransformResult build() {
            return new EcountMig8TransformResult(totalRows, imported, updated, skipped, rejected,
                    completedLinkedSlipCount, List.copyOf(samples));
        }

        private void sample(int rowNumber, String level, String code, String message,
                            String businessKey, String rawValue) {
            if (samples.size() < 20) {
                samples.add(new Sample(rowNumber, level, code, message, businessKey, rawValue));
            }
        }
    }
}
