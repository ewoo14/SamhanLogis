package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 세금계산서 취소 요청 (P0-4).
 *
 * <p>ISSUED → CANCELLED 전이 시 취소 사유 의무 (5자 이상).
 * 도메인 {@link com.samhanair.logis.accounting.domain.TaxInvoice#cancel(String, String)} 에서
 * 최종 검증 수행.
 */
public record TaxInvoiceCancelRequest(
        /**
         * 취소 사유 (5자 이상, 최대 1000자, 필수).
         * 예: "고객 요청으로 인한 취소", "금액 오류 정정".
         */
        @NotBlank(message = "취소 사유는 필수입니다")
        @Size(min = 5, max = 1000, message = "취소 사유는 5자 이상 1000자 이하입니다")
        String reason
) {}
