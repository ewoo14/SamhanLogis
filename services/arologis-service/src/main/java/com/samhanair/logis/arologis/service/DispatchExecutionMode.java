package com.samhanair.logis.arologis.service;

/**
 * 레거시 가배차분류리스트가 제공하던 8개 실행 모드.
 *
 * <p>모드 번호는 기존 사용자의 저장 결과와 호환되도록 고정한다.
 */
public enum DispatchExecutionMode {
    /** 상일·초월 창고, 지방 제외. */
    SANGIL_AND_CHOWOL_REGION_EXCLUDED(1),
    /** 초월 창고, 지방 제외. */
    CHOWOL_REGION_EXCLUDED(2),
    /** 상일 창고, 지방 제외. */
    SANGIL_REGION_EXCLUDED(3),
    /** 야적만. */
    STACK_ONLY(4),
    /** 지방만. */
    REGION_ONLY(5),
    /** 상일·초월 창고, 지방 포함. */
    SANGIL_AND_CHOWOL_REGION_INCLUDED(6),
    /** 초월 창고, 지방 포함. */
    CHOWOL_REGION_INCLUDED(7),
    /** 상일 창고, 지방 포함. */
    SANGIL_REGION_INCLUDED(8);

    private final int number;

    DispatchExecutionMode(int number) {
        this.number = number;
    }

    /** 레거시 화면의 모드 번호. */
    public int number() {
        return number;
    }
}
