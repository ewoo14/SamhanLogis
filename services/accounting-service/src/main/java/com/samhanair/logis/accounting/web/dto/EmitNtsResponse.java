package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import java.time.Instant;

/**
 * e-Tax 실 발행 응답 DTO (SP-09-1).
 *
 * <p>POST /api/v1/accounting/tax-invoices/{id}/emit-nts 의 response body.
 *
 * <p>UUID 는 taxInvoiceId 만 포함 — 사용자 표시는 taxInvoiceNo + eTaxExternalId 만 사용
 * (UUID 비공개 원칙: 비즈니스 식별자 우선, internal 처리용 id 는 허용).
 *
 * @param taxInvoiceNo   세금계산서 발행번호 (yyyyMMdd-NNNN) — 사용자 식별용
 * @param status         전송 후 세금계산서 상태 (ISSUED 유지)
 * @param eTaxExternalId 외부 e-Tax 발급 ID (DRY_RUN or NTS 접수번호)
 * @param submittedAt    e-Tax 전송 완료 시각 (UTC)
 * @param submitMethod   전송 방식 (DRY_RUN | NTS)
 */
public record EmitNtsResponse(
        String taxInvoiceNo,
        TaxInvoiceStatus status,
        String eTaxExternalId,
        Instant submittedAt,
        String submitMethod
) {
}
