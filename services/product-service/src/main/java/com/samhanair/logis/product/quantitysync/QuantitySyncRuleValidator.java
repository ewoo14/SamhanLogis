package com.samhanair.logis.product.quantitysync;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * 수량 동기화 규칙 저장 전 전체 그래프를 검증한다.
 *
 * <p>이 validator 는 API 입력을 Product 내부 UUID로 해소한 뒤 호출된다. PostgreSQL V24
 * deferred constraint trigger도 동일한 불변식을 재검증하므로 서비스 계층 우회가 허용되지 않는다.
 */
@Component
public class QuantitySyncRuleValidator {

    private static final BigDecimal MAX_MULTIPLIER = new BigDecimal("1000");
    private static final Set<String> CATEGORIES = Set.of("HOME_MULTI", "SINGLE_SET", "COMM_MULTI");
    private static final Set<String> CONDITION_OPERATORS = Set.of(
            "optionEquals", "optionIn", "all", "any", "not");
    private static final Set<String> OPTION_KEYS = Set.of(
            "homeNoHose", "homeHoseType", "homeFoot", "homeRemote", "homePanel",
            "singleRemote", "singlePanel", "singleFoot", "singleWiredBoard", "singleCeilingPump",
            "commPanel", "commRemote", "commHose", "commExHose", "commExBase",
            "commIndoorKind", "remoteOption", "panelOption");

    /** 저장 검증 입력. Product 식별자는 사용자 노출 코드이며 UUID는 포함하지 않는다. */
    public static final class Draft {
        private final String ruleKey;
        private final String category;
        private final String name;
        private final boolean enabled;
        private final String aggregation;
        private final JsonNode condition;
        private final String inactiveBehavior;
        private final String conflictPolicy;
        private final int priority;
        private final String legacyRef;
        private final List<SourceDraft> sources;
        private final List<TargetDraft> targets;
        private final Map<String, ProductSnapshot> products;
        private final List<RuleSnapshot> existingRules;

        /** 전체 입력을 구성한다. */
        public Draft(String ruleKey, String category, String name, boolean enabled,
                     String aggregation, JsonNode condition, String inactiveBehavior,
                     String conflictPolicy, int priority, String legacyRef,
                     List<SourceDraft> sources, List<TargetDraft> targets,
                     Map<String, ProductSnapshot> products, List<RuleSnapshot> existingRules) {
            this.ruleKey = ruleKey;
            this.category = category;
            this.name = name;
            this.enabled = enabled;
            this.aggregation = aggregation;
            this.condition = condition;
            this.inactiveBehavior = inactiveBehavior;
            this.conflictPolicy = conflictPolicy;
            this.priority = priority;
            this.legacyRef = legacyRef;
            this.sources = List.copyOf(sources == null ? List.of() : sources);
            this.targets = List.copyOf(targets == null ? List.of() : targets);
            this.products = Map.copyOf(products == null ? Map.of() : products);
            this.existingRules = List.copyOf(existingRules == null ? List.of() : existingRules);
        }

        /** 테스트와 서비스 조립에서 condition만 불변 교체한다. */
        public Draft withCondition(JsonNode value) {
            return copy(value, conflictPolicy, products, existingRules);
        }

        /** 테스트와 서비스 조립에서 conflict policy만 불변 교체한다. */
        public Draft withConflictPolicy(String value) {
            return copy(condition, value, products, existingRules);
        }

        /** 테스트와 서비스 조립에서 Product snapshot을 불변 교체한다. */
        public Draft withProducts(Map<String, ProductSnapshot> value) {
            return copy(condition, conflictPolicy, value, existingRules);
        }

        /** 테스트와 서비스 조립에서 기존 활성 규칙 snapshot을 불변 교체한다. */
        public Draft withExistingRules(List<RuleSnapshot> value) {
            return copy(condition, conflictPolicy, products, value);
        }

        private Draft copy(JsonNode nextCondition, String nextPolicy,
                           Map<String, ProductSnapshot> nextProducts,
                           List<RuleSnapshot> nextExistingRules) {
            return new Draft(ruleKey, category, name, enabled, aggregation, nextCondition,
                    inactiveBehavior, nextPolicy, priority, legacyRef, sources, targets,
                    nextProducts, nextExistingRules);
        }

        public String ruleKey() { return ruleKey; }
        public String category() { return category; }
        public String name() { return name; }
        public boolean enabled() { return enabled; }
        public String aggregation() { return aggregation; }
        public JsonNode condition() { return condition; }
        public String inactiveBehavior() { return inactiveBehavior; }
        public String conflictPolicy() { return conflictPolicy; }
        public int priority() { return priority; }
        public String legacyRef() { return legacyRef; }
        public List<SourceDraft> sources() { return sources; }
        public List<TargetDraft> targets() { return targets; }
        public Map<String, ProductSnapshot> products() { return products; }
        public List<RuleSnapshot> existingRules() { return existingRules; }
    }

