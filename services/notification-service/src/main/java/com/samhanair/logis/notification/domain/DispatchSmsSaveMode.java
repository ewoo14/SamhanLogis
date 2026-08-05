package com.samhanair.logis.notification.domain;

/** 배차문자 저장 방식. */
public enum DispatchSmsSaveMode {
    /** preview 결과 자동 최신 저장. */
    AUTO_LATEST,
    /** 운영자가 이름을 붙여 저장하는 preview 결과. */
    MANUAL_NAMED;

    /** 저장주제를 반드시 받아야 하는 append 이력인지 반환한다. */
    public boolean requiresTopic() {
        return this == MANUAL_NAMED;
    }
}
