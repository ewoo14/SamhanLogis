package com.samhanair.logis.arologis.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

/**
 * 관리자 수동 위치 입력 요청.
 *
 * @param latitude 위도
 * @param longitude 경도
 */
@Schema(description = "관리자 수동 위치 입력 요청")
public record ManualLocationRequest(
        @Schema(description = "위도 (-90 이상 90 이하)")
        @NotNull
        @DecimalMin("-90")
        @DecimalMax("90")
        BigDecimal latitude,
        @Schema(description = "경도 (-180 이상 180 이하)")
        @NotNull
        @DecimalMin("-180")
        @DecimalMax("180")
        BigDecimal longitude
) {}
