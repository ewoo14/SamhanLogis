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
        @NotEmpty @Valid List<EstimateLineRequest> lines) {

    /** 견적 라인 요청. {@code setOptions} 는 BUNDLE(세트) 품목일 때 전개 옵션(선택, null=기본). */
    public record EstimateLineRequest(
            @NotNull UUID productId,
            @Size(max = 200) String productName,
            @Size(max = 100) String modelName,
            @Size(max = 50) String specification,
            @NotNull @Positive Integer quantity,
            @NotNull @DecimalMin("0.00") BigDecimal unitPrice,
            @Size(max = 200) String note,
            BundleSetOptions setOptions) {

        /** 호환 생성자 — setOptions 미제공(기존 7-arg 호출자/테스트). */
        public EstimateLineRequest(UUID productId, String productName, String modelName,
                                   String specification, Integer quantity, BigDecimal unitPrice, String note) {
            this(productId, productName, modelName, specification, quantity, unitPrice, note, null);
        }
    }
}
