package com.samhanair.logis.partnerorder.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/**
 * 단일 주문 부분전환 요청 — Phase 2.6a.
 *
 * <p>{@code POST /api/v1/partner-orders/{id}/convert-to-slip} 요청 본문.
 * items 는 선택할 주문 라인 + 이번 전환 수량 목록이며 1개 이상 필수.
 * warehouseCode 는 slip-service 창고 코드 — 명시적 값 필수
 * (null/blank 시 서비스에서 409 CONFLICT 반환. "DEFAULT" 폴백 금지).
 */
public record ConvertToSlipRequest(
        @NotNull @NotEmpty @Valid List<Item> items,
        String warehouseCode
) {

    /**
     * 라인별 전환 항목 — 주문 라인 UUID + 이번 전환 수량.
     *
     * @param orderLineId 주문 라인 UUID (PartnerOrderLine.id)
     * @param quantity 이번 전환할 수량 (1 이상)
     */
    public record Item(
            @NotNull UUID orderLineId,
            @NotNull @Min(1) Integer quantity
    ) {}
}
