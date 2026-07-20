package com.samhanair.logis.partnerorder.domain;

/**
 * PartnerOrderHistory 의 event_type (설계서 §3.4 — 8종).
 */
public enum HistoryEventType {
    /** 임시저장 생성. */
    DRAFT_CREATED,
    /** 임시저장 업데이트. */
    DRAFT_UPDATED,
    /** 임시저장 삭제 (확정 또는 사용자 삭제). */
    DRAFT_DELETED,
    /** 확정 (slip 발행 시도 시작). */
    CONFIRMED,
    /** slip-service 발행 성공 — slipNo 채워짐. */
    SLIP_PUBLISHED,
    /** slip-service 5xx → outbox PENDING. */
    SLIP_RETRY_QUEUED,
    /** 복구 불가능한 입력/충돌 또는 max-retry-hours 초과로 영구 실패. */
    SLIP_FAILED_PERMANENT,
    /** 거래처 취소 또는 admin 반려. */
    CANCELED
}
