package com.samhanair.logis.arologis.domain;

/**
 * 아로로지스 배차 알림 발송 채널.
 *
 * <p>notification-service 의 transport channel 이 아니라 배차 상세 화면에서 표시하는
 * 아로로지스 도메인 채널이다. FE wire 값은 {@link #getWireValue()} 로 노출한다.
 */
public enum ArologisNotifyChannel {
    /** 인성 알림톡. */
    INSUNG_TALK("insung-talk"),
    /** Aligo SMS. */
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
