package com.samhanair.logis.inventory.web.dto;

import java.util.List;

/** MIG-2 이카운트 창고 import 결과. */
public record EcountWarehouseImportResult(
        int totalRows,
        int imported,
        int updated,
        int rejectedNullName,
        int skippedPlaceholder,
        String sourceFileHash,
        List<RejectedRow> rejectedSample) {

    public record RejectedRow(int rowNumber, String reason, String rawCode, String rawName) {
    }
}
