package com.samhanair.logis.arologis.domain;

/**
 * 아로로지스 배차 알림 발송 상태.
 *
 * <p>enum 이름을 FE {@code NotifyStatus} 계약과 동일하게 유지하여 JSON 직렬화 시
 * SUCCESS / FAILED / DELAYED 로 노출한다.
 */
public enum ArologisNotifyStatus {
    /** 발송 성공. */
    SUCCESS,
    /** 발송 실패. */
    FAILED,
    /** 지연 또는 처리 대기. */
    DELAYED
}
