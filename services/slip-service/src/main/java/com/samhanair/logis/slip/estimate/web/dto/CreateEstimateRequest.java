package com.samhanair.logis.slip.estimate.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 견적서 생성 요청 — DRAFT 상태로 생성.
 *
 * <p>거래처 정보 snapshot — partnerId 만 전달하면 service 가 partner-service 에 조회 후 partnerName/
 * businessNo/address 를 자동 채움. 명시적으로 전달된 값이 있으면 우선.
 */
public record CreateEstimateRequest(
        LocalDate estimateDate,
        UUID partnerId,
        @Size(max = 100) String partnerName,
        @Size(max = 20) String partnerBusinessNo,
        @Size(max = 200) String partnerAddress,
        LocalDate validUntil,
        @Size(max = 1000) String memo,
        @NotEmpty @Size(max = 100, message = "견적 라인은 최대 100건까지 저장할 수 있습니다")
        @Valid List<EstimateLineRequest> lines) {

    /** 견적 라인 요청. {@code setOptions} 는 BUNDLE(세트) 품목일 때 전개 옵션(선택, null=기본). */
    public record EstimateLineRequest(
            @NotNull UUID productId,
            @Size(max = 200) String productName,
            @Size(max = 100) String modelName,
            @Size(max = 50) String specification,
            @NotNull @Positive Integer quantity,
            @NotNull @DecimalMin("0.00") BigDecimal unitPrice,
            @Size(max = 200) String note,
            BundleSetOptions setOptions,
            /** 단가 부가세포함 여부 — true 면 unitPrice 가 VAT 포함 단가(라인 단위 분해). 2026-06-09. */
            Boolean priceVatInclusive,
            /** 권위 공급가액 S — 부가세·합계와 함께 보낼 때만 적용한다. */
            BigDecimal supplyAmount,
            /** 권위 부가세 V — 공급가액·합계와 함께 보낼 때만 적용한다. */
            BigDecimal vatAmount,
            /** 권위 VAT 포함 합계 T — 견적 lineTotal 컬럼과 동일한 의미다. */
            BigDecimal lineTotalWithVat,
            String specificationSource) {

        /** 호환 생성자 — priceVatInclusive 미제공(8-arg). */
        public EstimateLineRequest(UUID productId, String productName, String modelName,
                                   String specification, Integer quantity, BigDecimal unitPrice, String note,
                                   BundleSetOptions setOptions) {
            this(productId, productName, modelName, specification, quantity, unitPrice, note, setOptions,
                    null, null, null, null, null);
        }

        /** 호환 생성자 — setOptions/priceVatInclusive 미제공(기존 7-arg 호출자/테스트). */
        public EstimateLineRequest(UUID productId, String productName, String modelName,
                                   String specification, Integer quantity, BigDecimal unitPrice, String note) {
            this(productId, productName, modelName, specification, quantity, unitPrice, note, null,
                    null, null, null, null, null);
        }

        /** 호환 생성자 — 기존 priceVatInclusive 호출자. 권위 금액 필드는 모두 생략한다. */
        public EstimateLineRequest(UUID productId, String productName, String modelName,
                                   String specification, Integer quantity, BigDecimal unitPrice, String note,
                                   BundleSetOptions setOptions, Boolean priceVatInclusive) {
            this(productId, productName, modelName, specification, quantity, unitPrice, note, setOptions,
                    priceVatInclusive, null, null, null, null);
        }

        /** 권위 금액을 포함한 명시적 생성자. */
        public EstimateLineRequest(UUID productId, String productName, String modelName,
                                   String specification, Integer quantity, BigDecimal unitPrice, String note,
                                   BundleSetOptions setOptions, Boolean priceVatInclusive,
                                   BigDecimal supplyAmount, BigDecimal vatAmount,
                                   BigDecimal lineTotalWithVat) {
            this(productId, productName, modelName, specification, quantity, unitPrice, note,
                    setOptions, priceVatInclusive, supplyAmount, vatAmount, lineTotalWithVat, null);
        }

        public EstimateLineRequest(UUID productId, String productName, String modelName,
                                   String specification, Integer quantity, BigDecimal unitPrice, String note,
                                   BundleSetOptions setOptions, Boolean priceVatInclusive,
                                   BigDecimal supplyAmount, BigDecimal vatAmount,
                                   BigDecimal lineTotalWithVat, String specificationSource) {
            this.productId = productId;
            this.productName = productName;
            this.modelName = modelName;
            this.specification = specification;
            this.quantity = quantity;
            this.unitPrice = unitPrice;
            this.note = note;
            this.setOptions = setOptions;
            this.priceVatInclusive = priceVatInclusive;
            this.supplyAmount = supplyAmount;
            this.vatAmount = vatAmount;
            this.lineTotalWithVat = lineTotalWithVat;
            this.specificationSource = specificationSource;
        }
    }
}
