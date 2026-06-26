package com.samhanair.logis.accounting.domain;

/** 통장 거래 수집 출처. */
public enum BankTxnSource {
    /** 사용자 CSV 업로드. */
    CSV_IMPORT,
    /** KFTC 오픈뱅킹 수집. */
    KFTC,
    /** CODEF 은행 계좌 거래내역 수집. */
    CODEF_BANK,
    /** CODEF 카드 승인내역 수집. */
    CODEF_CARD,
    /** CODEF 대출 거래내역 수집. */
    CODEF_LOAN
}
