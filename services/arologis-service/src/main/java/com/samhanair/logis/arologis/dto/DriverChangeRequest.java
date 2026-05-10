package com.samhanair.logis.arologis.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 기사 변경 요청 DTO — P1-5 admin UI.
 *
 * <p>{@code PATCH /api/v1/arologis/admin/dispatches/{id}/driver} 사용.
 * vehicleSeq + newDriverCode 필수. UUID 비공개 가드 — driverCode 로 기사 식별.
 *
 * @param vehicleSeq    변경 대상 차량 순번 (1-based)
 * @param newDriverCode 변경할 기사 식별 코드 (UUID 비공개 가드)
 */
public record DriverChangeRequest(
        @NotNull(message = "vehicleSeq 필수")
        Integer vehicleSeq,

        @NotBlank(message = "newDriverCode 필수")
        String newDriverCode
) {}
