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
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;

/** 수량 동기화 규칙 생성·전체 교체 요청. Product UUID는 받지 않는다. */
public record QuantitySyncRuleRequest(
        // 재수렴 결함 3 [MED~HIGH] fix — ruleKey는 GET/PUT/DELETE의 URL 경로 세그먼트로
        // 그대로 쓰인다(QuantitySyncRuleController:49,65,74). '/'가 들어가면 원문은 Spring이
        // 경로를 분할해 다른 리소스로 오인하고, 인코딩(%2F)은 Tomcat이 400 HTML로 거부해
        // API로 만든 규칙을 API로 조회/삭제할 방법이 없어진다(S-5, 영구 고아). 기존 시드/문서
        // 키 형식(예: HOME_HOSE_1WAY_L)과 QuantitySyncRuleDbProbeIT의 하이픈 키 양쪽 다
        // 허용하는 문자 집합만 남기고, 그 외(공백·슬래시 등 경로에 위험한 문자)는 차단한다.
        // DB 층도 동일 정규식의 CHECK 제약(V24:33-38 chk_qsr_rule_key_path_safe)으로
        // backstop을 둔다 — Java·DB 어느 경로로도 위반된 값이 들어오지 않는다.
        @NotBlank @Size(max = 100) @Pattern(regexp = "^[A-Za-z0-9_-]+$",
                message = "ruleKey는 영문자/숫자/밑줄(_)/하이픈(-)만 허용됩니다.") String ruleKey,
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
            String componentVariant,
            String componentShape,
            @NotNull @Min(1) Integer displayOrder) {
        /** 기존 API 호출자와의 source 호환 생성자. */
        public TargetRequest(String productCode, BigDecimal multiplier,
                             String roundingMode, Integer displayOrder) {
            this(productCode, multiplier, roundingMode, null, null, displayOrder);
        }
    }
}
