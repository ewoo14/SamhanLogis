package com.samhanair.logis.common.ecount;

import java.util.List;

/** MIG-9 Cash -> Journal 자동 생성 결과. UUID 없이 전표번호/sourceRef 등 비즈니스 식별자만 노출한다. */
public record EcountMig9JournalResult(
        int totalRows,
        int cashDisbursementJournalsCreated,
        int cashReceiptJournalsCreated,
        int skipped,
        int rejected,
        List<Sample> samples) {

    public record Sample(int rowNumber, String level, String code, String message,
                         String businessKey, String rawValue) {
    }

    public static Builder builder(int totalRows) {
        return new Builder(totalRows);
    }

    public static final class Builder {
        private final int totalRows;
        private int cashDisbursementJournalsCreated;
        private int cashReceiptJournalsCreated;
        private int skipped;
        private int rejected;
        private final java.util.ArrayList<Sample> samples = new java.util.ArrayList<>();

        private Builder(int totalRows) {
            this.totalRows = totalRows;
        }

        public void cashDisbursementCreated() {
            cashDisbursementJournalsCreated++;
        }

        public void cashReceiptCreated() {
            cashReceiptJournalsCreated++;
        }

        public void skipped() {
            skipped++;
        }

        public void reject(int rowNumber, String code, String message, String businessKey, String rawValue) {
            rejected++;
            sample(rowNumber, "ERROR", code, message, businessKey, rawValue);
        }

        public EcountMig9JournalResult build() {
            return new EcountMig9JournalResult(totalRows, cashDisbursementJournalsCreated,
                    cashReceiptJournalsCreated, skipped, rejected, List.copyOf(samples));
        }

        private void sample(int rowNumber, String level, String code, String message,
                            String businessKey, String rawValue) {
            if (samples.size() < 20) {
                samples.add(new Sample(rowNumber, level, code, message, businessKey, rawValue));
            }
        }
    }
}
