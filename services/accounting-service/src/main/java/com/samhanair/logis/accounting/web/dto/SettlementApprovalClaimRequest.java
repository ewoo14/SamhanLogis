package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** groupware가 accounting claim을 예약할 때 사용하는 내부 요청. */
public record SettlementApprovalClaimRequest(
        @NotBlank String documentNo,
        @NotNull UUID approvalId) {
}
