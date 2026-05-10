package com.samhanair.logis.slip.mobile.dto;

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
 * 모바일 견적 발행 요청 — P1-4 Native 영업 앱 간소형.
 *
 * <p>기존 {@link com.samhanair.logis.slip.estimate.web.dto.CreateEstimateRequest} 를 모바일 최적화하여
 * 필수 필드를 최소화. 거래처 정보는 {@code partnerCode} 만 필수 (UUID 비공개 가드 의무).
 * 나머지 snapshot 정보는 service 레이어에서 partner-service 조회 후 자동 채움.
 *
 * <p>라인은 1건 이상 필수. 모바일에서는 복잡한 specification 입력 없이
 * 품목코드/수량/단가만으로 간소 발행 가능.
 */
public record MobileQuotationRequest(
        /** 거래처 코드 — UUID 비공개 가드, 사용자 노출 식별자. */
        @NotBlank @Size(max = 50) String partnerCode,

        /** 견적 작성일 (null 이면 오늘). */
        LocalDate estimateDate,

        /** 견적 유효기간 (null 이면 service 기본값 30일 적용). */
        LocalDate validUntil,

        /** 비고 (선택). */
        @Size(max = 1000) String memo,

        /** 견적 라인 (1건 이상 필수). */
        @NotEmpty @Valid List<MobileQuotationLineRequest> lines) {

    /**
     * 모바일 견적 라인 — 최소 필드.
     *
     * <p>productName / modelName 은 service 레이어에서 product-service 조회로 자동 보강.
     * 명시 전달 시 우선 적용 (현장 수정 케이스 지원).
     */
    public record MobileQuotationLineRequest(
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
