package com.samhanair.logis.slip.domain.dispatch;

/**
 * DispatchTask 상태 머신 — Samhan Public 배차 메뉴 (Phase A).
 *
 * <pre>
 *   DRAFT       — 배차담당자가 차량 그룹/슬립 매핑 작성 중 (UI 편집 가능)
 *   DISPATCHING — 배차 완료 trigger → arologis 발송 후 매칭 대기
 *   DISPATCHED  — arologis 회신 (confirm) 성공 — 기사 매칭 완료
 *   FAILED      — arologis 회신 (unavailable) — 매칭 불가, 재배차 가능
 * </pre>
 *
 * <p>전이 규칙:
 * <ul>
 *   <li>DRAFT → DISPATCHING ({@code DispatchTaskCompletionService.dispatch()})</li>
 *   <li>DISPATCHING → DISPATCHED ({@code DispatchTaskConfirmService.confirm()})</li>
 *   <li>DISPATCHING → FAILED ({@code DispatchTaskUnavailableService.unavailable()})</li>
 *   <li>FAILED → DRAFT (재배차 — 본 Phase A 범위 외, Phase C 위임)</li>
 * </ul>
 */
public enum DispatchTaskStatus {
    DRAFT,
    DISPATCHING,
    DISPATCHED,
    FAILED
}
