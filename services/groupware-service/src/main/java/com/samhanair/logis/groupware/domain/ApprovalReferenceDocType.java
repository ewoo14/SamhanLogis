package com.samhanair.logis.groupware.domain;

/** 결재 첨부 참조 문서의 실제 업무 유형. */
public enum ApprovalReferenceDocType {
    /** 출고전표. */
    OUTBOUND_SLIP,
    /** 입고전표. */
    INBOUND_SLIP,
    /** 분개장. */
    JOURNAL,
    /** 세금계산서. */
    TAX_INVOICE,
    /** 거래명세서. */
    STATEMENT,
    /** 거래처원장. */
    PARTNER_LEDGER,
    /** 영업수수료 정산서. */
    SALES_COMMISSION_SETTLEMENT
}
