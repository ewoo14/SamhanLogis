package com.samhanair.logis.user.web.dto;

import java.util.List;

/** MIG-2 이카운트 부서코드 import 결과. */
public record EcountDepartmentImportResult(
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
