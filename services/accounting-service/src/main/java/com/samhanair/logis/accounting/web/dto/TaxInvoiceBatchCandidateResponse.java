package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

/**
 * 출고전표 묶음 세금계산서 발행 후보.
 *
 * <p>UUID 는 mutation 요청 payload 용으로만 포함하고 화면 표시는 slipNo / partnerCode 를 사용한다.
 */
public record TaxInvoiceBatchCandidateResponse(
        String groupKey,
        String month,
        String partnerCode,
        String partnerName,
        int slipCount,
        BigDecimal totalSupplyAmount,
        BigDecimal totalVatAmount,
        BigDecimal totalAmount,
        List<SalesSlipCandidate> salesSlips
) {
    public record SalesSlipCandidate(
            String salesSlipId,
            String slipNo,
            java.time.LocalDate slipDate,
            BigDecimal totalSupplyAmount,
            BigDecimal totalVatAmount,
            BigDecimal totalAmount
    ) {
        public static SalesSlipCandidate of(SalesAccountingSlip slip) {
            return new SalesSlipCandidate(
                    slip.getId() != null ? slip.getId().toString() : null,
                    slip.getSlipNo(),
                    slip.getSlipDate(),
                    slip.getTotalSupplyAmount(),
                    slip.getTotalVatAmount(),
                    slip.getTotalAmount());
        }
    }

    public static TaxInvoiceBatchCandidateResponse of(
            String partnerCode,
            String partnerName,
            YearMonth month,
            List<SalesAccountingSlip> slips) {
        BigDecimal supply = slips.stream()
                .map(SalesAccountingSlip::getTotalSupplyAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal vat = slips.stream()
                .map(SalesAccountingSlip::getTotalVatAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal total = slips.stream()
                .map(SalesAccountingSlip::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        String resolvedPartnerCode = partnerCode == null ? "" : partnerCode;
        String resolvedMonth = month.toString();
        return new TaxInvoiceBatchCandidateResponse(
                resolvedPartnerCode + ":" + resolvedMonth,
                resolvedMonth,
                partnerCode,
                partnerName,
                slips.size(),
                supply,
                vat,
                total,
                slips.stream().map(SalesSlipCandidate::of).toList());
    }
}
