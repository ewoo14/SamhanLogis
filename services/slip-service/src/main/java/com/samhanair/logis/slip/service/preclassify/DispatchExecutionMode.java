package com.samhanair.logis.slip.service.preclassify;

/** 레거시 가배차 분류 8개 실행 모드. 번호와 순서는 기존 계약을 유지한다. */
public enum DispatchExecutionMode {
    SANGIL_AND_CHOWOL_REGION_EXCLUDED(1), CHOWOL_REGION_EXCLUDED(2), SANGIL_REGION_EXCLUDED(3),
    STACK_ONLY(4), REGION_ONLY(5), SANGIL_AND_CHOWOL_REGION_INCLUDED(6),
    CHOWOL_REGION_INCLUDED(7), SANGIL_REGION_INCLUDED(8);
    private final int number;
    DispatchExecutionMode(int number) { this.number = number; }
    public int number() { return number; }
}
