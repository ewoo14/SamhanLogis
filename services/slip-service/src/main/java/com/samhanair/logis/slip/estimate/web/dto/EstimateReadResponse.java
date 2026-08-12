package com.samhanair.logis.slip.estimate.web.dto;

import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** 견적 목록 조회 전용 응답. 내부 UUID는 문서번호로 대체하거나 응답에서 제외한다. */
public record EstimateReadResponse(
        String id,
        String estimateNo,
        LocalDate estimateDate,
        int seqNo,
        EstimateStatus status,
        String partnerName,
        String partnerBusinessNo,
        LocalDate validUntil,
        BigDecimal totalSupply,
        BigDecimal totalVat,
        BigDecimal totalAmount,
        LocalDateTime sentAt,
        LocalDateTime acceptedAt,
        LocalDateTime convertedAt,
        Long version,
        Boolean isDeleted,
        LocalDateTime deletedAt,
        String deletedByName,
        Boolean restoreAvailable) {

    public static EstimateReadResponse from(EstimateResponse response) {
        return new EstimateReadResponse(
                response.estimateNo(), response.estimateNo(), response.estimateDate(), response.seqNo(),
                response.status(), response.partnerName(), response.partnerBusinessNo(), response.validUntil(),
                response.totalSupply(), response.totalVat(), response.totalAmount(), response.sentAt(),
                response.acceptedAt(), response.convertedAt(), response.version(), response.isDeleted(),
                response.deletedAt(), response.deletedByName(), response.restoreAvailable());
    }
}
