package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import java.time.Instant;

/**
 * e-Tax 실 발행 응답 DTO (SP-09-1).
 *
 * <p>POST /api/v1/accounting/tax-invoices/{id}/emit-nts 의 response body.
 *
 * <p>응답 본문에 UUID 는 포함되지 않음 — 사용자 식별은 taxInvoiceNo 사용
 * (UUID 비공개 원칙: 비즈니스 식별자 우선, {@code feedback_uuid_no_user_visibility.md}).
 *
 * <p>{@code submitMethod} 는 실제 수행된 전송 방식을 반환한다. 요청 submitMethod 와 서버
 * property 가 다를 경우 서버 property 가 우선되며, 응답으로 실제 수행 방식을 확인할 수 있다.
 *
 * @param taxInvoiceNo   세금계산서 발행번호 (yyyy/MM/dd-NNNN) — 사용자 식별용
 * @param status         전송 후 세금계산서 상태 (ISSUED 유지)
 * @param eTaxExternalId 외부 e-Tax 발급 ID (DRY_RUN: "DRY-{taxInvoiceNo}-{epochMilli}", NTS: 홈택스 접수번호)
 * @param submittedAt    e-Tax 전송 완료 시각 (UTC)
 * @param submitMethod   실제 수행된 전송 방식 (DRY_RUN | NTS)
 */
public record EmitNtsResponse(
        String taxInvoiceNo,
        TaxInvoiceStatus status,
        String eTaxExternalId,
        Instant submittedAt,
        String submitMethod
) {
}
