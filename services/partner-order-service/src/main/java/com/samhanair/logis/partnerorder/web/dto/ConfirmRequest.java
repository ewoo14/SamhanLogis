package com.samhanair.logis.partnerorder.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/**
 * 주문 확정 요청 (legacy sendOrderFromUi 6074). client 가 보낸 가격은 무시 — server-side 가
 * DC 적용 priceVat 권위.
 *
 * @param lines 라인 리스트 (1건 이상)
 */
public record ConfirmRequest(
        @NotEmpty @Valid List<ConfirmLineRequest> lines) {
}
