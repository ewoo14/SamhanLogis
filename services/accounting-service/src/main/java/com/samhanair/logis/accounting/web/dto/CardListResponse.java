package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.client.CardInfo;
import java.util.List;

/** 카드 목록 응답. */
public record CardListResponse(
        List<CardItem> cards
) {
    public static CardListResponse from(List<CardInfo> cards) {
        return new CardListResponse(cards.stream()
                .map(CardItem::from)
                .toList());
    }

    /** 카드 표시 항목. */
    public record CardItem(
            String ref,
            String name,
            String issuerName,
            String cardNumber
    ) {
        private static CardItem from(CardInfo info) {
            return new CardItem(info.ref(), info.name(), info.issuerName(), info.cardNumber());
        }
    }
}
