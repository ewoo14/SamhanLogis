package com.samhanair.logis.common.ledger;

import java.util.List;

/** 거래처 원장 산출기의 공통 업무 계약. public 응답에는 UUID를 포함하지 않는다. */
public final class PartnerLedgerContract {
    /** R22 개발책임자 결정의 원장 판매 상태 집합. */
    public static final List<String> CANONICAL_SALE_STATUSES = List.of(
            "CONFIRMED", "DELIVERED", "COMPLETED", "INSPECTING", "SHIPPING");

    private PartnerLedgerContract() { }
}
