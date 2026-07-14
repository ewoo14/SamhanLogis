package com.samhanair.logis.arologis.domain;

/**
 * 아로로지스 배차 알림 발송 채널.
 *
 * <p>notification-service transport channel이 아니라 배차 상세 화면에 노출할 도메인 채널이다.
 * FE wire 값은 {@link #getWireValue()}를 사용한다.
 */
public enum ArologisNotifyChannel {
    /** 향후 인성 알림톡 vendor 연동을 위해 예약한 채널. 현재 배차 매칭 알림 발송에는 사용하지 않는다. */
    INSUNG_TALK("insung-talk"),
    /** notification-service SMS(Aligo gateway)로 발송한 배차 매칭 알림 채널. */
    ALIGO("aligo");

    private final String wireValue;

    ArologisNotifyChannel(String wireValue) {
        this.wireValue = wireValue;
    }

    /** FE 계약에 사용하는 wire 문자열. */
    public String getWireValue() {
        return wireValue;
    }
}
