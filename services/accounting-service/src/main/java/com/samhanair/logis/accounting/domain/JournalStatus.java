package com.samhanair.logis.accounting.domain;

/**
 * 분개 상태 (Plan §2 라이프사이클 표).
 * <pre>
 *   DRAFT → POSTED → REVERSED
 * </pre>
 * DRAFT 만 직접 수정/라인 변경 가능 (Q7 — audit safe). POSTED 후엔 reverse 로 역분개 자동 생성.
 */
public enum JournalStatus {

    /** 작성 중 — 라인 추가/제거/수정 허용. 시산표 집계 미포함. */
    DRAFT,

    /** 게시 완료 — 시산표 집계 포함. 직접 수정 불가, reverse 만 가능. */
    POSTED,

    /** 원분개가 역분개 처리됨 — 원분개(REVERSED)와 신규 반대분개(POSTED)를 함께 보존·집계한다. */
    REVERSED
}
