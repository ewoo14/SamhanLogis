package com.samhanair.logis.accounting.domain;

public enum SalesTaxType {
    /** 과세 (10% VAT). */
    TAXABLE,
    /** 영세율 (0% VAT, 세금계산서 의무). */
    ZERO_RATED,
    /** 면세 (VAT 없음, 면세계산서 별도). */
    EXEMPT
}
