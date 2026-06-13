package com.samhanair.logis.collab;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/** 협업 대상 문서 유형. 화면에는 {@link #displayName} 만 노출한다. */
@Getter
@RequiredArgsConstructor
public enum CollabDocumentType {
    DISPATCH_TASK("배차 작업"),
    SLIP_OUTBOUND("출고전표"),
    SLIP_INBOUND("입고전표"),
    ACCOUNTING_VOUCHER("회계 전표"),
    PARTNER_ORDER("거래처 주문서"),
    ESTIMATE("견적서"),
    APPROVAL_LINE("결재선");

    private final String displayName;
}
