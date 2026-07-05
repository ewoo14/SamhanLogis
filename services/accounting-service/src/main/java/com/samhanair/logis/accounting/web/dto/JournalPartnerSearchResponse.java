package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.client.PartnerSummary;
import java.util.UUID;

/**
 * 분개 작성 폼 거래처 검색 응답.
 *
 * <p>partnerId 는 분개 저장 payload 내부용이다. 화면 표시는 name / partnerCode / bizNo 만 사용한다.
 */
public record JournalPartnerSearchResponse(
        UUID partnerId,
        String partnerCode,
        String name,
        String bizNo
) {
    public static JournalPartnerSearchResponse from(PartnerSummary summary) {
        return new JournalPartnerSearchResponse(
                summary.partnerId(),
                summary.partnerCode(),
                summary.name(),
                summary.bizNo());
    }
}
