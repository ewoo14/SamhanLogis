package com.samhanair.logis.slip.estimate.snapshot.web.dto;

import java.math.BigDecimal;

/** 데스크톱 목록용 웹 종합견적 메타데이터. UUID와 복원 payload는 포함하지 않는다. */
public record WebQuoteSnapshotListResponse(
        String snapshotKey,
        String documentLabel,
        String custName,
        String created,
        BigDecimal totalAmount) {
}
