package com.samhanair.logis.inventory.domain;

/**
 * DPS 저장내역 저장 방식.
 *
 * <p>{@link #AUTO_LATEST} 는 재방문 자동 복원용 최신 1건, {@link #MANUAL_NAMED} 는 사용자가
 * 저장주제를 붙여 기간 조회와 과거 재현에 사용하는 누적 저장이다.
 */
public enum DpsSaveMode {
    /** 사용자+프로그램별 최신 활성 1건만 유지하는 자동 저장. */
    AUTO_LATEST,
    /** 사용자가 저장주제를 입력한 명시 저장. */
    MANUAL_NAMED
}
