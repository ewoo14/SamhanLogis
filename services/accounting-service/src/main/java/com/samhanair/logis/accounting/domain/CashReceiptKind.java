package com.samhanair.logis.accounting.domain;

/** CashReceipt 발생 유형. */
public enum CashReceiptKind {
    /** MIG-7 이카운트 입금보고서 이관분. */
    DEPOSIT_REPORT,
    /** 사용자가 직접 작성한 입금보고서. */
    MANUAL_RECEIPT,
    /** 통장거래 N건을 합산해 생성한 입금보고서. */
    BANK_LINKED
}
