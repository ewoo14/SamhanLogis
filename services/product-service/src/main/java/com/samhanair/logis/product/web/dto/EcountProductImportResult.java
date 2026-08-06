package com.samhanair.logis.product.web.dto;

import java.util.List;

/** MIG-2 이카운트 품목/alias import 결과. */
public record EcountProductImportResult(
        int totalRows,
        int imported,
        int updated,
        int rejectedNullName,
        int skippedPlaceholder,
        int skippedRelationOrphan,
        int aliasImported,
        String sourceFileHash,
        List<RejectedRow> rejectedSample,
        int skippedGroupCount,
        List<SkippedGroup> skippedGroups) {

    public record RejectedRow(int rowNumber, String reason, String rawCode, String rawName) {
    }

    public record SkippedGroup(
            String name,
            List<String> candidateCodes,
            List<Integer> rowNumbers,
            String stoppedAt) {
    }
}
