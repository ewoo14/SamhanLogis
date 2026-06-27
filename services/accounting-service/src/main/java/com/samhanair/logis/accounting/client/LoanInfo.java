package com.samhanair.logis.accounting.client;

/**
 * 연결 자격에 등록된 대출 표시 정보.
 *
 * @param ref        거래 조회에 사용할 대출 ref
 * @param name       사용자 표시명
 * @param lenderName 금융기관명
 * @param loanType   대출 상품 구분
 */
public record LoanInfo(
        String ref,
        String name,
        String lenderName,
        String loanType
) {
}
