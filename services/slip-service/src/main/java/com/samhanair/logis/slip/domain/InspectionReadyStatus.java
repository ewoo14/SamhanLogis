package com.samhanair.logis.slip.domain;

/**
 * 구매관리 입고 검수 CTA 준비 상태.
 *
 * <p>INBOUND 전표 상세 응답에서만 사용한다. SAVED / CONFIRMED 는 구매관리 화면에서
 * 입고 검수 Dialog 진입이 가능한 상태이며, 그 외 단계는 대기 상태다.
 */
public enum InspectionReadyStatus {
    READY,
    NOT_READY
}
