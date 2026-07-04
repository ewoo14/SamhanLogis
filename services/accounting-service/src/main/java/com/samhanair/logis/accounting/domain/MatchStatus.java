package com.samhanair.logis.accounting.domain;

/** 입출금 거래 회계 반영 상태. */
public enum MatchStatus {
    /** 아직 회계 반영 전. */
    UNREFLECTED("미반영"),
    /** 회계 분개로 반영 완료. */
    REFLECTED("반영"),
    /** 거래처 매칭 없이 강제 반영. */
    FORCED("강제반영");

    private final String displayName;

    MatchStatus(String displayName) {
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
