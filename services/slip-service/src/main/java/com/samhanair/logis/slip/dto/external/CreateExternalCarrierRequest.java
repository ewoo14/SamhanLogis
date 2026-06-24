package com.samhanair.logis.slip.dto.external;

import jakarta.validation.constraints.NotBlank;

/** 외부기사/배송사 신규 등록 요청. */
public record CreateExternalCarrierRequest(
        @NotBlank String name,
        @NotBlank String phone,
        String email,
        String defaultVehicleType,
        String memo,
        Boolean active
) {
}
