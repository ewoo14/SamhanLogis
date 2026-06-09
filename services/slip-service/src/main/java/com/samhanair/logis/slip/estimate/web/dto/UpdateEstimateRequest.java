package com.samhanair.logis.slip.estimate.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 견적서 수정 요청 — DRAFT/SENT 단계에서 헤더 + 라인 일괄 갱신.
 *
 * <p>{@code lines} 가 null 이면 라인 보존, 비어있는 list 면 모든 라인 제거,
 * 값이 있으면 기존 라인 모두 제거 후 신규 라인으로 replace (단순 정책).
 */
public record UpdateEstimateRequest(
        UUID partnerId,
        @Size(max = 100) String partnerName,
        @Size(max = 20) String partnerBusinessNo,
        @Size(max = 200) String partnerAddress,
        LocalDate validUntil,
        @Size(max = 1000) String memo,
        @Valid List<EstimateLineUpdate> lines) {

    public record EstimateLineUpdate(
            @NotNull UUID productId,
            @Size(max = 200) String productName,
            @Size(max = 100) String modelName,
            @Size(max = 50) String specification,
            @NotNull @Positive Integer quantity,
            @NotNull @DecimalMin("0.00") BigDecimal unitPrice,
            @Size(max = 200) String note,
            BundleSetOptions setOptions) {

        /** 호환 생성자 — setOptions 미제공(기존 7-arg 호출자/테스트). */
        public EstimateLineUpdate(UUID productId, String productName, String modelName,
                                  String specification, Integer quantity, BigDecimal unitPrice, String note) {
            this(productId, productName, modelName, specification, quantity, unitPrice, note, null);
        }
    }
}
