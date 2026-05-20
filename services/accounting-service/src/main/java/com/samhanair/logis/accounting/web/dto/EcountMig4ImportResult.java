package com.samhanair.logis.accounting.web.dto;

import java.util.List;

/** MIG-4 이카운트 영업·세무 raw import 결과. UUID 없이 비즈니스 식별자만 노출한다. */
public record EcountMig4ImportResult(
        int totalRows,
        int imported,
        int updated,
        int skipped,
        int rejected,
        int linkedSlipCount,
        int unlinkedSlipCount,
        int mismatchCount,
        int unknownStatusCount,
        String sourceFileHash,
        List<RejectedRow> rejectedSample,
        List<MismatchSample> mismatchSamples) {

    public record RejectedRow(int rowNumber, String errorCode, String message,
                              String businessKey, String rawValue) {
    }

    public record MismatchSample(String businessKey, String rawValue, String domainValue,
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
        private int skipped;
        private int rejected;
        private int linkedSlipCount;
        private int unlinkedSlipCount;
        private int mismatchCount;
        private int unknownStatusCount;
        private final java.util.ArrayList<RejectedRow> rejectedSample = new java.util.ArrayList<>();
        private final java.util.ArrayList<MismatchSample> mismatchSamples = new java.util.ArrayList<>();

        private Builder(int totalRows, String sourceFileHash) {
            this.totalRows = totalRows;
            this.sourceFileHash = sourceFileHash;
        }

        public void imported() { imported++; }
        public void updated() { updated++; }
        public void skipped() { skipped++; }
        public void linkedSlip() { linkedSlipCount++; }
        public void unlinkedSlip() { unlinkedSlipCount++; }
        /** 주문서 unknown 상태 카운터. rejected 의 하위 분류가 아니므로 reject()와 중복 호출하지 않는다. */
        public void unknownStatus() { unknownStatusCount++; }

        public void reject(int rowNumber, String errorCode, String message, String businessKey, String rawValue) {
            rejected++;
            if (rejectedSample.size() < 20) {
                rejectedSample.add(new RejectedRow(rowNumber, errorCode, message, businessKey, rawValue));
            }
        }

        public void mismatch(String businessKey, String rawValue, String domainValue, String message) {
            mismatchCount++;
            if (mismatchSamples.size() < 5) {
                mismatchSamples.add(new MismatchSample(businessKey, rawValue, domainValue, message));
            }
        }

        public EcountMig4ImportResult build() {
            return new EcountMig4ImportResult(totalRows, imported, updated, skipped, rejected,
                    linkedSlipCount, unlinkedSlipCount, mismatchCount, unknownStatusCount,
                    sourceFileHash, List.copyOf(rejectedSample), List.copyOf(mismatchSamples));
        }
    }
}
