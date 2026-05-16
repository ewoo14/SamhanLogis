package com.samhanair.logis.inventory.domain;

/**
 * DPS 저장내역 프로그램 구분.
 *
 * <p>legacy GAS 의 {@code 프로그램유형} select 값을 Samhan Public DB enum 으로 옮긴다.
 * 두 프로그램의 저장내역은 같은 테이블을 쓰지만 목록, latest, 자동저장 교체는 본 값으로 격리한다.
 */
public enum DpsProgramType {
    /** DPS 입고기록 비교. */
    DPS_COMPARE,
    /** 품목별 DPS 입고내역 비교. */
    DPS_BY_PRODUCT
}
