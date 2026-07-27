package com.samhanair.logis.product.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;

/** 수량 동기화 규칙 생성·전체 교체 요청. Product UUID는 받지 않는다. */
public record QuantitySyncRuleRequest(
        @NotBlank @Size(max = 100) String ruleKey,
        @NotNull QuantitySyncEstimateCategory estimateCategory,
        @NotBlank @Size(max = 200) String name,
        boolean enabled,
        @NotNull String aggregation,
        @NotNull @JsonProperty("when") JsonNode conditionJson,
        @NotNull QuantitySyncInactiveBehavior inactiveBehavior,
        @NotNull QuantitySyncConflictPolicy conflictPolicy,
        @Min(0) int priority,
        @NotBlank @Size(max = 255) String legacyRef,
        @NotEmpty List<@Valid SourceRequest> sources,
        @NotEmpty List<@Valid TargetRequest> targets) {

    /** source Product를 사용자 식별 코드로 지정한다. */
    public record SourceRequest(
            @NotBlank @Size(max = 100) String productCode,
            @NotNull BigDecimal factor) {}

    /** target Product를 사용자 식별 코드와 결과 배수로 지정한다. */
    public record TargetRequest(
            @NotBlank @Size(max = 100) String productCode,
            @NotNull BigDecimal multiplier,
            @NotNull String roundingMode,
            @NotNull @Min(1) Integer displayOrder) {}
}
