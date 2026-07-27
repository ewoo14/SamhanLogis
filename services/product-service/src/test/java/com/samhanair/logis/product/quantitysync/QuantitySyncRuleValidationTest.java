package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidator.Draft;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidator.ProductSnapshot;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidator.RuleSnapshot;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidator.SourceDraft;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidator.TargetDraft;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * 수량 동기화 저장 검증의 RED-first 단위 계약.
 *
 * <p>각 테스트의 입력은 해당 검증이 없을 때 저장 가능한 형태로 먼저 고정한다.
 * 구현 전 실행 결과는 dev-report에 기록하고, validator 구현 후 같은 명령을 GREEN으로 재실행한다.
 */
class QuantitySyncRuleValidationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final QuantitySyncRuleValidator validator = new QuantitySyncRuleValidator();

    @Test
    void 서로_다른_category의_source_target은_저장할_수_없다() {
        Draft draft = draft(
                products(
                        product("SRC-HOME", "HOME_MULTI", true, true, false),
                        product("TARGET-SINGLE", "SINGLE_SET", true, true, false)),
                List.of(new SourceDraft("SRC-HOME", new BigDecimal("1"))),
                List.of(target("TARGET-SINGLE", "1")));

        assertInvalid(draft, "category");
    }

    @Test
    void source와_target이_같으면_저장할_수_없다() {
        Draft draft = draft(
                products(product("SAME", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SAME", new BigDecimal("1"))),
                List.of(target("SAME", "1")));

        assertInvalid(draft, "source와 target");
    }

    @Test
    void 같은_condition의_REPLACE가_같은_target을_두번_지정하면_저장할_수_없다() {
        JsonNode condition = condition("{\"optionEquals\":[\"homeNoHose\",false]}");
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET", "1")))
                .withConflictPolicy("REPLACE")
                .withCondition(condition)
                .withExistingRules(List.of(new RuleSnapshot(
                        "EXISTING", "HOME_MULTI", condition, "REPLACE", 10,
                        Set.of("OTHER-SRC"), Set.of("TARGET"))));
        draft = draft.withProducts(merge(draft.products(), product("OTHER-SRC", "HOME_MULTI", true, true, false)));

        assertInvalid(draft, "REPLACE");
    }

    @Test
    void source_target_graph에_순환이_있으면_저장할_수_없다() {
        Draft draft = draft(
                products(
                        product("SRC-A", "HOME_MULTI", true, true, false),
                        product("TARGET-B", "HOME_MULTI", true, true, false),
                        product("OTHER-SRC", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC-A", new BigDecimal("1"))),
                List.of(target("TARGET-B", "1")))
                .withExistingRules(List.of(new RuleSnapshot(
                        "OTHER", "HOME_MULTI", emptyCondition(), "ADD", 10,
                        Set.of("TARGET-B"), Set.of("SRC-A"))));

        assertInvalid(draft, "순환");
    }

    @Test
    void 삭제되었거나_비노출인_Product는_연결할_수_없다() {
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("HIDDEN", "HOME_MULTI", true, false, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("HIDDEN", "1")));

        assertInvalid(draft, "비노출");
    }

    @Test
    void BUNDLE_source에서_같은_BUNDLE의_component로_연결할_수_없다() {
        Draft draft = draft(
                Map.of(
                        "BUNDLE", product("BUNDLE", "HOME_MULTI", true, true, true, Set.of("COMPONENT")),
                        "COMPONENT", product("COMPONENT", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("BUNDLE", new BigDecimal("1"))),
                List.of(target("COMPONENT", "1")));

        assertInvalid(draft, "BUNDLE");
    }

    @Test
    void factor와_multiplier는_고정된_범위와_소수_scale을_지켜야_한다() {
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1.00001"))),
                List.of(target("TARGET", "1")));

        assertInvalid(draft, "배수");
    }

    @Test
    void source_target이_비어_있는_불완전_graph는_원자적으로_저장할_수_없다() {
        Draft draft = draft(
                products(product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(),
                List.of(target("TARGET", "1")));

        assertInvalid(draft, "source/target");
    }

    private void assertInvalid(Draft draft, String messageFragment) {
        assertThatThrownBy(() -> validator.validate(draft))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining(messageFragment);
    }

    private static Draft draft(Map<String, ProductSnapshot> products,
                               List<SourceDraft> sources,
                               List<TargetDraft> targets) {
        return new Draft(
                "TEST_RULE",
                "HOME_MULTI",
                "테스트 수량 동기화",
                true,
                "SUM",
                emptyCondition(),
                "ZERO",
                "ADD",
                10,
                "896-test",
                sources,
                targets,
                products,
                List.of());
    }

    private static TargetDraft target(String productCode, String multiplier) {
        return new TargetDraft(productCode, new BigDecimal(multiplier), "NONE", 1);
    }

    private static JsonNode condition(String raw) {
        try {
            return MAPPER.readTree(raw);
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    private static JsonNode emptyCondition() {
        return condition("{}");
    }

    private static ProductSnapshot product(String code, String category,
                                          boolean active, boolean visible, boolean bundle) {
        return product(code, category, active, visible, bundle, Set.of());
    }

    private static ProductSnapshot product(String code, String category,
                                          boolean active, boolean visible, boolean bundle,
                                          Set<String> componentCodes) {
        return new ProductSnapshot(code, code + " 품목", category, active, visible, bundle, componentCodes);
    }

    private static Map<String, ProductSnapshot> products(ProductSnapshot... products) {
        return merge(Map.of(), products);
    }

    private static Map<String, ProductSnapshot> merge(Map<String, ProductSnapshot> products,
                                                      ProductSnapshot... additions) {
        java.util.Map<String, ProductSnapshot> result = new java.util.HashMap<>(products);
        for (ProductSnapshot product : additions) {
            result.put(product.productCode(), product);
        }
        return result;
    }
}
