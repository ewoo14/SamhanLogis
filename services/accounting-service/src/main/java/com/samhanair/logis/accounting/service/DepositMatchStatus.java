package com.samhanair.logis.accounting.service;

/**
 * 입금 거래 자동 매칭 상태 (SP-09-4).
 *
 * <ul>
 *   <li>{@link #MATCHED} — 거래처명/금액 기준 자동 매칭 성공 + 분개 DRAFT 생성 완료.</li>
 *   <li>{@link #UNMATCHED} — 자동 매칭 실패. 사용자 수동 매칭 필요.</li>
 * </ul>
 */
public enum DepositMatchStatus {

    /** 자동 매칭 성공 — 분개 DRAFT 생성 완료. */
    MATCHED,

    /** 자동 매칭 실패 — 수동 매칭 필요. */
    UNMATCHED
}
