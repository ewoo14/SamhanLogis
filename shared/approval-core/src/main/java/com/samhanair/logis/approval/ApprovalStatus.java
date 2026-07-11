package com.samhanair.logis.approval;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 결재선 전체 상태.
 *
 * <ul>
 *   <li>{@link #PENDING} — 결재선 생성 직후, 1번째 결재자 처리 대기.</li>
 *   <li>{@link #IN_PROGRESS} — chain 의 일부 결재자가 승인했고 후속 결재자 대기 중.</li>
 *   <li>{@link #APPROVED} — chain 의 모든 결재자가 승인 완료.</li>
 *   <li>{@link #REJECTED} — chain 중 1명이라도 반려 → 즉시 종료.</li>
 *   <li>{@link #WITHDRAWN} — 요청자가 본인 결재선을 회수 (승인 진행 전 또는 진행 중 모두 가능).</li>
 * </ul>
 *
 * <p>APPROVED / REJECTED / WITHDRAWN 은 종료 상태 — 추가 승인/반려 호출 거부.
 */
@Getter
@RequiredArgsConstructor
public enum ApprovalStatus {

    PENDING("대기"),
    IN_PROGRESS("진행중"),
    APPROVED("승인"),
    REJECTED("반려"),
    WITHDRAWN("회수");

    private final String displayName;
}
