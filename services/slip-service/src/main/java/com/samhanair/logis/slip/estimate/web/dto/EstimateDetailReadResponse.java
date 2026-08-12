package com.samhanair.logis.slip.estimate.web.dto;

import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** 견적 상세 조회 전용 응답. UUID와 내부 품목 식별자는 사용자 응답에서 제외한다. */
public record EstimateDetailReadResponse(
        String id,
        String estimateNo,
        LocalDate estimateDate,
        int seqNo,
        EstimateStatus status,
        String partnerName,
        String partnerBusinessNo,
        String partnerAddress,
        LocalDate validUntil,
        BigDecimal totalSupply,
        BigDecimal totalVat,
        BigDecimal totalAmount,
        LocalDateTime sentAt,
        LocalDateTime acceptedAt,
        LocalDateTime rejectedAt,
        LocalDateTime convertedAt,
        String memo,
        Long version,
        Boolean isDeleted,
        LocalDateTime deletedAt,
        String deletedByName,
        List<EstimateLineReadResponse> lines) {

    public static EstimateDetailReadResponse from(EstimateDetailResponse response) {
        return new EstimateDetailReadResponse(
                response.estimateNo(), response.estimateNo(), response.estimateDate(), response.seqNo(),
                response.status(), response.partnerName(), response.partnerBusinessNo(), response.partnerAddress(),
                response.validUntil(), response.totalSupply(), response.totalVat(), response.totalAmount(),
                response.sentAt(), response.acceptedAt(), response.rejectedAt(), response.convertedAt(),
                response.memo(), response.version(), response.isDeleted(), response.deletedAt(),
                response.deletedByName(), response.lines().stream().map(EstimateLineReadResponse::from).toList());
    }

    public record EstimateLineReadResponse(
            String id,
            int lineNo,
            String productName,
            String modelName,
            String specification,
            String specificationSource,
            int quantity,
            BigDecimal unitPrice,
            BigDecimal supplyAmount,
            BigDecimal vatAmount,
            BigDecimal lineTotal,
            String note,
            BigDecimal unitPriceWithVat,
            boolean setHead,
            String parentSetModel,
            SetOptionsReadResponse setOptions) {

        static EstimateLineReadResponse from(EstimateLineResponse response) {
            return new EstimateLineReadResponse(
                    String.valueOf(response.lineNo()), response.lineNo(), response.productName(), response.modelName(),
                    response.specification(), response.specificationSource(), response.quantity(), response.unitPrice(),
                    response.supplyAmount(), response.vatAmount(), response.lineTotal(), response.note(),
                    response.unitPriceWithVat(), response.setHead(), response.parentSetModel(),
                    response.setOptions() == null ? null : SetOptionsReadResponse.from(response.setOptions()));
        }

        /** 내부 instanceKey(UUID 가능)는 상세 읽기 응답에서 제외한다. */
        public record SetOptionsReadResponse(
                String remoteOption,
                Boolean remoteExcluded,
                String panelOption,
                String panelShape360,
                Boolean materialIncluded) {
            static SetOptionsReadResponse from(BundleSetOptions options) {
                return new SetOptionsReadResponse(options.remoteOption(), options.remoteExcluded(),
                        options.panelOption(), options.panelShape360(), options.materialIncluded());
            }
        }
    }
}
