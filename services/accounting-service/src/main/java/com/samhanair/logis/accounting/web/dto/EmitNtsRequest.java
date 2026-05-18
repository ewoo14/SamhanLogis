package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * e-Tax 실 발행 요청 DTO (SP-09-1).
 *
 * <p>POST /api/v1/accounting/tax-invoices/{id}/emit-nts 의 request body.
 *
 * @param submitMethod 전송 방식 — DRY_RUN (테스트) 또는 NTS (실 발행). 필수.
 */
public record EmitNtsRequest(
        @NotNull(message = "submitMethod 는 필수입니다")
        @Pattern(regexp = "DRY_RUN|NTS", message = "submitMethod 는 DRY_RUN 또는 NTS 만 허용됩니다")
        String submitMethod
) {
}
