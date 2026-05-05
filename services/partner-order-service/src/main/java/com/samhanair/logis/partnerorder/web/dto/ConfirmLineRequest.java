package com.samhanair.logis.partnerorder.web.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * 확정 요청 라인. {@code categoryKey} 는 legacy 의 16종 카테고리 (homemulti / singleSets / ...).
 *
 * <p>{@code clientPrice} 는 표시용 — server 는 {@link com.samhanair.logis.partnerorder.client.DcConfigClient}
 * 호출 결과로 priceVat 를 계산. 가격 위변조 방지.
 */
public record ConfirmLineRequest(
        @NotNull UUID productId,
        @NotBlank String categoryKey,
        @Min(1) int quantity,
        String remark) {
}
