package com.samhanair.logis.dcconfig.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.math.BigDecimal;
import java.util.List;

/**
 * 가격 계산 요청 — internal `POST /internal/price-calculations` body.
 *
 * <p>호출자 (estimate-service / partner-order-service) 가 라인별로 정상가 + 카테고리 + 옵션
 * 을 보내면 dc-config-service 가 DcConfig + DcRule 을 적용한 단가를 응답.
 */
@Schema(description = "DC 적용 가격 계산 요청")
public record PriceCalculationRequest(
        @Schema(description = "거래처 코드") @NotBlank String partnerCode,
        @Schema(description = "호출자 서비스명 (감사 로그용)") @NotBlank String callerService,
        @Schema(description = "라인 항목") @NotEmpty @Valid List<Line> lines
) {

    @Schema(description = "가격 계산 라인")
    public record Line(
            @Schema(description = "라인 식별자 (호출자 임의)") @NotBlank String lineId,
            @Schema(description = "모델 코드") String modelCode,
            @Schema(description = "정상가 (정수 원)") @NotNull @PositiveOrZero BigDecimal listPrice,
            @Schema(description = "카테고리 — HOMEMULTI / COMMERCIAL_MULTI / OTHER") @NotBlank String category,
            @Schema(description = "수량") @NotNull @PositiveOrZero Integer quantity,
            @Schema(description = "옵션 - 360 판넬") boolean is360,
            @Schema(description = "옵션 - 4way 판넬") boolean is4Way,
            @Schema(description = "옵션 - 1way 판넬") boolean is1Way,
            @Schema(description = "옵션 - 스탠드") boolean isStand,
            @Schema(description = "옵션 - 디럭스") boolean isDeluxe,
            @Schema(description = "옵션 - 1등급") boolean isFirstGrade,
            @Schema(description = "품목 고정DC율 (percent, null이면 미지정)") BigDecimal fixedDiscountRate,
            @Schema(description = "품목 변동DC 적용 여부 (null이면 구형 호출자)") Boolean hasVariableDiscount
    ) {

        /** 기존 호출자 호환 — 품목 고정DC 미전달 요청. */
        public Line(String lineId, String modelCode, BigDecimal listPrice,
                    String category, Integer quantity,
                    boolean is360, boolean is4Way, boolean is1Way,
                    boolean isStand, boolean isDeluxe, boolean isFirstGrade) {
            this(lineId, modelCode, listPrice, category, quantity,
                    is360, is4Way, is1Way, isStand, isDeluxe, isFirstGrade, null, null);
        }

        /** 기존 호출자 호환 — 품목 고정DC만 전달하는 요청. */
        public Line(String lineId, String modelCode, BigDecimal listPrice,
                    String category, Integer quantity,
                    boolean is360, boolean is4Way, boolean is1Way,
                    boolean isStand, boolean isDeluxe, boolean isFirstGrade,
                    BigDecimal fixedDiscountRate) {
            this(lineId, modelCode, listPrice, category, quantity,
                    is360, is4Way, is1Way, isStand, isDeluxe, isFirstGrade,
                    fixedDiscountRate, null);
        }
    }
}