    /** source Product와 기여 배수 입력. */
    public record SourceDraft(String productCode, BigDecimal factor) {}

    /** target Product와 결과 배수 입력. */
    public record TargetDraft(String productCode, BigDecimal multiplier,
                              String roundingMode, Integer displayOrder) {}

    /** 저장 시점에 해소한 Product의 검증용 immutable snapshot. */
    public record ProductSnapshot(String productCode, String productName, String category,
                                  boolean active, boolean visible, boolean bundle,
                                  Set<String> componentCodes) {
        public ProductSnapshot {
            componentCodes = Set.copyOf(componentCodes == null ? Set.of() : componentCodes);
        }
    }

    /** 기존 활성 규칙의 graph/충돌 검사용 immutable snapshot. */
    public record RuleSnapshot(String ruleKey, String category, JsonNode condition,
                               String conflictPolicy, int priority,
                               Set<String> sourceCodes, Set<String> targetCodes) {
        public RuleSnapshot {
            sourceCodes = Set.copyOf(sourceCodes == null ? Set.of() : sourceCodes);
            targetCodes = Set.copyOf(targetCodes == null ? Set.of() : targetCodes);
        }
    }

    /** 저장 입력 전체를 검증한다. */
    public void validate(Draft draft) {
        if (draft == null) {
            invalid("규칙 입력이 없습니다.");
        }
        if (isBlank(draft.ruleKey()) || isBlank(draft.name()) || isBlank(draft.legacyRef())) {
            invalid("규칙 식별자와 이름과 legacy_ref는 필수입니다.");
        }
        if (!CATEGORIES.contains(draft.category())) {
            invalid("category가 허용 목록에 없습니다.");
        }
        if (!"SUM".equals(draft.aggregation())) {
            invalid("aggregation은 SUM만 허용됩니다.");
        }
        if (!Set.of("ZERO", "KEEP").contains(draft.inactiveBehavior())) {
            invalid("inactive_behavior가 허용 목록에 없습니다.");
        }
        if (!Set.of("ADD", "REPLACE").contains(draft.conflictPolicy())) {
            invalid("conflict_policy가 허용 목록에 없습니다.");
        }
        if (draft.priority() < 0) {
            invalid("priority는 0 이상이어야 합니다.");
        }
        validateCondition(draft.condition());
        if (draft.sources().isEmpty() || draft.targets().isEmpty()) {
            invalid("source/target은 하나 이상이어야 합니다.");
        }

        for (SourceDraft source : draft.sources()) {
            ProductSnapshot product = product(draft, source.productCode());
            validateProduct(product);
            validateMultiplier(source.factor(), "factor");
        }
        for (TargetDraft target : draft.targets()) {
            ProductSnapshot product = product(draft, target.productCode());
            validateProduct(product);
            validateMultiplier(target.multiplier(), "multiplier");
            if (!"NONE".equals(target.roundingMode()) && !"FLOOR".equals(target.roundingMode())) {
                invalid("rounding_mode가 허용 목록에 없습니다.");
            }
            if (target.displayOrder() == null || target.displayOrder() < 1) {
                invalid("display_order는 1 이상이어야 합니다.");
            }
        }

        Set<String> sourceCodes = draft.sources().stream().map(SourceDraft::productCode).collect(java.util.stream.Collectors.toSet());
        Set<String> targetCodes = draft.targets().stream().map(TargetDraft::productCode).collect(java.util.stream.Collectors.toSet());
        Set<String> overlap = new HashSet<>(sourceCodes);
        overlap.retainAll(targetCodes);
        if (!overlap.isEmpty()) {
            invalid("source와 target은 같을 수 없습니다.");
        }
        for (SourceDraft source : draft.sources()) {
            ProductSnapshot sourceProduct = product(draft, source.productCode());
            if (sourceProduct.bundle() && sourceProduct.componentCodes().containsAll(targetCodes)) {
                invalid("BUNDLE source는 같은 BUNDLE의 component target을 가질 수 없습니다.");
            }
            for (String targetCode : targetCodes) {
                if (sourceProduct.bundle() && sourceProduct.componentCodes().contains(targetCode)) {
                    invalid("BUNDLE source는 같은 BUNDLE의 component target을 가질 수 없습니다.");
                }
            }
            for (TargetDraft target : draft.targets()) {
                ProductSnapshot targetProduct = product(draft, target.productCode());
                if (!sameCategory(draft.category(), sourceProduct.category())
                        || !sameCategory(draft.category(), targetProduct.category())) {
                    invalid("category 안에서만 source/target을 연결할 수 있습니다.");
                }
            }
        }

        for (RuleSnapshot existing : draft.existingRules()) {
            if (!draft.ruleKey().equals(existing.ruleKey())
                    && "REPLACE".equals(draft.conflictPolicy())
                    && "REPLACE".equals(existing.conflictPolicy())
                    && draft.category().equals(existing.category())
                    && draft.condition().equals(existing.condition())
                    && !Collections.disjoint(targetCodes, existing.targetCodes())) {
                invalid("동일 condition의 REPLACE target이 중복됩니다.");
            }
        }
        rejectCycles(draft, sourceCodes, targetCodes);
    }

