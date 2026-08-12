package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.JournalLine;
import java.math.BigDecimal;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

/**
 * 분개 라인 1건 응답. UUID 미노출 원칙에 따라 lineId 는 운영 mutation 용으로만 노출한다.
 * 거래처 UUID 는 응답하지 않고 표시용 partnerName 만 제공한다.
 */
public record JournalLineResponse(
        @JsonSerialize(using = OpaqueUuidSerializer.class) java.util.UUID lineId,
        int lineNo,
        String accountCode,
        String accountName,
        BigDecimal debitAmount,
        BigDecimal creditAmount,
        String partnerName,
        String memo
) {
    public static JournalLineResponse of(JournalLine line) {
        return of(line, null, null);
    }

    public static JournalLineResponse of(JournalLine line, String accountName, String partnerName) {
        return new JournalLineResponse(
                line.getId(),
                line.getLineNo(),
                line.getAccountCode(),
                accountName,
                line.getDebitAmount(),
                line.getCreditAmount(),
                partnerName,
                line.getMemo()
        );
    }
}
