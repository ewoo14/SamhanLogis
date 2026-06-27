package com.samhanair.logis.accounting.client;

/**
 * 연결 자격에 등록된 은행계좌 표시 정보.
 *
 * @param ref           거래 조회에 사용할 계좌 ref
 * @param name          사용자 표시명
 * @param bankName      은행명
 * @param accountNumber 계좌번호 표시값
 */
public record AccountInfo(
        String ref,
        String name,
        String bankName,
        String accountNumber
) {
}
