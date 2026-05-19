package com.samhanair.logis.accounting.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/** MIG-2 통장계좌 row 의 운영 분류. */
@Getter
@RequiredArgsConstructor
public enum CardType {
    CREDIT("신용카드"),
    DEBIT("체크카드"),
    BANK_ACCOUNT("통장계좌");

    private final String displayName;
}
