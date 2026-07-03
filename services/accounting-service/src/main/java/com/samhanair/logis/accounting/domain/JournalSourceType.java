package com.samhanair.logis.accounting.domain;

/**
 * 분개 출처 — Slice A 는 SLIP / MANUAL / CLOSING 만. SLIP/CLOSING 은 향후 슬라이스에서 활용
 * (A3 slip 자동 분개, Phase 5+ 결산).
 */
public enum JournalSourceType {

    /** 영업/창고 슬립에서 자동 생성된 분개 (A3 진입 시 활용). */
    SLIP,

    /** 회계 담당자 수동 입력 분개 (Slice A 본 슬라이스 기본 경로). */
    MANUAL,

    /** 결산 분개 (Phase 5+). */
    CLOSING,

    /** KFTC 오픈뱅킹 입금 자동 매칭 분개 (SP-09-4). */
    KFTC_DEPOSIT,

    /** MIG-9 지출결의서 CashDisbursement 에서 자동 생성된 분개. */
    CASH_DISBURSEMENT,

    /**
     * 입금보고서 CashReceipt 에서 자동 생성된 분개.
     *
     * <p>라이브 게시(confirm/updateConfirmed)는 {@code sourceRefId=CashReceipt UUID}. MIG-9 배치 게시분은
     * {@code source_ref} 문자열만 사용하고 {@code sourceRefId} 는 비운다. 취소/수정의 자동 역분개는
     * {@code sourceRefId=원분개 UUID}.
     */
    CASH_RECEIPT
}
