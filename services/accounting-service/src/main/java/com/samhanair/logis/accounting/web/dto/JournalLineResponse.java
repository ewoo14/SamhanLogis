package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.JournalLine;
import java.math.BigDecimal;
import java.util.UUID;

/**
 * 분개 라인 1건 응답. UUID 미노출 원칙에 따라 lineId 는 운영 mutation 용으로만 노출 (필요 시
 * FE 에서 숨김). 비즈니스 식별자(accountCode + lineNo + 금액) 위주.
 */
public record JournalLineResponse(
        UUID lineId,
        int lineNo,
        String accountCode,
        BigDecimal debitAmount,
        BigDecimal creditAmount,
        UUID partnerId,
        String partnerName,
        String memo
) {
    public static JournalLineResponse of(JournalLine line) {
        return new JournalLineResponse(
                line.getId(),
                line.getLineNo(),
                line.getAccountCode(),
                line.getDebitAmount(),
                line.getCreditAmount(),
                line.getPartnerId(),
                line.getPartnerName(),
                line.getMemo()
        );
    }
}
