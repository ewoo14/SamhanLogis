package com.samhanair.logis.partnerorder.mig8.service;

import java.util.List;

/** MIG-8 import 결과와 주문별 거부 상세. */
public record Mig8OrderImportResult(
        int fetchedCount,
        int createdCount,
        int skippedCount,
        int rejectedCount,
        List<RejectionDetail> rejectionDetails) {

    public record RejectionDetail(String orderNo, Integer lineNo, String reason) {
    }

    public Mig8OrderImportResult plus(Mig8OrderImportResult other) {
        return new Mig8OrderImportResult(
                fetchedCount + other.fetchedCount,
                createdCount + other.createdCount,
                skippedCount + other.skippedCount,
                rejectedCount + other.rejectedCount,
                java.util.stream.Stream.concat(rejectionDetails.stream(), other.rejectionDetails.stream()).toList());
    }

    public static Mig8OrderImportResult fetched() {
        return new Mig8OrderImportResult(1, 0, 0, 0, List.of());
    }

    public static Mig8OrderImportResult created() {
        return new Mig8OrderImportResult(0, 1, 0, 0, List.of());
    }

    public static Mig8OrderImportResult skipped() {
        return new Mig8OrderImportResult(0, 0, 1, 0, List.of());
    }

    public static Mig8OrderImportResult rejected(String orderNo, Integer lineNo, String reason) {
        return new Mig8OrderImportResult(0, 0, 0, 1,
                List.of(new RejectionDetail(orderNo, lineNo, reason)));
    }

    public static Mig8OrderImportResult empty() {
        return new Mig8OrderImportResult(0, 0, 0, 0, List.of());
    }
}
