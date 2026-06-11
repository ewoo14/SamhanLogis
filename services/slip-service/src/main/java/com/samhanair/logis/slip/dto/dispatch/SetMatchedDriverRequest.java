package com.samhanair.logis.slip.dto.dispatch;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 타사(경기퀵/전국화물 등) 기사/차량 수동 기입 요청. */
public record SetMatchedDriverRequest(
        @NotBlank @Size(max = 100) String driverName,
        @NotBlank @Size(max = 20) String driverPhoneNumber,
        @NotBlank @Size(max = 20) String vehiclePlateNumber,
        @NotBlank @Size(max = 32) String driverSource
) {
}
