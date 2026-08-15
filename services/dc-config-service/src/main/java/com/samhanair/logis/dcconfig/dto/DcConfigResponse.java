package com.samhanair.logis.dcconfig.dto;

import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.DcConfigSource;
import com.samhanair.logis.dcconfig.domain.UnitRoundMode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;

/**
 * DcConfig 응답 — internal 전용. {@code InternalDcConfigController} 만 노출.
 *
 * <p>DC 노출 5겹 가드 의 1·2번째: PartnerPublicResponse 와 클래스 자체가 분리되어
 * 외부 controller 가 잘못 사용해도 컴파일 타임에 발견 가능.
 */
@Schema(description = "거래처 DC 설정 (internal 전용)")
public record DcConfigResponse(
        @Schema(description = "거래처 코드") String partnerCode,
        @Schema(description = "홈멀티 DC율 (0~1)") BigDecimal homeDiscountRate,
        @Schema(description = "상업멀티 DC율") BigDecimal commercialDiscountRate,
        @Schema(description = "유연호스(I) 표시 여부") Boolean showIHose,
        @Schema(description = "360 옵션 정액 DC") BigDecimal discount360Amount,
        @Schema(description = "4way 옵션 정액 DC") BigDecimal discount4WayAmount,
        @Schema(description = "1way 옵션 정액 DC") BigDecimal discount1WayAmount,
        @Schema(description = "스탠드 옵션 정액 DC") BigDecimal discountStandAmount,
        @Schema(description = "디럭스 옵션 정액 DC") BigDecimal discountDeluxeAmount,
        @Schema(description = "1등급 옵션 정액 DC") BigDecimal discountFirstGradeAmount,
        @Schema(description = "단가 반올림 단위 (원)") Integer unitRoundTo,
        @Schema(description = "단가 반올림 모드") UnitRoundMode unitRoundMode,
        @Schema(description = "단위처리 사용 여부") Boolean unitProcessingEnabled,
        @Schema(description = "시드 출처") DcConfigSource source,
        @Schema(description = "비고") String note
) {

    public static DcConfigResponse from(DcConfig config) {
        return new DcConfigResponse(
                config.getPartner().getPartnerCode(),
                config.getHomeDiscountRate(),
                config.getCommercialDiscountRate(),
                config.getShowIHose(),
                config.getDiscount360Amount(),
                config.getDiscount4WayAmount(),
                config.getDiscount1WayAmount(),
                config.getDiscountStandAmount(),
                config.getDiscountDeluxeAmount(),
                config.getDiscountFirstGradeAmount(),
                config.getUnitRoundTo(),
                config.getUnitRoundMode(),
                config.getUnitProcessingEnabled(),
                config.getSource(),
                config.getNote()
        );
    }
}
