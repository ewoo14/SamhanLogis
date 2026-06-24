package com.samhanair.logis.slip.dto.external;

/** 외부기사/배송사 부분 수정 요청. null 필드는 기존 값을 유지한다. */
public record UpdateExternalCarrierRequest(
        String name,
        String phone,
        String email,
        String defaultVehicleType,
        String memo,
        Boolean active
) {
}
