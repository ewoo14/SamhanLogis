package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 결재 문서 참조용 거래명세서 검색 결과.
 *
 * <p>현재 accounting-service 의 거래명세서는 독립 엔티티가 아니라 ISSUED 세금계산서
 * 라인 스냅샷을 거래처별로 묶어 출력하는 구조다. 따라서 {@code statementNo} 는
 * 근거 문서인 세금계산서 번호를 사용한다.
 *
 * @param statementNo 거래명세서 참조 번호
 * @param date 거래일자
 * @param partnerName 거래처명
 * @param amount 합계금액
 */
public record AccountingStatementSearchResponse(
        String statementNo,
        LocalDate date,
        String partnerName,
        BigDecimal amount
) {
}
