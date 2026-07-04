package com.samhanair.logis.accounting.domain;

/** 입금보고서 상태. */
public enum CashReceiptStatus {
    /** 수기 작성 중. 자유 수정·coedit·soft-delete 가능. */
    DRAFT("임시저장"),
    /**
     * 확정됨 — 라이브 확정은 POSTED 분개가 연결된다. MIG 미게시 이관 행은 journalId=null 일 수 있으며,
     * 수정 시 신규 게시, 취소 시 원분개가 있으면 역분개된다.
     */
    CONFIRMED("확정"),
    /** 취소됨 — 원분개가 있으면 역분개가 자동 게시된 종결 상태. 이후 모든 mutation 거부. */
    CANCELLED("취소");

    private final String displayName;

    CashReceiptStatus(String displayName) {
        this.displayName = displayName;
    }

    /**
     * 사용자 노출 메시지에 사용하는 한국어 상태 라벨.
     *
     * @return 한국어 상태 표시명
     */
    public String getDisplayName() {
        return displayName;
    }
}
