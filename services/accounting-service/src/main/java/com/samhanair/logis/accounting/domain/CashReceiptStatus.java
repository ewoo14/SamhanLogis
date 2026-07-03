package com.samhanair.logis.accounting.domain;

/** 입금보고서 상태. */
public enum CashReceiptStatus {
    /** 수기 작성 중. 자유 수정·coedit·soft-delete 가능. */
    DRAFT,
    /**
     * 확정됨 — 라이브 확정은 POSTED 분개가 연결된다. MIG 미게시 이관 행은 journalId=null 일 수 있으며,
     * 수정 시 신규 게시, 취소 시 원분개가 있으면 역분개된다.
     */
    CONFIRMED,
    /** 취소됨 — 원분개가 있으면 역분개가 자동 게시된 종결 상태. 이후 모든 mutation 거부. */
    CANCELLED
}
