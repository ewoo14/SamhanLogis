package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.Classification;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.ProductGoodsType;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.service.ClassificationService;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.QuantitySyncRuleService;
import com.samhanair.logis.product.web.dto.CreateClassificationRequest;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import com.samhanair.logis.product.web.dto.UpdateClassificationRequest;
import com.samhanair.logis.product.web.dto.UpdateProductClassificationRequest;
import com.samhanair.logis.product.web.dto.UpdateProductGoodsTypeRequest;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** 활성 수량 동기화 규칙이 품목·분류 역할 변경으로 우회되지 않는지 검증한다. */
@SpringBootTest(classes = ProductServiceApplication.class)
class QuantitySyncRuleProductRoleMutationIT extends AbstractPostgresIT {

    private static final String CREATED_BY = "896-R31-ROLE";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private ProductService productService;

    @Autowired
    private ClassificationService classificationService;

    @Autowired
    private QuantitySyncRuleService quantitySyncRuleService;

    private UUID renamedClassificationId;

    @BeforeEach
    void setUp() {
        cleanup();
    }

    @AfterEach
    void tearDown() {
        if (renamedClassificationId != null) {
            classificationService.update(renamedClassificationId,
                    new UpdateClassificationRequest(null, "부자재", null, null));
            renamedClassificationId = null;
        }
        cleanup();
    }

