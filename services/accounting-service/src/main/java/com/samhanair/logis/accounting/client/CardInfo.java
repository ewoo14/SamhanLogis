package com.samhanair.logis.accounting.client;

/**
 * 연결 자격에 등록된 법인카드 표시 정보.
 *
 * @param ref        거래 조회에 사용할 카드 ref
 * @param name       사용자 표시명
 * @param issuerName 카드사명
 * @param cardNumber 카드번호 표시값
 */
public record CardInfo(
        String ref,
        String name,
        String issuerName,
        String cardNumber
) {
}
