package com.samhanair.logis.slip.estimate.web.dto;

import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import java.math.BigDecimal;
import java.util.UUID;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

/** 견적 라인 응답. */
public record EstimateLineResponse(
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID id,
        int lineNo,
        @JsonSerialize(using = OpaqueUuidSerializer.class) UUID productId,
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
        /** VAT 포함 단가 — 단가 부가세포함 전환(2026-06-09). 화면 '단가' 표시값. nullable(legacy). */
        BigDecimal unitPriceWithVat,
        /** 세트 전개 첫 구성품 여부 — payload 전용 계보 필드, 화면에 UUID와 함께 표시하지 않는다. */
        boolean setHead,
        /** 세트 구성품 부모 modelCode — payload 전용 계보 필드, 일반 라인은 null. */
        String parentSetModel,
        BundleSetOptions setOptions) {

    public static EstimateLineResponse from(EstimateLine line) {
        return new EstimateLineResponse(
                line.getId(),
                line.getLineNo(),
                line.getProductId(),
                line.getProductName(),
                line.getModelName(),
                line.getSpecification(),
                line.getSpecificationSource(),
                line.getQuantity(),
                line.getUnitPrice(),
                line.getSupplyAmount(),
                line.getVatAmount(),
                line.getLineTotal(),
                line.getNote(),
                line.getUnitPriceWithVat(),
                line.isSetHead(),
                line.getParentSetModel(),
                line.getBundleSetOptions());
    }
}
