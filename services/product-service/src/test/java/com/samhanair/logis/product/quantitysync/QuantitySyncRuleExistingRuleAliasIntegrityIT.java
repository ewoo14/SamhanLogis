package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.QuantitySyncRuleService;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import com.samhanair.logis.product.web.dto.UpdateProductRequest;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 🚨 2026-07-28 범위 축소 후 재수렴 라운드 결함 1·2·3 [단일 근본 원인] — S-3 별칭 fix(A1-①)는
 * "한 요청 안"의 source-source/target-target/source-target 별칭만 productId로 판정했다.
 * {@code draft ↔ 기존 규칙}(순환·REPLACE 중복)과 {@code draft ↔ bundle_component}(BUNDLE
 * 구성품) 비교는 여전히 문자열(productCode)만 봤다 — draft 는 사용자 입력 원문,
 * 기존 규칙/구성품은 {@code QuantitySyncRuleService#productCode()}가 만드는 정규 modelCode라
 * 서로 다른 네임스페이스다. modelCode 는 불변이고 modelName 만 바뀔 수 있으므로(개발책임자
 * 결정), 품목 modelName 을 한 번 바꾸면 "새 표기(modelName)로 같은 품목을 가리켜 기존
 * 규칙/구성품 검사를 우회"할 수 있었다.
 *
 * <p>각 테스트는 [대조군](변경 없는 표기로 시도 — 여전히 거부되어야 함)과 [공격](renamed
 * 표기로 시도 — 이 라운드 전에는 저장됐던 것)을 함께 실행해 fix 가 대조군을 깨지 않는지도
 * 같은 테스트에서 고정한다.
 */
@SpringBootTest(classes = ProductServiceApplication.class)
class QuantitySyncRuleExistingRuleAliasIntegrityIT extends AbstractPostgresIT {

    private static final String CREATED_BY = "896-S2-ALIASINTEGRITY";
    private static final String LEGACY_REF = "896-aliasintegrity";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private ProductService productService;

    @Autowired
    private QuantitySyncRuleService quantitySyncRuleService;

    @BeforeEach
    void setUp() {
        cleanup();
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    // ---- 결함 1 [HIGH] — 순환 검사가 draft ↔ 기존 규칙을 문자열로만 비교한다 ----

    @Test
    void 기존_규칙이_참조하는_품목을_modelName_별칭으로_재지정해도_순환은_거부된다() throws Exception {
        product("ALIAS-SRC-A");
        UUID targetId = product("ALIAS-TGT-B");
        quantitySyncRuleService.create(request("ALIAS_RULE_A", "ALIAS-SRC-A", "ALIAS-TGT-B"), "qa-alias");

        renameModelName(targetId, "ALIAS-TGT-B-RENAMED");

        // 대조군 — modelCode(원표기)로 역방향을 시도하면 여전히 순환으로 거부된다.
        assertThatThrownBy(() -> quantitySyncRuleService.create(
                request("ALIAS_RULE_B_CTRL", "ALIAS-TGT-B", "ALIAS-SRC-A"), "qa-alias"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("source는 부자재 역할 품목일 수 없습니다");

        // 공격 — modelName(별칭 표기)로 같은 역방향을 시도해도 같은 품목이므로 순환이어야 한다.
        assertThatThrownBy(() -> quantitySyncRuleService.create(
                request("ALIAS_RULE_B_ATTACK", "ALIAS-TGT-B-RENAMED", "ALIAS-SRC-A"), "qa-alias"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("source는 부자재 역할 품목일 수 없습니다");
    }

    // ---- 결함 2 [MED] — cross-rule REPLACE 중복 검사가 draft ↔ 기존 규칙을 문자열로만 비교한다 ----

    @Test
    void 기존_REPLACE_규칙의_target을_modelName_별칭으로_재지정해도_중복은_거부된다() throws Exception {
        product("ALIAS-SRC-C");
        UUID targetId = product("ALIAS-TGT-D");
        product("ALIAS-SRC-E");
        JsonNode condition = MAPPER.readTree("{\"optionEquals\":[\"homeNoHose\",false]}");
        quantitySyncRuleService.create(
                replaceRequest("ALIAS_REPLACE_EXIST", "ALIAS-SRC-C", "ALIAS-TGT-D", condition), "qa-alias");

        renameModelName(targetId, "ALIAS-TGT-D-RENAMED");

        // 대조군 — modelCode(원표기)로 동일 condition의 REPLACE target을 다시 지정하면 여전히 거부된다.
        assertThatThrownBy(() -> quantitySyncRuleService.create(
                replaceRequest("ALIAS_REPLACE_CTRL", "ALIAS-SRC-E", "ALIAS-TGT-D", condition), "qa-alias"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("REPLACE");

        // 공격 — modelName(별칭 표기)로 같은 target을 지정해도 같은 품목이므로 거부되어야 한다.
        assertThatThrownBy(() -> quantitySyncRuleService.create(
                replaceRequest("ALIAS_REPLACE_ATTACK", "ALIAS-SRC-E", "ALIAS-TGT-D-RENAMED", condition), "qa-alias"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("REPLACE");
    }

    // ---- 결함 3 [MED] — BUNDLE 구성품 검사가 draft ↔ bundle_component를 문자열로만 비교한다 ----

    @Test
    void BUNDLE_구성품을_modelName_별칭으로_재지정해도_연결은_거부된다() throws Exception {
        UUID bundleId = bundleProduct("ALIAS-BUNDLE-F");
        UUID componentId = product("ALIAS-COMP-G");
        insertBundleComponent(bundleId, "ALIAS-COMP-G");

        renameModelName(componentId, "ALIAS-COMP-G-RENAMED");

        // 대조군 — modelCode(원표기, bundle_component.component_product_code와 동일)로
        // 시도하면 여전히 BUNDLE 구성품 검사에 걸린다.
        assertThatThrownBy(() -> quantitySyncRuleService.create(
                request("ALIAS_BUNDLE_CTRL", "ALIAS-BUNDLE-F", "ALIAS-COMP-G"), "qa-alias"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("BUNDLE");

        // 공격 — modelName(별칭 표기)으로 같은 구성품을 지정해도 같은 품목이므로 거부되어야 한다.
        assertThatThrownBy(() -> quantitySyncRuleService.create(
                request("ALIAS_BUNDLE_ATTACK", "ALIAS-BUNDLE-F", "ALIAS-COMP-G-RENAMED"), "qa-alias"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("BUNDLE");
    }

    private void renameModelName(UUID productId, String newModelName) {
        productService.update(productId, new UpdateProductRequest(null, newModelName, null, null));
        assertThat(jdbcTemplate.queryForObject(
                "SELECT model_name FROM products WHERE id = ?", String.class, productId))
                .isEqualTo(newModelName);
    }

    private QuantitySyncRuleRequest request(String ruleKey, String sourceCode, String targetCode) throws Exception {
        classifyQuantitySyncTarget(targetCode);
        JsonNode condition = MAPPER.readTree("{}");
        return new QuantitySyncRuleRequest(ruleKey, QuantitySyncEstimateCategory.HOME_MULTI,
                ruleKey + " 이름", true, "SUM", condition, QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.ADD, 10, LEGACY_REF,
                java.util.List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, new BigDecimal("1"))),
                java.util.List.of(new QuantitySyncRuleRequest.TargetRequest(
                        targetCode, new BigDecimal("1"), "NONE", 1)));
    }

    private QuantitySyncRuleRequest replaceRequest(String ruleKey, String sourceCode, String targetCode,
                                                    JsonNode condition) {
        classifyQuantitySyncTarget(targetCode);
        return new QuantitySyncRuleRequest(ruleKey, QuantitySyncEstimateCategory.HOME_MULTI,
                ruleKey + " 이름", true, "SUM", condition, QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.REPLACE, 10, LEGACY_REF,
                java.util.List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, new BigDecimal("1"))),
                java.util.List.of(new QuantitySyncRuleRequest.TargetRequest(
                        targetCode, new BigDecimal("1"), "NONE", 1)));
    }

    /** 단일(SINGLE) 품목 + HOME_MULTI 노출 fixture — QuantitySyncRuleProductDiscontinueIT와 동일 패턴. */
    private UUID product(String code) {
        UUID id = UUID.randomUUID();
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        jdbcTemplate.update("""
                INSERT INTO products (
                    id, name, model_name, category_id, selling_price, purchase_price,
                    created_at, created_by, is_deleted, status, model_code, product_type,
                    usage_scope)
                VALUES (?, ?, ?, ?, 0, 0, now(), ?, false, 'ACTIVE', ?, 'SINGLE', 'BOTH')
                """, id, code + " 품목", code, categoryId, CREATED_BY, code);
        insertExposure(id);
        return id;
    }

    /** BUNDLE 품목 + HOME_MULTI 노출 fixture — QuantitySyncRuleScopeReductionRegressionIT와 동일 패턴. */
    private UUID bundleProduct(String code) {
        UUID id = UUID.randomUUID();
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        jdbcTemplate.update("""
                INSERT INTO products (
                    id, name, model_name, category_id, selling_price, purchase_price,
                    created_at, created_by, is_deleted, status, model_code, product_type,
                    usage_scope)
                VALUES (?, ?, ?, ?, 0, 0, now(), ?, false, 'ACTIVE', ?, 'BUNDLE', 'BOTH')
                """, id, code + " 품목", code, categoryId, CREATED_BY, code);
        insertExposure(id);
        return id;
    }

    private void insertExposure(UUID productId) {
        jdbcTemplate.update("""
                INSERT INTO product_estimate_exposure (
                    id, product_id, estimate_category, display_order,
                    created_at, created_by, is_deleted)
                VALUES (?, ?, 'HOME_MULTI', 1, now(), ?, false)
                """, UUID.randomUUID(), productId, CREATED_BY);
    }

    private void insertBundleComponent(UUID bundleProductId, String componentProductCode) {
        jdbcTemplate.update("""
                INSERT INTO bundle_component (
                    id, bundle_product_id, component_product_code, default_qty, qty_mode,
                    component_kind, is_default, created_at, created_by, is_deleted)
                VALUES (?, ?, ?, 1, 'FIXED', 'ACCESSORY', true, now(), ?, false)
                """, UUID.randomUUID(), bundleProductId, componentProductCode, CREATED_BY);
    }

    private void cleanup() {
        // source/target/rule 하드 삭제를 별도 auto-commit 문으로 나누면 그 사이 순간에
        // deferred constraint trigger가 오탐한다 — 세 DELETE를 한 transaction으로 묶는다
        // (다른 quantitysync IT와 동일 원인. 이 슬라이스는 트리거가 제거됐지만 관행을 유지한다).
        runInTransaction(connection -> {
            execute(connection, """
                    DELETE FROM quantity_sync_source
                     WHERE rule_id IN (SELECT id FROM quantity_sync_rule WHERE legacy_ref = ?)
                    """, LEGACY_REF);
            execute(connection, """
                    DELETE FROM quantity_sync_target
                     WHERE rule_id IN (SELECT id FROM quantity_sync_rule WHERE legacy_ref = ?)
                    """, LEGACY_REF);
            execute(connection, "DELETE FROM quantity_sync_rule WHERE legacy_ref = ?", LEGACY_REF);
        });
        jdbcTemplate.update("""
                DELETE FROM bundle_component
                 WHERE bundle_product_id IN (SELECT id FROM products WHERE model_code LIKE 'ALIAS-%')
                """);
        jdbcTemplate.update("""
                DELETE FROM product_estimate_exposure
                 WHERE product_id IN (SELECT id FROM products WHERE model_code LIKE 'ALIAS-%')
                """);
        jdbcTemplate.update("DELETE FROM products WHERE model_code LIKE 'ALIAS-%'");
    }

    private void runInTransaction(SqlWork work) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                work.run(connection);
                connection.commit();
            } catch (Exception failure) {
                connection.rollback();
                throw new IllegalStateException("cleanup 실패", failure);
            }
        } catch (SQLException e) {
            throw new IllegalStateException("cleanup 연결 실패", e);
        }
    }

    private void execute(Connection connection, String sql, String param) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, param);
            statement.executeUpdate();
        }
    }

    @FunctionalInterface
    private interface SqlWork {
        void run(Connection connection) throws Exception;
    }
}
