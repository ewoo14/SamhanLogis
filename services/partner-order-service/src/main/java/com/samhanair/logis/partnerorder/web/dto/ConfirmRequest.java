package com.samhanair.logis.partnerorder.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 주문 확정 요청 (legacy sendOrderFromUi 6074). client 가 보낸 가격은 무시 — server-side 가
 * DC 적용 priceVat 권위.
 *
 * @param lines 라인 리스트 (1건 이상)
 * @param deliveryAddress 구조화된 실제 배송주소 (없으면 null 유지, 기존 호출 호환)
 */
public record ConfirmRequest(
        @NotEmpty @Valid List<ConfirmLineRequest> lines,
        @Size(max = 500) String deliveryAddress) {

    /** 기존 라인-only 요청 생성자 호환. */
    public ConfirmRequest(List<ConfirmLineRequest> lines) {
        this(lines, null);
    }
}
