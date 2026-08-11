package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.QuantitySyncRuleService;
import com.samhanair.logis.product.web.dto.CreateProductRequest;
import com.samhanair.logis.product.web.dto.ProductResponse;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleResponse;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 재수렴(PR #958 R2) 결함 1 [최우선] — 실 API({@link ProductService#create})로 만든 품목이
 * 수량 동기화 규칙에 연결되는지를 실 Postgres로 검증한다.
 *
 * <p>fix 전에는 카테고리 판정이 {@code products.estimate_category}(V18 이후 죽은 컬럼,
 * V18__add_product_estimate_exposure.sql:2-3)를 읽어, 실 API로 만든 어떤 품목도(그 컬럼이
 * 항상 NULL이므로) 규칙에 연결할 수 없었다. 기존 quantitysync IT 5개가 전부 raw SQL로
 * {@code products.estimate_category}를 직접 채우는 fixture를 썼기 때문에(S-2) 이 결함을
 * 잡지 못했다 — 이 IT는 반드시 {@link ProductService#create}를 통해 품목을 만들어야
 * 의미가 있다(raw SQL로 만들면 재현되지 않는다).
 *
 * <p>S-3 — 품목은 {@code product_estimate_exposure} M:N으로 여러 카테고리에 동시 노출될 수
 * 있다. "이 품목의 category" 단일값이 아니라 "이 카테고리에 노출되어 있는가" 멤버십으로
 * 판정한다(세 번째 테스트).
 */
@SpringBootTest(classes = ProductServiceApplication.class)
class QuantitySyncRuleCategoryFromExposureIT extends AbstractPostgresIT {

    private static final String LEGACY_REF = "896-catexp";
    private static final String MODEL_CODE_PREFIX = "QSFX-";
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

    @Test
    void 실_API로_생성한_품목은_products_estimate_category가_NULL이지만_규칙에_연결된다() throws Exception {
        String sourceCode = createProduct("QSFX-SRC-A", List.of(EstimateCategory.HOME_MULTI));
        String targetCode = createProduct("QSFX-TGT-B", List.of(EstimateCategory.HOME_MULTI));
        classifyQuantitySyncTarget(targetCode);
        // 회귀 방지 lock — 죽은 컬럼이 실제로 NULL임을 먼저 확인한다(보고서 실측과 동일).
        assertThat(estimateCategoryColumn(sourceCode)).isNull();
        assertThat(estimateCategoryColumn(targetCode)).isNull();

        QuantitySyncRuleResponse created = quantitySyncRuleService.create(
                request(QuantitySyncEstimateCategory.HOME_MULTI, "QSFX_RULE_BASIC", sourceCode, targetCode),
                "qa-qsfx");

        assertThat(created.ruleKey()).isEqualTo("QSFX_RULE_BASIC");
        assertThat(created.sources()).singleElement().extracting("productCode").isEqualTo(sourceCode);
        assertThat(created.targets()).singleElement().extracting("productCode").isEqualTo(targetCode);
    }

    @Test
    void 노출되지_않은_카테고리로는_실_API_품목도_연결할_수_없다() throws Exception {
        // 회귀 방지 lock — §6.5 "같은 category 안에서만 연결"의 핵심(교차 카테고리 거부)은
        // 판정 원천이 바뀌어도 유지되어야 한다.
        String sourceCode = createProduct("QSFX-SRC-C", List.of(EstimateCategory.HOME_MULTI));
        String targetCode = createProduct("QSFX-TGT-D", List.of(EstimateCategory.SINGLE_SET));
        classifyQuantitySyncTarget(targetCode, EstimateCategory.SINGLE_SET);

        assertThatThrownBy(() -> quantitySyncRuleService.create(
                request(QuantitySyncEstimateCategory.HOME_MULTI, "QSFX_RULE_MISMATCH", sourceCode, targetCode),
                "qa-qsfx"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("category");
    }

    @Test
    void 품목이_여러_카테고리에_동시_노출되면_그중_규칙_category와_일치하는_쪽으로_연결된다() throws Exception {
        // S-3 — M:N: 실 API로 HOME_MULTI·SINGLE_SET 양쪽에 동시 노출된 품목을 만든다
        // (estimateCategories에 두 값을 담아 POST하는 실 사용 시나리오와 동일).
        String multiCode = createProduct("QSFX-MULTI-E",
                List.of(EstimateCategory.HOME_MULTI, EstimateCategory.SINGLE_SET));
        String homeTargetCode = createProduct("QSFX-TGT-F", List.of(EstimateCategory.HOME_MULTI));
        String singleTargetCode = createProduct("QSFX-TGT-G", List.of(EstimateCategory.SINGLE_SET));
        classifyQuantitySyncTarget(homeTargetCode);
        classifyQuantitySyncTarget(singleTargetCode, EstimateCategory.SINGLE_SET);

        QuantitySyncRuleResponse homeRule = quantitySyncRuleService.create(
                request(QuantitySyncEstimateCategory.HOME_MULTI, "QSFX_RULE_HOME", multiCode, homeTargetCode),
                "qa-qsfx");
        QuantitySyncRuleResponse singleRule = quantitySyncRuleService.create(
                request(QuantitySyncEstimateCategory.SINGLE_SET, "QSFX_RULE_SINGLE", multiCode, singleTargetCode),
                "qa-qsfx");

        assertThat(homeRule.sources()).singleElement().extracting("productCode").isEqualTo(multiCode);
        assertThat(singleRule.sources()).singleElement().extracting("productCode").isEqualTo(multiCode);
    }

    /** {@link ProductService#create}로 품목을 만들고 실 API가 반환하는 modelCode를 돌려준다. */
    private String createProduct(String code, List<EstimateCategory> categories) {
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        CreateProductRequest req = new CreateProductRequest(
                code + " 품목", code, categoryId, BigDecimal.ZERO, BigDecimal.ZERO,
                "KRW", null, null, null, null, null, null, null, null, null, null, null,
                UsageScope.BOTH, categories, null);
        ProductResponse created = productService.create(req);
        return created.modelCode();
    }

    private String estimateCategoryColumn(String modelCode) {
        return jdbcTemplate.queryForObject(
                "SELECT estimate_category FROM products WHERE model_code = ?", String.class, modelCode);
    }

    private QuantitySyncRuleRequest request(QuantitySyncEstimateCategory category, String ruleKey,
                                            String sourceCode, String targetCode) throws Exception {
        JsonNode condition = MAPPER.readTree("{}");
        return new QuantitySyncRuleRequest(ruleKey, category, ruleKey + " 이름", true, "SUM", condition,
                QuantitySyncInactiveBehavior.ZERO, QuantitySyncConflictPolicy.ADD, 10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, new BigDecimal("1"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest(targetCode, new BigDecimal("1"), "NONE", 1)));
    }

    private void cleanup() {
        // source/target/rule 하드 삭제를 별도 auto-commit 문으로 나누면 그 사이 순간에
        // deferred constraint trigger가 오탐한다 — 세 DELETE를 한 transaction으로 묶는다
        // (다른 quantitysync IT와 동일 원인).
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
        // ProductService.create()를 컨트롤러 없이 직접 호출하면 인증 컨텍스트가 없어
        // JpaAuditingConfig의 AuditorAware가 created_by를 "system"으로 채운다 — 다른 테스트와
        // 공유되는 값이라 스코프로 쓸 수 없다. 이 테스트 전용 model_code 접두사로 좁힌다.
        jdbcTemplate.update("""
                DELETE FROM product_estimate_exposure
                 WHERE product_id IN (SELECT id FROM products WHERE model_code LIKE ?)
                """, MODEL_CODE_PREFIX + "%");
        jdbcTemplate.update("DELETE FROM products WHERE model_code LIKE ?", MODEL_CODE_PREFIX + "%");
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
