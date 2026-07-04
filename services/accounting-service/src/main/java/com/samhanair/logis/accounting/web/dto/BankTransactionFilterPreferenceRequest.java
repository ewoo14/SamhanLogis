package com.samhanair.logis.accounting.web.dto;

import java.util.List;

/**
 * 입출금내역 계좌/카드 필터 저장 요청.
 *
 * @param accountLabels 선택 계좌 label. 빈 배열은 전체 선택
 * @param cardLabels 선택 카드 label. 빈 배열은 전체 선택
 */
public record BankTransactionFilterPreferenceRequest(
        List<String> accountLabels,
        List<String> cardLabels
) {
}
