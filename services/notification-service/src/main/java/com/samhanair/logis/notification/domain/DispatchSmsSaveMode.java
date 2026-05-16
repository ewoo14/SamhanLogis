package com.samhanair.logis.notification.domain;

/** 배차문자 저장 방식. */
public enum DispatchSmsSaveMode {
    /** preview 결과 자동 최신 저장. */
    AUTO_LATEST,
    /** 운영자가 이름을 붙여 저장하는 preview 결과. */
    MANUAL_NAMED,
    /** SMS send 이후 append-only 로 남기는 발송 감사 이력. */
    SEND_AUDIT
}
