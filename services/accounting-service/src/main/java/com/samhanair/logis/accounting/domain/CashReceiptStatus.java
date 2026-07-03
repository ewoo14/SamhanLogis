package com.samhanair.logis.accounting.domain;

/** 입금보고서 상태. */
public enum CashReceiptStatus {
    /** 수기 작성 중. 자유 수정·coedit·soft-delete 가능. */
    DRAFT,
    /** 확정됨 — POSTED 분개가 자동 게시된 상태. 수정 시 역분개 후 재게시된다. */
    CONFIRMED,
    /** 취소됨 — 원분개가 있으면 역분개가 자동 게시된 종결 상태. 이후 모든 mutation 거부. */
    CANCELLED
}
