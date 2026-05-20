package com.samhanair.logis.accounting.web.dto;

import java.util.List;

/** MIG-3 이카운트 회계 전표 4종 import 결과. UUID 없이 비즈니스 식별자만 노출한다. */
public record EcountVoucherImportResult(
        int totalRows,
        int imported,
        int updated,
        int skipped,
        int rejected,
        int posted,
        int draft,
        String sourceFileHash,
        List<RejectedRow> rejectedSample,
        List<ImportWarning> warnings) {

    public record RejectedRow(
            int rowNumber,
            String errorCode,
            String message,
            String businessKey,
            String rawValue) {
    }

    public record ImportWarning(
            String errorCode,
            String message,
            String businessKey) {
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
        private int posted;
        private int draft;
        private final java.util.ArrayList<RejectedRow> rejectedSample = new java.util.ArrayList<>();
        private final java.util.ArrayList<ImportWarning> warnings = new java.util.ArrayList<>();

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

        public void posted() {
            posted++;
        }

        public void draft() {
            draft++;
        }

        public void reject(int rowNumber, String errorCode, String message, String businessKey, String rawValue) {
            rejected++;
            if (rejectedSample.size() < 20) {
                rejectedSample.add(new RejectedRow(rowNumber, errorCode, message, businessKey, rawValue));
            }
        }

        public void warning(String errorCode, String message, String businessKey) {
            warnings.add(new ImportWarning(errorCode, message, businessKey));
        }

        public EcountVoucherImportResult build() {
            return new EcountVoucherImportResult(totalRows, imported, updated, skipped, rejected, posted, draft,
                    sourceFileHash, List.copyOf(rejectedSample), List.copyOf(warnings));
        }
    }
}
