package com.samhanair.logis.accounting.domain;

/** 받을어음 상태. */
public enum NoteStatus {
    /** 보유. */
    BOARDING("보유"),
    /** 추심. */
    COLLECTING("추심"),
    /** 결제완료. */
    SETTLED("결제완료"),
    /** 부도. */
    DISHONORED("부도");

    private final String displayName;

    NoteStatus(String displayName) {
        this.displayName = displayName;
    }

    /**
     * 사용자 노출 메시지에 사용하는 한국어 상태 라벨.
     *
     * <p>clients/desktop 의 {@code NOTE_STATUS_LABEL} 과 값이 정합해야 한다(SSOT).
     *
     * @return 한국어 상태 표시명
     */
    public String getDisplayName() {
        return displayName;
    }
}
