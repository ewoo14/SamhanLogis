package com.samhanair.logis.slip.publish;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 병합 발행 시 출처 주문 1건 참조 — Phase 2.6b D2.
 *
 * <p>{@link PublishFromOrdersMergeRequest#sourceOrders()} 의 원소. slip-service 는 이 정보를
 * {@code slip_source_orders} 테이블(V30) 에 N행 INSERT 하여 병합 전표의 출처를 역추적한다.
 *
 * @param partnerOrderId 출처 주문 UUID (문자열)
 * @param orderNo        출처 주문번호 (사용자 노출 식별자 — UUID 비공개 원칙)
 */
public record SourceOrderRef(
        @NotBlank @Size(max = 64) String partnerOrderId,
        @NotBlank @Size(max = 64) String orderNo) {
}
