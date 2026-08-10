package com.samhanair.logis.partner.dto;

import java.util.List;

/** 이카운트 적재 거부·보류 행의 페이지 조회 결과. 내부 UUID는 포함하지 않는다. */
public record EcountPartnerRejectionPage(
        String sourceFileHash,
        int page,
        int size,
        long totalElements,
        int totalPages,
        List<EcountPartnerImportResult.RejectedRow> items) {
}
