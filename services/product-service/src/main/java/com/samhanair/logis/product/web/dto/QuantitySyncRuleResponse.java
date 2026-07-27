package com.samhanair.logis.product.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.product.domain.QuantitySyncAggregation;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import java.util.List;

/** 수량 동기화 규칙 API 응답. 내부 UUID를 사용자에게 반환하지 않는다. */
public record QuantitySyncRuleResponse(
        String ruleKey,
        QuantitySyncEstimateCategory estimateCategory,
        String name,
        boolean enabled,
        QuantitySyncAggregation aggregation,
        @JsonProperty("when") JsonNode conditionJson,
        QuantitySyncInactiveBehavior inactiveBehavior,
        QuantitySyncConflictPolicy conflictPolicy,
        int priority,
        String legacyRef,
        List<QuantitySyncProductRef> sources,
        List<QuantitySyncProductRef> targets) {}
