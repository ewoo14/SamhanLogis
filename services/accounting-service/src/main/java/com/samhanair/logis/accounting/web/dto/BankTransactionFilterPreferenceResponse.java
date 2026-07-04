package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.UserBankTxnFilter;
import java.util.List;

/**
 * 입출금내역 계좌/카드 필터 저장값 응답.
 *
 * <p>내부 userId/row UUID 는 응답하지 않는다.
 *
 * @param accountLabels 선택 계좌 label. 빈 배열은 전체 선택
 * @param cardLabels 선택 카드 label. 빈 배열은 전체 선택
 */
public record BankTransactionFilterPreferenceResponse(
        List<String> accountLabels,
        List<String> cardLabels
) {
    public static BankTransactionFilterPreferenceResponse from(UserBankTxnFilter filter) {
        return new BankTransactionFilterPreferenceResponse(
                List.copyOf(filter.getAccountLabels()),
                List.copyOf(filter.getCardLabels()));
    }

    public static BankTransactionFilterPreferenceResponse empty() {
        return new BankTransactionFilterPreferenceResponse(List.of(), List.of());
    }
}
