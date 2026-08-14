package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 세금계산서 목록 조회 응답 (P0-4 — Slice C 패턴).
 *
 * <p>UUID 사용자 비공개 원칙 ({@code feedback_uuid_no_user_visibility}):
 * id(UUID) 는 mutation path 용으로만 포함. 화면 표시는 {@code taxInvoiceNo} 사용.
 *
 * <p>lines 미포함 (목록 조회 최적화). 라인 포함 상세는 {@link TaxInvoiceDetailResponse}.
 */
public record TaxInvoiceSummaryResponse(
        /** 내부 UUID — mutation endpoint path 용. 사용자 화면 표시 금지. */
        String id,

        /** 세금계산서 발행번호 ({@code YYYYMM-NNNN}) — 사용자 식별자. */
        String taxInvoiceNo,

        /** 세금계산서 종류 (SALES / PURCHASE). */
        TaxInvoiceType invoiceType,

        /** 거래처 코드 (비즈니스 식별자). */
        String partnerCode,

        /** 거래처 상호 (snapshot). */
        String partnerName,

        /** 사업자등록번호 (snapshot). */
        String partnerBusinessNumber,

        /** 발행일자 (공급일자). */
        LocalDate issueDate,

        /** 공급가액 합계. */
        BigDecimal supplyAmount,

        /** 부가세 합계. */
        BigDecimal vatAmount,

        /** 합계 = 공급가액 + 부가세. */
        BigDecimal totalAmount,

        /** 상태 (DRAFT / ISSUED / CANCELLED). */
        TaxInvoiceStatus status,

        /** 발행 시각. */
        LocalDateTime issuedAt,

        /** 발행자. */
        String issuedBy,

        /** 취소 시각. */
        LocalDateTime cancelledAt,

        /** 취소 사유. */
        String cancelReason,

        /** Q4 legacy 정책 marker — true이면 생성/수정/발행이 아닌 읽기만 허용. */
        boolean legacyReadOnly,

        /** 사용자 표시용 eligibility 사유. UUID는 포함하지 않는다. */
        List<String> eligibilityReasons
) {
    /**
     * TaxInvoice 엔티티 → TaxInvoiceSummaryResponse 변환.
     *
     * @param ti 세금계산서 엔티티
     * @return 목록 조회 응답 DTO
     */
    public static TaxInvoiceSummaryResponse of(TaxInvoice ti) {
        return new TaxInvoiceSummaryResponse(
                ti.getId() != null ? ti.getId().toString() : null,
                ti.getTaxInvoiceNo(),
                ti.getInvoiceType(),
                ti.getPartnerCode(),
                ti.getPartnerName(),
                ti.getPartnerBusinessNo(),
                ti.getSupplyDate(),
                ti.getSupplyAmount(),
                ti.getVatAmount(),
                ti.getTotalAmount(),
                ti.getStatus(),
                ti.getIssuedAt(),
                ti.getIssuedBy(),
                ti.getCancelledAt(),
                ti.getCancelReason(),
                ti.isLegacyReadOnly(),
                ti.isLegacyReadOnly()
                        ? List.of("LEGACY_READ_ONLY", "기존 legacy 세금계산서는 읽기 전용입니다")
                        : List.of()
        );
    }
}
