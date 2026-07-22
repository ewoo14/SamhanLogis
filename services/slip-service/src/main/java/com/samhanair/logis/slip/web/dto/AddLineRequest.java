package com.samhanair.logis.slip.web.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.UUID;

/**
 * 라인 추가 요청 — DRAFT/SAVED 단계에서만 허용.
 * Slice A (sales-polish-2): {@code specification} 필드 신규 추가 (사용자 피드백 #4).
 *
 * <p>에픽 후속 #2: {@code setOptions} 신규 — 기존 전표에 BUNDLE(세트) 라인 추가 시에도
 * create 경로와 동일하게 product-service expand 로 구성품 전개(옵션 반영)되도록 옵션 전달.
 */
public record AddLineRequest(
        @NotNull UUID productId,
        @Size(max = 200) String productName,
        @Size(max = 100) String modelName,
        @Size(max = 50) String specification,
        @NotNull @Positive Integer quantity,
        @NotNull @DecimalMin("0.00") BigDecimal unitPrice,
        @Size(max = 200) String note,
        com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions setOptions,
        /** 단가 부가세포함 여부 — true 면 unitPrice 가 VAT 포함 단가(라인 단위 분해). 2026-06-09. */
        Boolean priceVatInclusive,
        /** 권위 공급가액 S — 부가세·합계와 함께 보낼 때만 적용한다. */
        BigDecimal supplyAmount,
        /** 권위 부가세 V — 공급가액·합계와 함께 보낼 때만 적용한다. */
        BigDecimal vatAmount,
        /** 권위 VAT 포함 합계 T — 전표 lineTotal 컬럼과 의미가 다르다. */
        BigDecimal lineTotalWithVat) {

    /** 호환 생성자 — priceVatInclusive 미제공(8-arg). */
    public AddLineRequest(UUID productId, String productName, String modelName,
                          String specification, Integer quantity, BigDecimal unitPrice, String note,
                          com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions setOptions) {
        this(productId, productName, modelName, specification, quantity, unitPrice, note, setOptions,
                null, null, null, null);
    }

    /** 호환 생성자 — 기존 priceVatInclusive 호출자. 권위 금액 필드는 모두 생략한다. */
    public AddLineRequest(UUID productId, String productName, String modelName,
                          String specification, Integer quantity, BigDecimal unitPrice, String note,
                          com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions setOptions,
                          Boolean priceVatInclusive) {
        this(productId, productName, modelName, specification, quantity, unitPrice, note, setOptions,
                priceVatInclusive, null, null, null);
    }

    /** 호환 생성자 — setOptions/priceVatInclusive 미제공(기존 7-arg 호출자/테스트). */
    public AddLineRequest(UUID productId, String productName, String modelName,
                          String specification, Integer quantity, BigDecimal unitPrice, String note) {
        this(productId, productName, modelName, specification, quantity, unitPrice, note, null,
                null, null, null, null);
    }

    /** 권위 금액을 포함한 명시적 생성자. */
    public AddLineRequest(UUID productId, String productName, String modelName,
                          String specification, Integer quantity, BigDecimal unitPrice, String note,
                          com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions setOptions,
                          Boolean priceVatInclusive, BigDecimal supplyAmount, BigDecimal vatAmount,
                          BigDecimal lineTotalWithVat) {
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
    }
}
