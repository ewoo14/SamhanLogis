package com.samhanair.logis.accounting.web.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 거래처별 원장 자동 저장 이력과 복원 결과. UUID는 사용자에게 노출하지 않는다. */
public record LedgerHistoryResponse(
        String batchNo,
        String partnerCode,
        LocalDate periodFrom,
        LocalDate periodTo,
        int lineCount,
        LocalDateTime savedAt,
        LedgerImageResponse ledger) {

    /** 목록 행 생성 — 내부 UUID와 압축 원문은 노출하지 않는다. */
    public static LedgerHistoryResponse summary(String batchNo, String partnerCode,
                                                 LocalDate from, LocalDate to, int lineCount,
                                                 LocalDateTime savedAt) {
        return new LedgerHistoryResponse(batchNo, partnerCode, from, to, lineCount, savedAt, null);
    }
}
