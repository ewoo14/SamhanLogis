package com.samhanair.logis.slip.estimate.web.dto;

import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** 견적서 상세 응답 — 라인 포함. */
public record EstimateDetailResponse(
        UUID id,
        String estimateNo,
        LocalDate estimateDate,
        int seqNo,
        EstimateStatus status,
        UUID partnerId,
        String partnerName,
        String partnerBusinessNo,
        String partnerAddress,
        LocalDate validUntil,
        BigDecimal totalSupply,
        BigDecimal totalVat,
        BigDecimal totalAmount,
        UUID convertedSlipId,
        LocalDateTime sentAt,
        LocalDateTime acceptedAt,
        LocalDateTime rejectedAt,
        LocalDateTime convertedAt,
        String memo,
        String requesterId,
        Long version,
        Boolean isDeleted,
        LocalDateTime deletedAt,
        String deletedByName,
        List<EstimateLineResponse> lines) {

    public static EstimateDetailResponse from(Estimate estimate) {
        return new EstimateDetailResponse(
                estimate.getId(),
                estimate.getEstimateNo(),
                estimate.getEstimateDate(),
                estimate.getSeqNo(),
                estimate.getStatus(),
                estimate.getPartnerId(),
                estimate.getPartnerName(),
                estimate.getPartnerBusinessNo(),
                estimate.getPartnerAddress(),
                estimate.getValidUntil(),
                estimate.getTotalSupply(),
                estimate.getTotalVat(),
                estimate.getTotalAmount(),
                estimate.getConvertedSlipId(),
                estimate.getSentAt(),
                estimate.getAcceptedAt(),
                estimate.getRejectedAt(),
                estimate.getConvertedAt(),
                estimate.getMemo(),
                estimate.getRequesterId(),
                estimate.getVersion(),
                estimate.getIsDeleted(),
                estimate.getDeletedAt(),
                ActorDisplayName.resolveNullable(null, estimate.getDeletedByName()),
                estimate.getLines().stream()
                        .map(EstimateLineResponse::from)
                        .toList());
    }
}
