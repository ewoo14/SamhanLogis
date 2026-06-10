package com.samhanair.logis.accounting.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 은행계좌 요청 DTO — {@link CreateSupplierProfileRequest} / {@link UpdateSupplierProfileRequest}
 * 의 {@code bankAccounts} 배열 원소.
 *
 * <p>요청 배열의 순서가 {@code displayOrder} 에 그대로 반영된다 (0-based index).
 */
@Schema(description = "은행계좌 요청 항목")
public record BankAccountRequest(

        @Schema(description = "예금주", example = "（주）삼한공조시스템")
        @NotBlank(message = "예금주는 필수입니다")
        @Size(max = 50, message = "예금주는 최대 50자입니다")
        String accountHolder,

        @Schema(description = "은행명", example = "국민은행")
        @NotBlank(message = "은행명은 필수입니다")
        @Size(max = 50, message = "은행명은 최대 50자입니다")
        String bankName,

        @Schema(description = "계좌번호", example = "123456-78-901234")
        @NotBlank(message = "계좌번호는 필수입니다")
        @Size(max = 50, message = "계좌번호는 최대 50자입니다")
        String accountNumber,

        @Schema(description = "명세서 노출 여부 — null 이면 true 로 저장 (인쇄 bankNotice 노출 제어)",
                example = "true")
        Boolean exposed

) {}
