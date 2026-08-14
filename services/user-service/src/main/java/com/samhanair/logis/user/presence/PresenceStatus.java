package com.samhanair.logis.user.presence;

/** 삼한 메신저에서 사용자에게 표시하는 6가지 상태. 회의중·통화중은 수동 전용이다. */
public enum PresenceStatus {
    AVAILABLE("접속"),
    AWAY("자리비움"),
    ABSENT("부재중"),
    IN_MEETING("회의중"),
    ON_CALL("통화중"),
    OFFLINE("오프라인");

    private final String label;

    PresenceStatus(String label) { this.label = label; }

    public String label() { return label; }
}
