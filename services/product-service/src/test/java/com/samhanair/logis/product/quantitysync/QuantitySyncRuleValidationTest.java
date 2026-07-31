package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThatCode;
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
import java.util.UUID;
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
                        "EXISTING", "HOME_MULTI", true, condition, "REPLACE", 10,
                        Set.of("OTHER-SRC"), Set.of("TARGET"), randomIds(1), randomIds(1))));
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
                        "OTHER", "HOME_MULTI", true, emptyCondition(), "ADD", 10,
                        Set.of("TARGET-B"), Set.of("SRC-A"), randomIds(1), randomIds(1))));

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
    void S03_주문_정수_계약과_충돌하는_소수_계수는_저장할_수_없다() {
        Draft draft = new Draft(
                "SINGLE_S03_CEILING_DRAIN_PUMP",
                "SINGLE_SET",
                "싱글 실링 세트 → 실링용 드레인펌프",
                true,
                "SUM",
                emptyCondition(),
                "ZERO",
                "REPLACE",
                100,
                "S-03",
                List.of(new SourceDraft("S03-SOURCE", new BigDecimal("0.5"))),
                List.of(new TargetDraft("S03-TARGET", new BigDecimal("1"), "NONE", 1)),
                products(
                        product("S03-SOURCE", "SINGLE_SET", true, true, false),
                        product("S03-TARGET", "SINGLE_SET", true, true, false)),
                List.of());

        assertInvalid(draft, "정수");
    }

    @Test
    void S03_legacy_수량과_다른_계수는_shadow_설정으로_저장할_수_없다() {
        Draft draft = new Draft(
                "SINGLE_S03_CEILING_DRAIN_PUMP",
                "SINGLE_SET",
                "싱글 실링 세트 → 실링용 드레인펌프",
                true,
                "SUM",
                emptyCondition(),
                "ZERO",
                "ADD",
                100,
                "S-03",
                List.of(new SourceDraft("S03-SOURCE", new BigDecimal("0.28"))),
                List.of(new TargetDraft("S03-TARGET", new BigDecimal("25"), "NONE", 1)),
                products(
                        product("S03-SOURCE", "SINGLE_SET", true, true, false),
                        product("S03-TARGET", "SINGLE_SET", true, true, false)),
                List.of());

        assertInvalid(draft, "legacy");
    }

    @Test
    void source_target이_비어_있는_불완전_graph는_원자적으로_저장할_수_없다() {
        Draft draft = draft(
                products(product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(),
                List.of(target("TARGET", "1")));

        assertInvalid(draft, "source/target");
    }

    // ---- 재수렴(PR #958 R2) 결함 1 [최우선] S-3 RED-first — 품목의 M:N 카테고리 노출 ----
    //
    // product_estimate_exposure는 한 품목을 여러 카테고리에 동시 노출할 수 있다. "이 품목의
    // category"라는 단일값은 더 이상 사실과 맞지 않아 ProductSnapshot.category(String)를
    // categories(Set<String>) 멤버십으로 바꿨다 — 아래 두 테스트가 그 판정을 고정한다.

    @Test
    void 품목이_여러_카테고리에_노출되면_그중_하나가_규칙_category와_같으면_연결할_수_있다() {
        // draft()의 rule category는 항상 "HOME_MULTI"(정적 helper 고정값). SRC-MULTI는
        // HOME_MULTI·SINGLE_SET 양쪽에 노출되어 있고, 그중 HOME_MULTI가 이 규칙과 일치한다 —
        // 다른 카테고리(SINGLE_SET)에도 노출되어 있다는 사실은 이 판정과 무관해야 한다.
        Draft draft = draft(
                merge(products(product("TARGET", "HOME_MULTI", true, true, false)),
                        productMulti("SRC-MULTI", Set.of("HOME_MULTI", "SINGLE_SET"),
                                true, true, false, Set.of())),
                List.of(new SourceDraft("SRC-MULTI", new BigDecimal("1"))),
                List.of(target("TARGET", "1")));

        assertThatCode(() -> validator.validate(draft)).doesNotThrowAnyException();
    }

    @Test
    void 품목이_노출되지_않은_카테고리로는_여러_카테고리에_노출되어도_연결할_수_없다() {
        // 회귀 방지 lock — M:N으로 바뀌어도 "노출 안 된 카테고리는 여전히 거부"는 유지되어야
        // 한다(§6.5 "같은 category 안에서만 연결"의 핵심은 그대로). SRC-MULTI는 SINGLE_SET·
        // COMM_MULTI 둘에 노출되어 있지만 이 규칙(HOME_MULTI) 어디에도 없다 — 여러 카테고리에
        // 노출되어 있다는 사실 자체가 "아무 카테고리나 연결 가능"으로 완화되면 안 된다.
        Draft draft = draft(
                merge(products(product("TARGET", "HOME_MULTI", true, true, false)),
                        productMulti("SRC-MULTI", Set.of("SINGLE_SET", "COMM_MULTI"),
                                true, true, false, Set.of())),
                List.of(new SourceDraft("SRC-MULTI", new BigDecimal("1"))),
                List.of(target("TARGET", "1")));

        assertInvalid(draft, "category");
    }

    // ---- 재수렴(PR #958 R2) 결함 2 [MED] RED-first — 평범한 입력 실수 B/C/D
    // (A=ruleKey 중복은 서비스 repository 조회가 필요해 QuantitySyncRuleInputMistakeIT에서
    // 실 DB로 검증한다) ----

    @Test
    void source에_같은_productCode를_두_번_지정하면_저장할_수_없다() {
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1")),
                        new SourceDraft("SRC", new BigDecimal("2"))),
                List.of(target("TARGET", "1")));

        assertInvalid(draft, "source");
    }

    @Test
    void target에_같은_productCode를_두_번_지정하면_저장할_수_없다() {
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET", "1"),
                        new TargetDraft("TARGET", new BigDecimal("1"), "NONE", 2)));

        assertInvalid(draft, "target");
    }

    @Test
    void target_displayOrder를_두_번_지정하면_저장할_수_없다() {
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET-1", "HOME_MULTI", true, true, false),
                        product("TARGET-2", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET-1", "1"),
                        new TargetDraft("TARGET-2", new BigDecimal("1"), "NONE", 1)));

        assertInvalid(draft, "displayOrder");
    }

    // ---- 🚨 2026-07-28 범위 축소 R5 A1-① RED-first(S-3) — 같은 품목을 서로 다른 표기
    // (모델코드/모델명)로 지정해도 Java 층이 먼저 같은 결론을 낸다. ProductRepository.
    // findByCatalogExposedModelCodeAndIsDeletedFalse가 model_code 실패 시 model_name으로
    // fallback하므로, 두 문자열이 같은 품목 UUID로 해소될 수 있다 — 문자열만 비교하던
    // 기존 중복 검사(productMulti는 항상 서로 다른 랜덤 UUID)로는 이 케이스를 못 잡는다. ----

    @Test
    void source에_별칭_모델코드_모델명으로_같은_품목을_두_번_지정하면_저장할_수_없다() {
        UUID sharedProductId = UUID.randomUUID();
        Draft draft = draft(
                merge(products(product("TARGET", "HOME_MULTI", true, true, false)),
                        productAlias(sharedProductId, "ALIAS-CODE", "HOME_MULTI"),
                        productAlias(sharedProductId, "ALIAS-NAME", "HOME_MULTI")),
                List.of(new SourceDraft("ALIAS-CODE", new BigDecimal("1")),
                        new SourceDraft("ALIAS-NAME", new BigDecimal("1"))),
                List.of(target("TARGET", "1")));

        assertInvalid(draft, "같은 품목을 중복 지정");
    }

    @Test
    void target에_별칭_모델코드_모델명으로_같은_품목을_두_번_지정하면_저장할_수_없다() {
        UUID sharedProductId = UUID.randomUUID();
        Draft draft = draft(
                merge(products(product("SRC", "HOME_MULTI", true, true, false)),
                        productAlias(sharedProductId, "ALIAS-CODE", "HOME_MULTI"),
                        productAlias(sharedProductId, "ALIAS-NAME", "HOME_MULTI")),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(new TargetDraft("ALIAS-CODE", new BigDecimal("1"), "NONE", 1),
                        new TargetDraft("ALIAS-NAME", new BigDecimal("1"), "NONE", 2)));

        assertInvalid(draft, "같은 품목을 중복 지정");
    }

    @Test
    void 별칭으로_지정해도_source와_target이_같은_품목이면_저장할_수_없다() {
        UUID sharedProductId = UUID.randomUUID();
        Draft draft = draft(
                merge(Map.of(), productAlias(sharedProductId, "ALIAS-CODE", "HOME_MULTI"),
                        productAlias(sharedProductId, "ALIAS-NAME", "HOME_MULTI")),
                List.of(new SourceDraft("ALIAS-CODE", new BigDecimal("1"))),
                List.of(target("ALIAS-NAME", "1")));

        assertInvalid(draft, "source와 target");
    }

    // ---- 🚨 2026-07-28 재수렴 결함 1·2·3 [단일 근본 원인] RED-first — 위 S-3 fix는 "한
    // 요청 안"의 별칭만 productId로 잡는다. draft ↔ 기존 규칙(순환·REPLACE 중복)·
    // draft ↔ bundle_component(BUNDLE 구성품) 비교는 여전히 문자열(productCode)만 본다 —
    // 기존 규칙/구성품이 쓰는 문자열은 canonical modelCode인데 draft가 별칭(modelName)으로
    // 같은 품목을 가리키면 두 문자열이 달라 통과했다. 아래 세 테스트는 각 비교 지점에서
    // "기존 쪽 문자열"과 "draft 쪽 문자열"이 다르지만 productId는 같은 상황을 구성해
    // 문자열 검사만으로는 못 잡고 productId 축이 있어야 잡히는지 고정한다. ----

    @Test
    void 기존_규칙이_참조하는_품목을_별칭으로_재지정해도_순환은_거부된다() {
        UUID srcId = UUID.randomUUID();
        UUID tgtId = UUID.randomUUID();
        Draft draft = draft(
                merge(Map.of(),
                        productAlias(srcId, "SRC", "HOME_MULTI"),
                        productAlias(tgtId, "TGT_ALIAS", "HOME_MULTI")),
                List.of(new SourceDraft("TGT_ALIAS", new BigDecimal("1"))),
                List.of(target("SRC", "1")))
                .withExistingRules(List.of(new RuleSnapshot(
                        "RC_A", "HOME_MULTI", true, emptyCondition(), "ADD", 10,
                        Set.of("SRC"), Set.of("TGT"), Set.of(srcId), Set.of(tgtId))));

        assertInvalid(draft, "순환");
    }

    @Test
    void 기존_REPLACE_규칙의_target을_별칭으로_재지정해도_중복으로_거부된다() {
        UUID otherSrcId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        JsonNode condition = condition("{\"optionEquals\":[\"homeNoHose\",false]}");
        Draft draft = draft(
                merge(Map.of(),
                        productAlias(UUID.randomUUID(), "SRC", "HOME_MULTI"),
                        productAlias(targetId, "TARGET_ALIAS", "HOME_MULTI")),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET_ALIAS", "1")))
                .withConflictPolicy("REPLACE")
                .withCondition(condition)
                .withExistingRules(List.of(new RuleSnapshot(
                        "EXISTING", "HOME_MULTI", true, condition, "REPLACE", 10,
                        Set.of("OTHER-SRC"), Set.of("TARGET"), Set.of(otherSrcId), Set.of(targetId))));

        assertInvalid(draft, "REPLACE");
    }

    @Test
    void BUNDLE_구성품을_별칭으로_재지정해도_연결할_수_없다() {
        UUID componentId = UUID.randomUUID();
        ProductSnapshot bundle = new ProductSnapshot(UUID.randomUUID(), "BUNDLE", "BUNDLE 품목",
                Set.of("HOME_MULTI"), true, true, true, Set.of(), Set.of(componentId));
        ProductSnapshot componentAlias = productAlias(componentId, "COMPONENT_ALIAS", "HOME_MULTI");
        Draft draft = draft(
                Map.of("BUNDLE", bundle, "COMPONENT_ALIAS", componentAlias),
                List.of(new SourceDraft("BUNDLE", new BigDecimal("1"))),
                List.of(target("COMPONENT_ALIAS", "1")));

        assertInvalid(draft, "BUNDLE");
    }

    // ---- 🚨 2026-07-28 범위 축소 R5 A2-①·A2-② RED-first — condition_json leaf scalar가
    // PostgreSQL jsonb에 저장 불가능한 값이면 저장 이전에 400으로 거부한다. ----

    @Test
    void condition의_숫자_값이_double_범위를_벗어나면_저장할_수_없다() {
        // A2-① 재현 형태 — Jackson이 "1e400"을 DoubleNode(Infinity)로 파싱한다. 이 값이
        // 저장 이전 검증을 통과하면 REPLACE 중복 비교(QuantitySyncConditionEquality
        // #jsonbEquals)의 decimalValue()가 NumberFormatException으로 500을 냈었다.
        JsonNode condition = condition("{\"optionEquals\":[\"k\",1e400]}");
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET", "1")))
                .withCondition(condition);

        assertInvalid(draft, "숫자 값");
    }

    @Test
    void condition의_optionIn_배열_원소가_double_범위를_벗어나도_저장할_수_없다() {
        JsonNode condition = condition("{\"optionIn\":[\"k\",[1,1e400]]}");
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET", "1")))
                .withCondition(condition);

        assertInvalid(draft, "숫자 값");
    }

    @Test
    void condition의_문자열_값에_NUL_문자가_있으면_저장할_수_없다() {
        // A2-② 재현 형태 — PostgreSQL jsonb는 U+0000을 파싱 단계에서 거부한다
        // ("unsupported Unicode escape sequence"). JSON 텍스트로 직렬화하면 raw NUL은
        // 그 자체로 유효한 JSON 문자열이 아니므로(제어문자는 이스케이프 필요), 파싱이 아니라
        // JsonNode 트리를 직접 조립해 validator가 실제로 받는 형태(디코딩된 문자열 값)를
        // 그대로 재현한다.
        String nul = String.valueOf((char) 0);
        JsonNode condition = optionEqualsCondition("k", "a" + nul + "b");
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET", "1")))
                .withCondition(condition);

        assertInvalid(draft, "NUL");
    }

    @Test
    void condition의_option_key에_NUL_문자가_있으면_저장할_수_없다() {
        String nul = String.valueOf((char) 0);
        JsonNode condition = optionEqualsCondition("k" + nul, "L");
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET", "1")))
                .withCondition(condition);

        assertInvalid(draft, "NUL");
    }

    /** JSON 텍스트 파싱을 거치지 않고 {@code {"optionEquals":[key,value]}} 트리를 직접 조립한다. */
    private static JsonNode optionEqualsCondition(String key, String value) {
        com.fasterxml.jackson.databind.node.ArrayNode pair = MAPPER.createArrayNode();
        pair.add(key);
        pair.add(value);
        com.fasterxml.jackson.databind.node.ObjectNode node = MAPPER.createObjectNode();
        node.set("optionEquals", pair);
        return node;
    }

    // ---- R1 결함 1 [HIGH] · 결함 2 [MED] RED-first (PR #958 R1 발견 각도) ----

    @Test
    void 자기_자신을_편집할_때_옛_관계가_새_관계와_합쳐져_순환으로_오판되지_않는다() {
        // draft()의 ruleKey는 항상 "TEST_RULE". 이 규칙 자신의 옛 snapshot(A->B)을
        // existingRules에 그대로 두고, 새 정의는 맞교환(B->A)한다. 자기 자신의 옛 간선은
        // 판정에서 제외되어야 한다(J-1) — REPLACE 중복 검사(:218)는 이미 self를 제외하는데
        // rejectCycles만 제외가 없었다(R1 결함 1).
        Draft draft = draft(
                products(
                        product("A", "HOME_MULTI", true, true, false),
                        product("B", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("B", new BigDecimal("1"))),
                List.of(target("A", "1")))
                .withExistingRules(List.of(new RuleSnapshot(
                        "TEST_RULE", "HOME_MULTI", true, emptyCondition(), "ADD", 10,
                        Set.of("A"), Set.of("B"), randomIds(1), randomIds(1))));

        assertThatCode(() -> validator.validate(draft)).doesNotThrowAnyException();
    }

    @Test
    void 비활성_기존_규칙은_순환_판정에_강제력이_없다() {
        // ruleKey가 draft와 다른 "DISABLED_OTHER" — self 제외가 아니라 enabled 제외가
        // 이 케이스를 구제해야 한다(R1 결함 2(b): X(A->B, enabled=false) 후 Y(B->A)가
        // 순환으로 오거부됨).
        Draft draft = draft(
                products(
                        product("A", "HOME_MULTI", true, true, false),
                        product("B", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("B", new BigDecimal("1"))),
                List.of(target("A", "1")))
                .withExistingRules(List.of(new RuleSnapshot(
                        "DISABLED_OTHER", "HOME_MULTI", false, emptyCondition(), "ADD", 10,
                        Set.of("A"), Set.of("B"), randomIds(1), randomIds(1))));

        assertThatCode(() -> validator.validate(draft)).doesNotThrowAnyException();
    }

    @Test
    void 비활성_기존_규칙은_REPLACE_중복_판정에도_강제력이_없다() {
        // survey.md:509 "enabled: 활성 여부"가 REPLACE 중복 검사에도 대칭 적용되어야
        // 한다(J-3) — 순환 검사만 고치고 REPLACE 중복은 남겨두면 같은 결함이 다른 자리에
        // 남는다.
        JsonNode condition = condition("{\"optionEquals\":[\"homeNoHose\",false]}");
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false),
                        product("OTHER-SRC", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET", "1")))
                .withConflictPolicy("REPLACE")
                .withCondition(condition)
                .withExistingRules(List.of(new RuleSnapshot(
                        "DISABLED_REPLACE", "HOME_MULTI", false, condition, "REPLACE", 10,
                        Set.of("OTHER-SRC"), Set.of("TARGET"), randomIds(1), randomIds(1))));

        assertThatCode(() -> validator.validate(draft)).doesNotThrowAnyException();
    }

    // ---- 대조-1 [MED] J-5: option key allowlist 근거 부재 → 슬3으로 이관 ----

    @Test
    void 조건_JSON의_option_key는_실재_근거_불명_allowlist에_없어도_공백만_아니면_저장할_수_있다() {
        // R1 대조(SONNET5): 하드코딩 18개 중 legacy-quantity-golden/fixtures.js 실제
        // 식별자와 문자 그대로 일치 0개. "outdoorModel"은 그 fixtures.js의 실제 플래그
        // 이름이지만 18개 allowlist에는 없었다 — allowlist 자체가 근거 없이 발명된 것임을
        // 보여준다. 근거 없는 key-vocabulary 검증은 슬3(evaluator)로 미룬다(J-5).
        JsonNode condition = condition("{\"optionEquals\":[\"outdoorModel\",\"SLIM\"]}");
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET", "1")))
                .withCondition(condition);

        assertThatCode(() -> validator.validate(draft)).doesNotThrowAnyException();
    }

    @Test
    void 조건_JSON의_option_key가_공백이면_여전히_저장할_수_없다() {
        // 잠금 테스트(RED-first 아님) — key-vocabulary 검증을 슬3으로 미뤄도 구조적
        // 제약(공백 아닌 문자열)까지 사라지면 안 된다.
        JsonNode condition = condition("{\"optionEquals\":[\"\",\"SLIM\"]}");
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET", "1")))
                .withCondition(condition);

        assertInvalid(draft, "option");
    }

    // ---- R1(재수렴) 결함 1 [HIGH] RED-first — optionIn value가 Java를 통과하고 DB에서만 걸림 ----
    //
    // QuantitySyncRuleValidator.validateOptionPair(value, allowList=true)의 불리언식이
    // "!isValueNode() && !(allowList && isArray())" 형태라 optionIn(allowList=true)에서
    // value[1]이 스칼라(isValueNode=true)거나 빈 배열(isArray=true지만 length 검사 없음)이면
    // 두 항 모두 false가 되어 invalid()를 타지 않는다. 그러나 V24:170-175 SQL은
    // "jsonb_typeof(...) <> 'array' OR jsonb_array_length(...) = 0"으로 배열+비공란을
    // 명시적으로 요구한다 — Java가 통과시킨 입력을 DB가 거부해 "동시 편집 충돌 또는
    // 제약 위반" 409로 원인이 위장된다(결함 3 fix가 없애려던 바로 그 문제).

    @Test
    void optionIn_값이_스칼라면_Java_검증에서도_저장할_수_없다() {
        JsonNode condition = condition("{\"optionIn\":[\"homeHoseType\",\"L\"]}");
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET", "1")))
                .withCondition(condition);

        assertInvalid(draft, "option");
    }

    @Test
    void optionIn_값이_빈_배열이면_Java_검증에서도_저장할_수_없다() {
        JsonNode condition = condition("{\"optionIn\":[\"homeHoseType\",[]]}");
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET", "1")))
                .withCondition(condition);

        assertInvalid(draft, "option");
    }

    @Test
    void optionIn_값이_비공란_배열이면_저장할_수_있다() {
        // control — DB도 이 형태만 수락한다(V24:170-175). Java가 이 통제군까지
        // 거부하게 되면 과잉수정이므로 회귀 방지로 함께 고정한다.
        JsonNode condition = condition("{\"optionIn\":[\"homeHoseType\",[\"L\"]]}");
        Draft draft = draft(
                products(
                        product("SRC", "HOME_MULTI", true, true, false),
                        product("TARGET", "HOME_MULTI", true, true, false)),
                List.of(new SourceDraft("SRC", new BigDecimal("1"))),
                List.of(target("TARGET", "1")))
                .withCondition(condition);

        assertThatCode(() -> validator.validate(draft)).doesNotThrowAnyException();
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
        return productMulti(code, Set.of(category), active, visible, bundle, componentCodes);
    }

    /**
     * 재수렴 결함 1 [최우선] fix — 품목이 여러 카테고리에 동시 노출(M:N, S-3)될 때를
     * 구성하는 헬퍼. 기존 {@link #product(String, String, boolean, boolean, boolean)}는
     * 단일 category만 표현할 수 있어 남겨두고, 이 헬퍼로 M:N 케이스만 별도로 구성한다.
     *
     * <p>🚨 2026-07-28 범위 축소 R5 A1-① fix — {@code productId}를 매번 새 랜덤 UUID로
     * 채운다. 이 헬퍼로 만드는 기존 테스트는 전부 code마다 서로 다른 품목을 표현하므로
     * (별칭 케이스가 아님) 랜덤 UUID가 항상 서로 다르면 기존 동작과 동일하다. 같은 품목을
     * 서로 다른 표기로 표현해야 하는 별칭 테스트는 {@link #productAlias}를 쓴다.
     */
    private static ProductSnapshot productMulti(String code, Set<String> categories,
                                                 boolean active, boolean visible, boolean bundle,
                                                 Set<String> componentCodes) {
        return new ProductSnapshot(UUID.randomUUID(), code, code + " 품목", categories,
                active, visible, bundle, componentCodes, Set.of());
    }

    /**
     * 🚨 2026-07-28 범위 축소 R5 A1-① RED-first(S-3) — 같은 품목을 가리키는 서로 다른
     * 표기(모델코드/모델명)를 표현한다. {@code productId}를 호출자가 명시해 여러 code가
     * 같은 품목을 공유하게 만들 수 있다({@link #productMulti}는 매번 새 랜덤 UUID라 이
     * 용도로 쓸 수 없다).
     */
    private static ProductSnapshot productAlias(UUID productId, String code, String category) {
        return new ProductSnapshot(productId, code, code + " 품목", Set.of(category),
                true, true, false, Set.of(), Set.of());
    }

    /**
     * 🚨 2026-07-28 재수렴 결함 1·2 [단일 근본 원인] RED-first 전용 — 순환/REPLACE 중복
     * 테스트에서 productId를 채워야 하지만 그 값 자체가 검증에 무관한(self/enabled로
     * 먼저 걸러지는) 기존 테스트의 나머지 4개 {@code RuleSnapshot} 호출을 위한 자리채움.
     * 서로 다른 랜덤 UUID라 다른 어떤 productId와도 우연히 일치하지 않는다.
     */
    private static Set<UUID> randomIds(int count) {
        java.util.Set<UUID> ids = new java.util.HashSet<>();
        for (int i = 0; i < count; i++) {
            ids.add(UUID.randomUUID());
        }
        return ids;
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