    @Test
    void 활성_target의_대분류를_없음으로_바꾸면_규칙과_품목이_그대로_보존된다() throws Exception {
        createValidRule("R31_TARGET_NULL");

        assertThatThrownBy(() -> productService.updateClassificationAndFixedDiscount(
                "AXJ-YA1509N", new UpdateProductClassificationRequest(null, null, null)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("R31_TARGET_NULL");

        assertThat(jdbcTemplate.queryForObject(
                "SELECT cat_l_id IS NOT NULL FROM products WHERE model_code = 'AXJ-YA1509N'",
                Boolean.class)).isTrue();
        assertThat(quantitySyncRuleService.list(QuantitySyncEstimateCategory.HOME_MULTI))
                .extracting("ruleKey").contains("R31_TARGET_NULL");
    }

    @Test
    void 활성_target을_NON_GOODS로_바꾸면_규칙과_품목이_그대로_보존된다() throws Exception {
        createValidRule("R31_TARGET_NON_GOODS");

        assertThatThrownBy(() -> productService.updateGoodsTypeAndReturn("AXJ-YA1509N",
                new UpdateProductGoodsTypeRequest(ProductGoodsType.NON_GOODS)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("R31_TARGET_NON_GOODS");

        assertThat(jdbcTemplate.queryForObject(
                "SELECT goods_type FROM products WHERE model_code = 'AXJ-YA1509N'",
                String.class)).isEqualTo("GOODS");
    }

    @Test
    void 활성_target을_비허용_대분류로_바꾸면_규칙과_품목이_그대로_보존된다() throws Exception {
        createValidRule("R31_TARGET_NON_MATERIAL");
        UUID indoorClassification = ensureLClassification("실내기");

        assertThatThrownBy(() -> productService.updateClassificationAndFixedDiscount(
                "AXJ-YA1509N", new UpdateProductClassificationRequest(indoorClassification, null, null)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("R31_TARGET_NON_MATERIAL");

        assertThat(jdbcTemplate.queryForObject("""
                SELECT c.name
                  FROM products p
                  JOIN classification c ON c.id = p.cat_l_id
                 WHERE p.model_code = 'AXJ-YA1509N'
                """, String.class)).isEqualTo("부자재");
    }

    @Test
    void 활성_source를_부자재_대분류로_바꾸면_규칙과_품목이_그대로_보존된다() throws Exception {
        createValidRule("R31_SOURCE_MATERIAL");
        UUID materialClassification = QuantitySyncRuleTestCatalog.ensureMaterialClassification(
                classificationService, EstimateCategory.HOME_MULTI);

        assertThatThrownBy(() -> productService.updateClassificationAndFixedDiscount(
                "AJ020BN1PBC1", new UpdateProductClassificationRequest(materialClassification, null, null)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("R31_SOURCE_MATERIAL");

        assertThat(jdbcTemplate.queryForObject(
                "SELECT cat_l_id IS NULL FROM products WHERE model_code = 'AJ020BN1PBC1'",
                Boolean.class)).isTrue();
    }

    @Test
    void 허용_대분류명을_비허용으로_바꾸면_참조_규칙과_분류가_그대로_보존된다() throws Exception {
        createValidRule("R31_CLASSIFICATION_RENAME");
        renamedClassificationId = QuantitySyncRuleTestCatalog.ensureMaterialClassification(
                classificationService, EstimateCategory.HOME_MULTI);

        assertThatThrownBy(() -> classificationService.update(renamedClassificationId,
                new UpdateClassificationRequest(null, "R31-비허용", null, null)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("R31_CLASSIFICATION_RENAME");

        assertThat(classificationService.list(EstimateCategory.HOME_MULTI, null))
                .anyMatch(row -> row.id().equals(renamedClassificationId)
                        && row.name().equals("부자재"));
    }

    @Test
    void 규칙과_무관한_품목은_역할을_정상적으로_바꿀_수_있다() {
        product("R31-UNRELATED");
        UUID materialClassification = QuantitySyncRuleTestCatalog.ensureMaterialClassification(
                classificationService, EstimateCategory.HOME_MULTI);

        productService.updateClassificationAndFixedDiscount("R31-UNRELATED",
                new UpdateProductClassificationRequest(materialClassification, null, null));
        productService.updateGoodsTypeAndReturn("R31-UNRELATED",
                new UpdateProductGoodsTypeRequest(ProductGoodsType.NON_GOODS));

        assertThat(jdbcTemplate.queryForObject("""
                SELECT p.goods_type
                  FROM products p
                 WHERE p.model_code = 'R31-UNRELATED'
                """, String.class)).isEqualTo("NON_GOODS");
    }

    @Test
    void 비활성_규칙만_참조하는_품목은_역할을_정상적으로_바꿀_수_있다() throws Exception {
        createValidRule("R31_DISABLED", false);

        productService.updateClassificationAndFixedDiscount("AXJ-YA1509N",
                new UpdateProductClassificationRequest(null, null, null));
        productService.updateGoodsTypeAndReturn("AXJ-YA1509N",
                new UpdateProductGoodsTypeRequest(ProductGoodsType.NON_GOODS));

        assertThat(jdbcTemplate.queryForObject("""
                SELECT p.goods_type
                  FROM products p
                 WHERE p.model_code = 'AXJ-YA1509N'
                """, String.class)).isEqualTo("NON_GOODS");
    }

    @Test
    void target을_다른_허용_부자재_대분류로_옮기는_것은_허용된다() throws Exception {
        createValidRule("R31_VALID_ROLE");
        UUID panelClassification = ensureLClassification("판넬");

        productService.updateClassificationAndFixedDiscount("AXJ-YA1509N",
                new UpdateProductClassificationRequest(panelClassification, null, null));

        assertThat(jdbcTemplate.queryForObject("""
                SELECT c.name
                  FROM products p
                  JOIN classification c ON c.id = p.cat_l_id
                 WHERE p.model_code = 'AXJ-YA1509N'
                """, String.class)).isEqualTo("판넬");
        assertThat(quantitySyncRuleService.list(QuantitySyncEstimateCategory.HOME_MULTI))
                .extracting("ruleKey").contains("R31_VALID_ROLE");
    }

    @ParameterizedTest(name = "활성 규칙 target 역할 변경 차단: {1}")
    @MethodSource("catalogFamilies")
    void 활성_규칙만_있으면_다섯_실계열의_target_역할_변경이_차단된다(
            String familyKey, String familyName, String sourceCode, String targetCode) throws Exception {
        String ruleKey = "R31_ACTIVE_" + familyKey;
        createRule(ruleKey, true, sourceCode, targetCode);

        assertThatThrownBy(() -> productService.updateClassificationAndFixedDiscount(
                targetCode, new UpdateProductClassificationRequest(null, null, null)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining(ruleKey);
    }

    @ParameterizedTest(name = "비활성 규칙 역할 변경 허용: {1}")
    @MethodSource("catalogFamilies")
    void 비활성_규칙만_있으면_다섯_실계열의_target_역할_변경이_허용된다(
            String familyKey, String familyName, String sourceCode, String targetCode) throws Exception {
        String ruleKey = "R31_DISABLED_" + familyKey;
        createRule(ruleKey, false, sourceCode, targetCode);

        productService.updateGoodsTypeAndReturn(targetCode,
                new UpdateProductGoodsTypeRequest(ProductGoodsType.NON_GOODS));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT goods_type FROM products WHERE model_code = ?", String.class, targetCode))
                .isEqualTo("NON_GOODS");
    }

    @ParameterizedTest(name = "활성+비활성 혼합 역할 변경: {1}")
    @MethodSource("catalogFamilies")
    void 활성과_비활성_규칙이_섞여도_다섯_실계열은_활성_규칙을_기준으로_차단된다(
            String familyKey, String familyName, String sourceCode, String targetCode) throws Exception {
        createRule("R31_MIXED_ACTIVE_" + familyKey, true, sourceCode, targetCode);
        quantitySyncRuleService.create(
                request("R31_MIXED_DISABLED_" + familyKey, false, sourceCode, targetCode), "qa-r31");

        assertThatThrownBy(() -> productService.updateGoodsTypeAndReturn(targetCode,
                new UpdateProductGoodsTypeRequest(ProductGoodsType.NON_GOODS)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("R31_MIXED_ACTIVE_" + familyKey);
    }

    static Stream<Arguments> catalogFamilies() {
        return Stream.of(
                Arguments.of("HOSE", "호스", "AJ020BN1PBC1", "FH-LFHLN"),
                Arguments.of("PANEL", "판넬", "AJ020BN1PBC1", "PC1NWSK3NW"),
                Arguments.of("REMOTE", "리모컨", "AJ020BN1PBC1", "AWR-WE13N"),
                Arguments.of("BRANCH", "분기관", "AJ020BN1PBC1", "AXJ-YA1509N"),
                Arguments.of("FOOT", "발통", "AJ060MXHNBC1", "SI-AL600A"));
    }

    private void createRule(String ruleKey, boolean enabled, String sourceCode, String targetCode)
            throws Exception {
        product(sourceCode);
        product(targetCode);
        classifyTarget(targetCode);
        quantitySyncRuleService.create(request(ruleKey, enabled, sourceCode, targetCode), "qa-r31");
    }

    private void createValidRule(String ruleKey) throws Exception {
        createValidRule(ruleKey, true);
    }

    private void createValidRule(String ruleKey, boolean enabled) throws Exception {
        createRule(ruleKey, enabled, "AJ020BN1PBC1", "AXJ-YA1509N");
    }

    private QuantitySyncRuleRequest request(String ruleKey, boolean enabled) throws Exception {
        return request(ruleKey, enabled, "AJ020BN1PBC1", "AXJ-YA1509N");
    }

    private QuantitySyncRuleRequest request(String ruleKey, boolean enabled,
                                            String sourceCode, String targetCode) throws Exception {
        JsonNode condition = MAPPER.readTree("{}");
        return new QuantitySyncRuleRequest(ruleKey, QuantitySyncEstimateCategory.HOME_MULTI,
                "R31 역할 변경 규칙", enabled, "SUM", condition, QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.ADD, 10, "896-r31",
                List.of(new QuantitySyncRuleRequest.SourceRequest(
                        sourceCode, new BigDecimal("1"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest(
                        targetCode, new BigDecimal("1"), "NONE", 1)));
    }

    private void classifyTarget(String modelCode) {
        QuantitySyncRuleTestCatalog.classifyAsMaterial(productService, modelCode,
                QuantitySyncRuleTestCatalog.ensureMaterialClassification(
                        classificationService, EstimateCategory.HOME_MULTI));
    }

    private UUID ensureLClassification(String name) {
        return classificationService.list(EstimateCategory.HOME_MULTI, null).stream()
                .filter(row -> row.catLevel() == Classification.CatLevel.L)
                .filter(row -> name.equals(row.name()))
                .map(row -> row.id())
                .findFirst()
                .orElseGet(() -> classificationService.create(new CreateClassificationRequest(
                        EstimateCategory.HOME_MULTI, Classification.CatLevel.L, null,
                        name, null, true)).id());
    }

    private UUID product(String modelCode) {
        UUID categoryId = jdbcTemplate.queryForObject(
                "SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        UUID productId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO products (
                    id, name, model_name, category_id, selling_price, purchase_price,
                    created_at, created_by, is_deleted, status, model_code, product_type,
                    usage_scope)
                VALUES (?, ?, ?, ?, 0, 0, now(), ?, false, 'ACTIVE', ?, 'SINGLE', 'BOTH')
                """, productId, modelCode + " 품목", modelCode, categoryId, CREATED_BY, modelCode);
        jdbcTemplate.update("""
                INSERT INTO product_estimate_exposure (
                    id, product_id, estimate_category, display_order,
                    created_at, created_by, is_deleted)
                VALUES (?, ?, 'HOME_MULTI', 1, now(), ?, false)
                """, UUID.randomUUID(), productId, CREATED_BY);
        return productId;
    }

    private void cleanup() {
        runInTransaction(connection -> {
            execute(connection, """
                    DELETE FROM quantity_sync_source
                     WHERE rule_id IN (SELECT id FROM quantity_sync_rule WHERE rule_key LIKE 'R31_%')
                    """);
            execute(connection, """
                    DELETE FROM quantity_sync_target
                     WHERE rule_id IN (SELECT id FROM quantity_sync_rule WHERE rule_key LIKE 'R31_%')
                    """);
            execute(connection, "DELETE FROM quantity_sync_rule WHERE rule_key LIKE 'R31_%'");
        });
        jdbcTemplate.update("DELETE FROM product_estimate_exposure WHERE created_by = ?", CREATED_BY);
        jdbcTemplate.update("DELETE FROM products WHERE created_by = ?", CREATED_BY);
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

    private void execute(Connection connection, String sql) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.executeUpdate();
        }
    }

    @FunctionalInterface
    private interface SqlWork {
        void run(Connection connection) throws Exception;
    }
}
