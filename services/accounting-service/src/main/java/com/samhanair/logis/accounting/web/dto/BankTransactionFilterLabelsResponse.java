package com.samhanair.logis.accounting.web.dto;

import java.util.List;

/**
 * 입출금내역 필터 모달에 표시할 계좌/카드 label 목록.
 *
 * @param accountLabels 계좌 label
 * @param cardLabels 카드 label
 */
public record BankTransactionFilterLabelsResponse(
        List<String> accountLabels,
        List<String> cardLabels
) {
}
