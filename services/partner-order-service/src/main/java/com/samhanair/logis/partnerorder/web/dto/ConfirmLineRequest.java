package com.samhanair.logis.partnerorder.web.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.util.UUID;

/**
 * 확정 요청 라인. {@code categoryKey} 는 legacy 의 16종 카테고리 (homemulti / singleSets / ...).
 *
 * <p>{@code clientPrice} 는 표시용 — server 는 {@link com.samhanair.logis.partnerorder.client.DcConfigClient}
 * 호출 결과로 priceVat 를 계산. 가격 위변조 방지.
 *
 * <p>거래처 주문 화면은 UUID를 사용자에게 노출하지 않으므로 {@code productId} 대신
 * {@code modelCode}를 보낼 수 있다. 서버는 product-service 내부 조회로 UUID를 해석한다.
 */
public record ConfirmLineRequest(
        UUID productId,
        String modelCode,
        @NotBlank String categoryKey,
        @Min(1) int quantity,
        String remark) {

    /** 기존 UUID 기반 호출자 호환 생성자. */
    public ConfirmLineRequest(UUID productId, String categoryKey, int quantity, String remark) {
        this(productId, null, categoryKey, quantity, remark);
    }
}
