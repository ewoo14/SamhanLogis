package com.samhanair.logis.slip.estimate.web.dto;

import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/** 견적서 요약 응답 — 라인 미포함, 페이지/리스트 용. */
public record EstimateResponse(
        UUID id,
        String estimateNo,
        LocalDate estimateDate,
        int seqNo,
        EstimateStatus status,
        UUID partnerId,
        String partnerName,
        String partnerBusinessNo,
        LocalDate validUntil,
        BigDecimal totalSupply,
        BigDecimal totalVat,
        BigDecimal totalAmount,
        UUID convertedSlipId,
        LocalDateTime sentAt,
        LocalDateTime acceptedAt,
        LocalDateTime convertedAt,
        String requesterId,
        Long version,
        Boolean isDeleted,
        LocalDateTime deletedAt,
        String deletedByName,
        Boolean restoreAvailable) {

    public static EstimateResponse from(Estimate estimate) {
        return from(estimate, true);
    }

    public static EstimateResponse from(Estimate estimate, boolean restoreAvailable) {
        return new EstimateResponse(
                estimate.getId(),
                estimate.getEstimateNo(),
                estimate.getEstimateDate(),
                estimate.getSeqNo(),
                estimate.getStatus(),
                estimate.getPartnerId(),
                estimate.getPartnerName(),
                estimate.getPartnerBusinessNo(),
                estimate.getValidUntil(),
                estimate.getTotalSupply(),
                estimate.getTotalVat(),
                estimate.getTotalAmount(),
                estimate.getConvertedSlipId(),
                estimate.getSentAt(),
                estimate.getAcceptedAt(),
                estimate.getConvertedAt(),
                estimate.getRequesterId(),
                estimate.getVersion(),
                estimate.getIsDeleted(),
                estimate.getDeletedAt(),
                estimate.getDeletedByName(),
                restoreAvailable);
    }
}
