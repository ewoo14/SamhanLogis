package com.samhanair.logis.arologis.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 수동 배차 요청 DTO — P1-5 admin UI.
 *
 * <p>{@code POST /api/v1/arologis/admin/dispatches/{id}/manual-assign} 사용.
 * vehicleSeq + driverCode 필수. UUID 비공개 가드 — driverCode 로 식별 (id UUID 노출 X).
 *
 * @param vehicleSeq  배차 내 차량 순번 (1-based)
 * @param driverCode  배정할 기사 식별 코드 (UUID 비공개 가드)
 */
public record ManualAssignRequest(
        @NotNull(message = "vehicleSeq 필수")
        Integer vehicleSeq,

        @NotBlank(message = "driverCode 필수")
        String driverCode
) {}
