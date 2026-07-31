package com.samhanair.logis.partnerorder.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 거래처 주문 direct PUT 수정 요청.
 *
 * <p>본사 SALES/MASTER/MANAGER 가 legacy GAS 와 같은 즉시 수정 흐름으로 주문 헤더와 라인을
 * 교체한다. {@code updatedAt} 은 상세 조회 시점의 {@code modifiedAt} 값이며 낙관적 잠금 비교에
 * 사용한다.
 */
public record PartnerOrderUpdateRequest(
        @NotNull LocalDateTime updatedAt,
        @NotBlank String partnerCode,
        @NotBlank String bizCode,
        LocalDate dueDate,
        String memo,
        @jakarta.validation.constraints.Size(max = 500) String deliveryAddress,
        @Valid @NotEmpty List<LineRequest> lines
) {

    /**
     * 주문 수정 라인. {@code productId} 는 화면에 노출하지 않는 내부 참조라 요청 DTO 에 포함하지 않고,
     * service 가 모델명/품목명 기반 stable reference 로 보정한다.
     * 금액 필드는 선택이다. 모두 생략하면 legacy PRICE 경로를 사용하고, authority가 있으면
     * 전표·견적과 같은 S/V/T 항등식 경로를 사용한다.
     */
    public record LineRequest(
            @NotBlank String modelCode,
            @NotBlank String productName,
            @NotBlank String categoryKey,
            int quantity,
            @NotNull BigDecimal deliveryPrice,
            String remark,
            BigDecimal supplyAmount,
            BigDecimal vatAmount,
            BigDecimal lineTotal,
            String authority
    ) {
        /** 기존 direct PUT 호출부의 6개 인자 계약을 보존한다. */
        public LineRequest(String modelCode, String productName, String categoryKey,
                           int quantity, BigDecimal deliveryPrice, String remark) {
            this(modelCode, productName, categoryKey, quantity, deliveryPrice, remark,
                    null, null, null, null);
        }
    }
}
