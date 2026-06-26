package com.samhanair.logis.dashboard.domain;

/** 클라이언트 버전 조회 응답에서 사용하는 최종 업데이트 강도. */
public enum AppVersionForceLevel {
    NONE,
    MINOR,
    MAJOR,
    CRITICAL
}
