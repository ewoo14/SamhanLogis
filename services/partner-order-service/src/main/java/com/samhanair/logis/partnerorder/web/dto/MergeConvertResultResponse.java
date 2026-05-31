package com.samhanair.logis.partnerorder.web.dto;

import java.util.List;

/**
 * 다중 주문 병합 전환 결과 — Phase 2.6b D2.
 *
 * <p>{@code POST /api/v1/partner-orders/convert-to-slip-merge} 응답.
 * 여러 주문을 단일 출고전표로 병합 발행한 결과를 담는다.
 *
 * @param slipNo 발급된 단일 출고전표 번호 (사용자 노출 식별자 — UUID 비공개)
 * @param convertedOrders 전환된 주문별 상태 목록
 */
public record MergeConvertResultResponse(String slipNo, List<OrderResult> convertedOrders) {

    /**
     * 주문 1건의 전환 결과.
     *
     * <p>UUID 비공개 원칙({@code feedback_uuid_no_user_visibility})에 따라
     * UUID 대신 사용자 표시용 주문번호({@code orderNo}) 를 반환한다.
     * FE 는 이 값으로 목록 행과 correlation 가능하다.
     *
     * @param orderNo 사용자 표시용 주문번호 (예: {@code 2026/05/31-1})
     * @param orderStatus 전환 후 주문 status (DRAFT / ON_HOLD / CONVERTED)
     * @param fullyConverted 전 라인 전량 전환 완료 여부
     */
    public record OrderResult(String orderNo, String orderStatus, boolean fullyConverted) {}
}