    private void validateProduct(ProductSnapshot product) {
        if (!product.active()) {
            invalid("삭제되었거나 단종된 Product는 연결할 수 없습니다.");
        }
        if (!product.visible()) {
            invalid("삭제되었거나 비노출인 Product는 연결할 수 없습니다.");
        }
    }

    private void rejectCycles(Draft draft, Set<String> sourceCodes, Set<String> targetCodes) {
        Map<String, Set<String>> edges = new HashMap<>();
        for (RuleSnapshot existing : draft.existingRules()) {
            for (String source : existing.sourceCodes()) {
                edges.computeIfAbsent(source, ignored -> new HashSet<>()).addAll(existing.targetCodes());
            }
        }
        for (String source : sourceCodes) {
            edges.computeIfAbsent(source, ignored -> new HashSet<>()).addAll(targetCodes);
        }
        for (String start : edges.keySet()) {
            Deque<String> queue = new ArrayDeque<>();
            Set<String> visited = new HashSet<>();
            queue.add(start);
            while (!queue.isEmpty()) {
                String current = queue.removeFirst();
                if (!visited.add(current)) {
                    continue;
                }
                for (String next : edges.getOrDefault(current, Set.of())) {
                    if (start.equals(next)) {
                        invalid("source/target graph에 순환이 있습니다.");
                    }
                    queue.addLast(next);
                }
            }
        }
    }

    private ProductSnapshot product(Draft draft, String productCode) {
        ProductSnapshot product = draft.products().get(productCode);
        if (product == null) {
            invalid("Product를 찾을 수 없습니다: " + productCode);
        }
        return product;
    }

    private void validateMultiplier(BigDecimal value, String field) {
        if (value == null || value.signum() <= 0 || value.compareTo(MAX_MULTIPLIER) > 0
                || value.scale() > 4 || value.compareTo(value.setScale(4, java.math.RoundingMode.UNNECESSARY)) != 0) {
            invalid(field + " 배수 범위 또는 소수 scale이 올바르지 않습니다.");
        }
    }

    private void validateCondition(JsonNode node) {
        if (node == null || !node.isObject()) {
            invalid("condition_json은 object여야 합니다.");
        }
        if (node.isEmpty()) {
            return;
        }
        if (node.size() != 1 || !CONDITION_OPERATORS.contains(node.fieldNames().next())) {
            invalid("condition_json에 허용되지 않은 operator가 있습니다.");
        }
        String operator = node.fieldNames().next();
        JsonNode value = node.get(operator);
        if ("optionEquals".equals(operator)) {
            validateOptionPair(value, false);
        } else if ("optionIn".equals(operator)) {
            validateOptionPair(value, true);
        } else if ("not".equals(operator)) {
            validateCondition(value);
        } else {
            if (!value.isArray() || value.isEmpty()) {
                invalid(operator + " 조건은 비어 있을 수 없습니다.");
            }
            for (JsonNode child : value) {
                validateCondition(child);
            }
        }
    }

    private void validateOptionPair(JsonNode value, boolean allowList) {
        if (!value.isArray() || value.size() != 2 || !value.get(0).isTextual()
                || !OPTION_KEYS.contains(value.get(0).asText())
                || (!value.get(1).isValueNode() && !(allowList && value.get(1).isArray()))) {
            invalid("option 조건의 key/value가 허용 계약과 다릅니다.");
        }
    }

    private boolean sameCategory(String expected, String actual) {
        String mapped = "COMMERCIAL_MULTI".equals(actual) ? "COMM_MULTI" : actual;
        return expected.equals(mapped);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static void invalid(String message) {
        throw new BusinessException(ErrorCode.INVALID_INPUT, message);
    }
}
