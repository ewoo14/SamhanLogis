package com.samhanair.logis.partnerorder.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 거래처 주문 상태 머신 (설계서 §3.6).
 *
 * <pre>
 *   DRAFT → POST /confirm → CONFIRMING (advisory lock)
 *     → DC + reserve + insert + slip 발행
 *     → CONFIRMED (slip 200 replay/201 신규)
 *     → CONFIRMED + slipPublishStatus=PENDING_RETRY (slip 5xx → outbox)
 *   CANCELED — 사용자 취소 (CONFIRMED 후 24h 내, 정책은 슬라이스 외)
 *   DRAFT ↔ ON_HOLD (보류/해제) — Phase 2.5
 *   DRAFT/ON_HOLD → convert-to-slip → CONVERTED (전량 전환 완료) — Phase 2.6a
 * </pre>
 */
@Getter
@RequiredArgsConstructor
public enum PartnerOrderStatus {
    /** 임시저장 (PartnerOrderDraft 와는 별도, confirm 후의 history 표시용). */
    DRAFT("진행중"),
    /** 보류 — 진행중(DRAFT)에서 멈춘 편집가능 상태 (Phase 2.5). DRAFT ↔ ON_HOLD 양방향. */
    ON_HOLD("보류"),
    /** confirm 진행 중 — advisory lock 보유. */
    CONFIRMING("확인중"),
    /** 확정 — slipNo 발급 시도 (성공 또는 retry 큐). */
    CONFIRMED("완료"),
    /** 거래처 취소 또는 admin 반려. */
    CANCELED("취소"),
    /** 전환완료 — 모든 라인이 출고전표로 전량 전환됨 (Phase 2.6a). */
    CONVERTED("전환완료");

    private final String displayName;
}
