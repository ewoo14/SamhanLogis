package com.samhanair.logis.slip.domain.dispatch;

/**
 * DispatchTask 상태 머신 — Samhan Public 배차 메뉴 (Phase A) + 수정/취소 흐름 (Phase C).
 *
 * <pre>
 *   --- Phase A (4 값) ---
 *   DRAFT       — 배차담당자가 차량 그룹/슬립 매핑 작성 중 (UI 편집 가능)
 *   DISPATCHING — 배차 완료 trigger → arologis 발송 후 매칭 대기
 *   DISPATCHED  — arologis 회신 (confirm) 성공 — 기사 매칭 완료
 *   FAILED      — arologis 회신 (unavailable) — 매칭 불가, 재배차 가능
 *
 *   --- Phase C (수정/취소 7 값) ---
 *   MODIFICATION_REQUESTED — DISPATCHED 상태에서 배차담당자가 수정 요청 발송
 *   MODIFICATION_ACCEPTED  — 아로로지스 수정 수락 → 배차담당자가 다시 편집 가능 + arologis Dispatch soft-delete 완료
 *   MODIFICATION_REJECTED  — 아로로지스 수정 거부 (rejectionReason 보유, status 유지)
 *   CANCEL_REQUESTED       — DISPATCHED 상태에서 배차담당자가 취소 요청 발송
 *   CANCEL_ACCEPTED        — 아로로지스 취소 수락 (정정 → CANCELLED 로 final)
 *   CANCEL_REJECTED        — 아로로지스 취소 거부 (rejectionReason 보유)
 *   CANCELLED              — 최종 취소 완료 (CANCEL_ACCEPTED 후 slip UNDISPATCHED 복귀 + arologis Dispatch soft-delete 완료)
 * </pre>
 *
 * <p>전이 규칙 (Phase A):
 * <ul>
 *   <li>DRAFT → DISPATCHING ({@code DispatchTaskCompletionService.dispatch()})</li>
 *   <li>DISPATCHING → DISPATCHED ({@code DispatchTaskConfirmService.confirm()})</li>
 *   <li>DISPATCHING → FAILED ({@code DispatchTaskUnavailableService.unavailable()})</li>
 * </ul>
 *
 * <p>전이 규칙 (Phase C, D-DC-02 ~ D-DC-05):
 * <ul>
 *   <li>DISPATCHED → MODIFICATION_REQUESTED ({@code DispatchTaskModificationRequestService.request()})</li>
 *   <li>MODIFICATION_REQUESTED → MODIFICATION_ACCEPTED ({@code DispatchTaskModificationDecisionService.accept()})</li>
 *   <li>MODIFICATION_REQUESTED → MODIFICATION_REJECTED ({@code .reject()}, status 는 결과적으로 DISPATCHED 로 복귀)</li>
 *   <li>MODIFICATION_ACCEPTED → DRAFT (재 [배차 완료] 시작, D-DC-08)</li>
 *   <li>DISPATCHED → CANCEL_REQUESTED ({@code DispatchTaskCancellationRequestService.request()})</li>
 *   <li>CANCEL_REQUESTED → CANCEL_ACCEPTED → CANCELLED ({@code DispatchTaskCancellationDecisionService.accept()})</li>
 *   <li>CANCEL_REQUESTED → CANCEL_REJECTED ({@code .reject()}, status 는 결과적으로 DISPATCHED 로 복귀)</li>
 * </ul>
 */
public enum DispatchTaskStatus {
    DRAFT("작성 중"),
    DISPATCHING("발송 완료, 매칭 대기"),
    DISPATCHED("배차 완료"),
    FAILED("배차 불가"),
    // ---- Phase C 신규 (D-DC-03) ----
    MODIFICATION_REQUESTED("수정 요청 중"),
    MODIFICATION_ACCEPTED("수정 수락됨"),
    MODIFICATION_REJECTED("수정 거부됨"),
    CANCEL_REQUESTED("취소 요청 중"),
    CANCEL_ACCEPTED("취소 수락됨"),
    CANCEL_REJECTED("취소 거부됨"),
    CANCELLED("배차 취소 완료");

    private final String displayName;

    DispatchTaskStatus(String displayName) {
        this.displayName = displayName;
    }

    /**
     * 사용자 노출 메시지/배지에 사용하는 한국어 상태 라벨.
     *
     * <p>desktop {@code DISPATCH_TASK_STATUS_LABEL} (clients/desktop/src/renderer/api/dispatchTask.ts)
     * 과 동일한 문구를 SSOT 로 사용한다 (#725 — IllegalState 상태전이 메시지 sweep).
     *
     * @return 한국어 상태 표시명
     */
    public String getDisplayName() {
        return displayName;
    }
}
