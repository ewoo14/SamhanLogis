package com.samhanair.logis.arologis.domain;

/** 아로로지스 배차 저장내역 저장 방식. */
public enum DispatchSaveMode {
    /** 실행 직후 최신 결과 자동 저장. */
    AUTO_LATEST,
    /** 사용자가 이름을 붙여 보존하는 명시 저장. */
    MANUAL_NAMED
}
