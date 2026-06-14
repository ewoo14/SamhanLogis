package com.samhanair.logis.accounting.web.dto;

/**
 * 결재 문서 참조용 거래처원장 거래처 검색 결과.
 *
 * @param partnerCode 거래처 코드
 * @param partnerName 거래처명
 */
public record AccountingLedgerPartnerSearchResponse(
        String partnerCode,
        String partnerName
) {
}
