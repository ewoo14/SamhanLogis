package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 세금계산서 단건 상세 — 라인 포함 (P0-4 갱신).
 *
 * <p>cancelReason / invoiceType / partnerCode 필드 추가.
 */
public record TaxInvoiceDetailResponse(
        UUID id,
        String taxInvoiceNo,
        TaxInvoiceType invoiceType,
        UUID partnerId,
        String partnerCode,
        String partnerBusinessNo,
        String partnerName,
        String partnerAddress,
        LocalDate supplyDate,
        BigDecimal supplyAmount,
        BigDecimal vatAmount,
        BigDecimal totalAmount,
        TaxInvoiceStatus status,
        LocalDateTime issuedAt,
        String issuedBy,
        LocalDateTime cancelledAt,
        String cancelledBy,
        String cancelReason,
        UUID journalId,
        UUID reverseJournalId,
        String eTaxExternalId,
        String description,
        boolean legacyReadOnly,
        List<String> eligibilityReasons,
        List<TaxInvoiceLineResponse> lines
) {
    /** TaxInvoice 엔티티 → 단건 상세 응답 변환. */
    public static TaxInvoiceDetailResponse of(TaxInvoice ti) {
        List<TaxInvoiceLineResponse> lineRes = ti.getLines().stream()
                .map(TaxInvoiceLineResponse::of)
                .toList();
        return new TaxInvoiceDetailResponse(
                ti.getId(),
                ti.getTaxInvoiceNo(),
                ti.getInvoiceType(),
                ti.getPartnerId(),
                ti.getPartnerCode(),
                ti.getPartnerBusinessNo(),
                ti.getPartnerName(),
                ti.getPartnerAddress(),
                ti.getSupplyDate(),
                ti.getSupplyAmount(),
                ti.getVatAmount(),
                ti.getTotalAmount(),
                ti.getStatus(),
                ti.getIssuedAt(),
                ti.getIssuedBy(),
                ti.getCancelledAt(),
                ti.getCancelledBy(),
                ti.getCancelReason(),
                ti.getJournalId(),
                ti.getReverseJournalId(),
                ti.getETaxExternalId(),
                ti.getDescription(),
                ti.isLegacyReadOnly(),
                ti.isLegacyReadOnly()
                        ? List.of("LEGACY_READ_ONLY", "기존 legacy 세금계산서는 읽기 전용입니다")
                        : List.of(),
                lineRes
        );
    }
}
