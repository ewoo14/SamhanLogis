package com.samhanair.logis.partnerorder.web.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.Map;

/**
 * 확정 요청 라인. {@code categoryKey} 는 legacy 의 16종 카테고리 (homemulti / singleSets / ...).
 *
 * <p>{@code unitPrice} 는 세트 구성품의 서버 계산 입력을 화면과 일치시키기 위한
 * {@code setAllocation=true} 라인에서만 의미가 있다. 그 밖의 라인은 서버가
 * {@link com.samhanair.logis.partnerorder.client.DcConfigClient} 결과를 최종 권위로 사용한다.
 *
 * <p>거래처 주문 화면은 UUID를 사용자에게 노출하지 않으므로 {@code productId} 대신
 * {@code modelCode}를 보낼 수 있다. 서버는 product-service 내부 조회로 UUID를 해석한다.
 */
public record ConfirmLineRequest(
        UUID productId,
        String modelCode,
        @NotBlank String categoryKey,
        @Min(1) int quantity,
        BigDecimal unitPrice,
        String remark,
        boolean setAllocation,
        String productName,
        Map<String, Object> bundleSetOptions) {

    /** 기존 UUID 기반 호출자 호환 생성자. */
    public ConfirmLineRequest(UUID productId, String categoryKey, int quantity, String remark) {
        this(productId, null, categoryKey, quantity, null, remark, false, null, null);
    }

    /** 모델코드 기반 기존 호출자 호환 생성자. */
    public ConfirmLineRequest(UUID productId, String modelCode, String categoryKey,
                              int quantity, String remark) {
        this(productId, modelCode, categoryKey, quantity, null, remark, false, null, null);
    }

    /** 기존 단가 포함 호출자 호환 생성자. 일반 라인에서는 단가를 권위로 승격하지 않는다. */
    public ConfirmLineRequest(UUID productId, String modelCode, String categoryKey,
                              int quantity, BigDecimal unitPrice, String remark) {
        this(productId, modelCode, categoryKey, quantity, unitPrice, remark, false, null, null);
    }

    /** 가격 계산 테스트·기존 내부 호출자 호환 생성자 — setAllocation만 지정한다. */
    public ConfirmLineRequest(UUID productId, String modelCode, String categoryKey,
                              int quantity, BigDecimal unitPrice, String remark,
                              boolean setAllocation) {
        this(productId, modelCode, categoryKey, quantity, unitPrice, remark,
                setAllocation, null, null);
    }
}
