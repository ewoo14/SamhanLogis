package com.samhanair.logis.slip.mobile.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.samhanair.logis.slip.web.dto.OpaqueUuidDeserializer;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 모바일 거래처 주문 발행 요청 — P1-4 Native 영업 앱.
 *
 * <p>출장 중 영업 직원이 거래처 현장에서 주문을 즉시 등록하는 간소형 요청.
 * 내부적으로 OUTBOUND 타입의 슬립(Slip)을 DRAFT 상태로 생성한다.
 *
 * <p>거래처는 {@code partnerCode} 로만 식별 (UUID 비공개 가드).
 * 출고전표는 항상 출고 창고({@code sourceWarehouseId}) 를 지정해야 하며,
 * 필수 여부는 {@code Slip.createOutbound} 도메인 팩토리에서 검증한다.
 */
public record MobilePartnerOrderRequest(
        /** 거래처 코드 — UUID 비공개 가드, 사용자 노출 식별자. 필수. */
        @NotBlank @Size(max = 50) String partnerCode,

        /** 슬립 날짜 (null 이면 오늘). */
        LocalDate slipDate,

        /** 출고 창고 UUID (필수 — 도메인 팩토리에서 미지정 발행을 차단). */
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        UUID sourceWarehouseId,

        /** 배송지 주소 snapshot (선택). */
        @Size(max = 500) String shippingAddress,

        /** 수령자 연락처 (선택). */
        @Size(max = 100) String receiverPhone,

        /** 비고 (선택). */
        @Size(max = 1000) String memo,

        /** 주문 라인 (1건 이상 필수). */
        @NotEmpty @Valid List<MobileOrderLineRequest> lines) {

    /**
     * 모바일 주문 라인.
     *
     * <p>productName / modelName 은 product-service 조회로 자동 보강.
     * 명시 전달 시 우선 적용 (현장 특주/약칭 케이스 지원).
     */
    public record MobileOrderLineRequest(
            /** 품목 UUID — product-service 검증 대상. */
            @NotNull UUID productId,

            /** 품목명 snapshot (null 이면 product-service 조회값 사용). */
            @Size(max = 200) String productName,

            /** 모델명 snapshot (null 이면 product-service 조회값 사용). */
            @Size(max = 100) String modelName,

            /** 규격 (선택). */
            @Size(max = 50) String specification,

            /** 수량 (1 이상 필수). */
            @NotNull @Positive Integer quantity,

            /** 단가 (0 이상 필수). */
            @NotNull @DecimalMin("0.00") BigDecimal unitPrice,

            /** 라인 비고 (선택). */
            @Size(max = 200) String note) {
    }
}
