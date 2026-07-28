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

    /**
     * 저장 시점에 해소한 Product의 검증용 immutable snapshot.
     *
     * <p>재수렴 결함 1 [최우선] fix — {@code category} 단일 nullable String을
     * {@code categories} Set으로 바꾼다. V18 이후 품목은 product_estimate_exposure
     * M:N 테이블로 여러 카테고리에 동시 노출될 수 있어(S-3), "이 품목의 카테고리"라는
     * 단일값 개념 자체가 더 이상 사실과 맞지 않는다 — "이 품목이 노출된 카테고리 집합"만
     * 존재한다. 호출자(QuantitySyncRuleService)가 product_estimate_exposure를 읽어
     * COMMERCIAL_MULTI→COMM_MULTI 매핑과 LEGACY/OTHER 배제(규칙 category 3종에 대응하는
     * 것만 포함)를 마친 뒤 이 집합을 채운다.
     */
    public record ProductSnapshot(String productCode, String productName, Set<String> categories,
                                  boolean active, boolean visible, boolean bundle,
                                  Set<String> componentCodes) {
        public ProductSnapshot {
            categories = Set.copyOf(categories == null ? Set.of() : categories);
            componentCodes = Set.copyOf(componentCodes == null ? Set.of() : componentCodes);
        }
    }

    /** 기존 활성 규칙의 graph/충돌 검사용 immutable snapshot. */
    public record RuleSnapshot(String ruleKey, String category, boolean enabled, JsonNode condition,
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
        // 재수렴 결함 2 [MED] fix — B/C/D: source productCode 중복·target productCode
        // 중복·target displayOrder 중복은 전부 부분 unique index(V24:88-90/96-98/100-102)에서만
        // 걸려 DataIntegrityViolationException → "동시 편집 충돌 또는 제약 위반"(409)으로
        // 원인이 뭉개졌다(GlobalExceptionHandler:131-136). 평범한 입력 실수이지 동시 편집
        // 충돌이 아니므로 여기서 먼저 걸러 400과 함께 무엇이 중복인지 알려준다. DB unique
        // index는 동시 편집 경합의 backstop으로 그대로 둔다(S-4).
        requireUniqueSourceProductCodes(draft.sources());
        requireUniqueTargets(draft.targets());

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
                // 재수렴 결함 1 [최우선] fix — "카테고리가 같다"가 아니라 "이 카테고리에
                // 노출되어 있다" 멤버십 판정이다(M:N, S-3). 품목이 여러 카테고리에 동시
                // 노출되어도 규칙의 category 하나에만 포함되면 연결을 허용한다 — 다른
                // 카테고리 노출 여부는 이 판정과 무관하다. V24 SQL의
                // quantity_sync_product_in_category와 같은 원천(product_estimate_exposure)·
                // 같은 규칙을 본다.
                if (!sourceProduct.categories().contains(draft.category())
                        || !targetProduct.categories().contains(draft.category())) {
                    invalid("category 안에서만 source/target을 연결할 수 있습니다.");
                }
            }
        }

        for (RuleSnapshot existing : draft.existingRules()) {
            // R1 결함 2 [MED]: enabled=false 규칙은 survey.md:509("활성 여부") 대로
            // 강제력이 없어야 한다. 자기 자신(REPLACE 편집) 제외는 이미 있었는데
            // enabled 제외가 없어 비활성 기존 REPLACE 규칙도 새 저장을 막고 있었다.
            // 재수렴 R4 결함 B [MED] fix — JsonNode.equals()는 노드 구현 타입까지 비교해
            // IntNode(1)과 DoubleNode(1.0)을 다르다고 본다. DB V24:307의
            // "r1.condition_json = r2.condition_json"(jsonb =)는 숫자를 numeric으로 비교해
            // 같다고 본다(1과 1.0이 같음). 표기만 다른 동일 조건이 여기서 안 걸리면 DB
            // deferred trigger까지 가서 "동시 편집 충돌 또는 제약 위반"(409)으로 원인이
            // 위장된다 — jsonb와 같은 답을 내는 QuantitySyncConditionEquality로 비교한다.
            if (!draft.ruleKey().equals(existing.ruleKey())
                    && draft.enabled() && existing.enabled()
                    && "REPLACE".equals(draft.conflictPolicy())
                    && "REPLACE".equals(existing.conflictPolicy())
                    && draft.category().equals(existing.category())
                    && QuantitySyncConditionEquality.jsonbEquals(draft.condition(), existing.condition())
                    && !Collections.disjoint(targetCodes, existing.targetCodes())) {
                invalid("동일 condition의 REPLACE target이 중복됩니다.");
            }
        }
        rejectCycles(draft, sourceCodes, targetCodes);
    }

    /**
     * 재수렴 결함 2 [MED] B — 같은 productCode를 source에 두 번 지정하면
     * 부분 unique index {@code ux_qss_rule_source_active}(V24:88-90)에서만 걸린다.
     */
    private void requireUniqueSourceProductCodes(List<SourceDraft> sources) {
        Set<String> seen = new HashSet<>();
        for (SourceDraft source : sources) {
            if (!seen.add(source.productCode())) {
                invalid("source productCode가 중복되었습니다: " + source.productCode());
            }
        }
    }

    /**
     * 재수렴 결함 2 [MED] C·D — 같은 productCode를 target에 두 번 지정(D)하거나
     * 같은 displayOrder를 두 번 지정(C)하면 각각 부분 unique index
     * {@code ux_qst_rule_target_active}(V24:96-98)·{@code ux_qst_rule_display_order_active}
     * (V24:100-102)에서만 걸린다.
     */
    private void requireUniqueTargets(List<TargetDraft> targets) {
        Set<String> seenCodes = new HashSet<>();
        Set<Integer> seenOrders = new HashSet<>();
        for (TargetDraft target : targets) {
            if (!seenCodes.add(target.productCode())) {
                invalid("target productCode가 중복되었습니다: " + target.productCode());
            }
            if (target.displayOrder() != null && !seenOrders.add(target.displayOrder())) {
                invalid("target displayOrder가 중복되었습니다: " + target.displayOrder());
            }
        }
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
            // R1 결함 1 [HIGH]: 이 규칙 자신을 편집(PUT)할 때 activeRuleSnapshots()가
            // soft-delete 전 옛 child를 그대로 포함해, 옛 간선+새 간선이 합쳐져 순환으로
            // 오판됐다. 바로 위 REPLACE 중복 검사는 이미 self를 제외하는데 여기만 빠져
            // 있었다 — 같은 방식으로 self를 제외한다.
            // R1 결함 2 [MED]: enabled=false 기존 규칙도 강제력이 없어야 하므로 cycle
            // 그래프에서 제외한다(survey.md:509).
            if (draft.ruleKey().equals(existing.ruleKey()) || !existing.enabled()) {
                continue;
            }
            for (String source : existing.sourceCodes()) {
                edges.computeIfAbsent(source, ignored -> new HashSet<>()).addAll(existing.targetCodes());
            }
        }
        // draft 자신이 enabled=false로 저장되는 경우도 대칭적으로 강제력이 없다 — DB측
        // cycle CTE도 quantity_sync_rule.enabled=TRUE만 edges에 포함하므로(J-2), 서비스
        // 계층도 같은 답을 내도록 맞춘다.
        if (draft.enabled()) {
            for (String source : sourceCodes) {
                edges.computeIfAbsent(source, ignored -> new HashSet<>()).addAll(targetCodes);
            }
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

    /**
     * option key 검증 — 하드코딩 allowlist를 두지 않는다.
     *
     * <p>🚨 2026-07-28 R1 대조(SONNET5) 결정: 이전에는 18개 하드코딩 option key만 허용했으나,
     * 그 근거를 저장소 전체에서 찾지 못했다 — 실 legacy 식별자({@code legacy-quantity-golden/
     * fixtures.js})는 DOM selector(#home_no_hose 등)·플래그(showIHose·outdoorModel·branchSlots)
     * 형태라 18개 중 문자 그대로 일치 0개였고, {@code remoteOption}/{@code panelOption}은
     * 오히려 {@code BundleExpander.ExpandOptions}(세트옵션, 전혀 다른 도메인)의 필드명과
     * 우연히 같았다. 없는 근거를 지어내는 대신(J-5) 이 key-vocabulary 검증은 evaluator가
     * 실제 옵션 계약을 읽는 슬3으로 미루고, 여기서는 typed 구조(연산자 whitelist·
     * [key,value] arity·key가 공백 아닌 문자열)만 유지한다.
     *
     * <p>🚨 2026-07-28 재수렴 결함 1 [HIGH] fix — value(두번째 원소)의 타입 검사가
     * {@code !value.get(1).isValueNode() && !(allowList && value.get(1).isArray())} 한 식으로
     * 합쳐져 있었다. {@code optionIn}(allowList=true)에서는 이 식이 스칼라({@code isValueNode()
     * = true} → 좌항 false)와 빈 배열({@code isArray()=true} → 우항 false, 배열 길이는 아예
     * 검사하지 않음) 양쪽 모두를 통과시켰다 — V24:170-175 SQL은 optionIn 값을 "배열이고
     * 비어있지 않음"으로 명시적으로 요구하므로, Java가 통과시킨 스칼라/빈 배열이 DB에서만
     * 거부되며 원인이 "동시 편집 충돌 또는 제약 위반"(결함 3이 없애려던 그 409)으로
     * 위장됐다. operator별로 요구 타입을 분리해 Java와 DB가 같은 답을 내도록 맞춘다.
     */
    private void validateOptionPair(JsonNode value, boolean allowList) {
        if (!value.isArray() || value.size() != 2 || !value.get(0).isTextual()
                || value.get(0).asText().isBlank()) {
            invalid("option 조건의 key/value가 허용 계약과 다릅니다.");
        }
        JsonNode operand = value.get(1);
        if (allowList) {
            if (!operand.isArray() || operand.isEmpty()) {
                invalid("option 조건의 key/value가 허용 계약과 다릅니다.");
            }
        } else if (!operand.isValueNode()) {
            invalid("option 조건의 key/value가 허용 계약과 다릅니다.");
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static void invalid(String message) {
        throw new BusinessException(ErrorCode.INVALID_INPUT, message);
    }
}
