package com.samhanair.logis.slip.estimate.web.dto;

import jakarta.validation.constraints.NotBlank;

/** 종합견적서 계열 담당 변경 요청. 주문서 계열 필드는 의도적으로 받지 않는다. */
public record ChangeEstimateOwnerRequest(
        @NotBlank(message = "담당자 식별자는 필수입니다") String requesterId,
        String documentType) {
}
