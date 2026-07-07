package com.samhanair.logis.slip.domain.dispatch;

/**
 * Slip 의 배차 상태 — Samhan Public 배차 메뉴 (Phase A, D-DB-04).
 *
 * <p>{@code slips} 테이블의 {@code dispatch_status} 컬럼에 매핑되며 배차 메뉴 미배차 목록
 * 필터링 기준이 된다.
 *
 * <pre>
 *   UNDISPATCHED — 배차 메뉴 "미배차" 목록 source (default)
 *   DISPATCHING  — 배차 완료 trigger 후 arologis 발송 → 매칭 대기
 *   DISPATCHED   — arologis confirm 회신 완료 — 기사 매칭 완료
 * </pre>
 *
 * <p>arologis FAILED 회신 시 매핑된 slip 의 dispatchStatus 는 UNDISPATCHED 로 복귀.
 */
public enum SlipDispatchStatus {
    UNDISPATCHED("미배차"),
    DISPATCHING("발송 완료, 매칭 대기"),
    DISPATCHED("배차 완료");

    private final String displayName;

    SlipDispatchStatus(String displayName) {
        this.displayName = displayName;
    }

    /**
     * 사용자 노출 메시지/배지에 사용하는 한국어 상태 라벨.
     *
     * <p>desktop {@code SLIP_DISPATCH_STATUS_LABEL} (clients/desktop/src/renderer/api/dispatchBoard.ts)
     * 과 동일한 문구를 SSOT 로 사용한다 (#725 — IllegalState 상태전이 메시지 sweep).
     *
     * @return 한국어 상태 표시명
     */
    public String getDisplayName() {
        return displayName;
    }
}
