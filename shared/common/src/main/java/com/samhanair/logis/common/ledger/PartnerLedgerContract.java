package com.samhanair.logis.common.ledger;

import java.util.List;

/** 거래처 원장 산출기의 공통 업무 계약. public 응답에는 UUID를 포함하지 않는다. */
public final class PartnerLedgerContract {
    /** R17에서 현행 집계 기준으로 확정한 원장 판매 상태 집합. */
    public static final List<String> CANONICAL_SALE_STATUSES = List.of(
            "CONFIRMED", "DELIVERED", "COMPLETED");

    private PartnerLedgerContract() { }
}
