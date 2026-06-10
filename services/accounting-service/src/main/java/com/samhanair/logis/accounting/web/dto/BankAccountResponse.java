package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.SupplierBankAccount;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 은행계좌 응답 DTO — {@link SupplierProfileResponse} 의 {@code bankAccounts} 배열 원소.
 *
 * <p>UUID 비공개 원칙 준수 — id 비노출. 계좌 변경은 replace-all 방식이므로 개별 id 불필요.
 */
@Schema(description = "은행계좌 응답 항목")
public record BankAccountResponse(

        @Schema(description = "예금주", example = "（주）삼한공조시스템")
        String accountHolder,

        @Schema(description = "은행명", example = "국민은행")
        String bankName,

        @Schema(description = "계좌번호", example = "123456-78-901234")
        String accountNumber,

        @Schema(description = "표시 순서 (0-based)", example = "0")
        int displayOrder

) {

    /**
     * {@link SupplierBankAccount} 엔티티를 응답 DTO 로 변환.
     *
     * @param entity 변환 대상 엔티티
     * @return 응답 DTO
     */
    public static BankAccountResponse of(SupplierBankAccount entity) {
        return new BankAccountResponse(
                entity.getAccountHolder(),
                entity.getBankName(),
                entity.getAccountNumber(),
                entity.getDisplayOrder()
        );
    }
}
