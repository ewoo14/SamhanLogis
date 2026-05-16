package com.samhanair.logis.arologis.domain;

/** 아로로지스 배차 저장내역 프로그램 구분. */
public enum DispatchProgramType {
    /** 가배차 권역 분류. */
    PRE_CLASSIFY,
    /** 지방가배차 시도 분류. */
    REGIONAL,
    /** 미배차 리스트. */
    UNASSIGNED,
    /** 운송사 실배차 비교. */
    RECONCILE
}
