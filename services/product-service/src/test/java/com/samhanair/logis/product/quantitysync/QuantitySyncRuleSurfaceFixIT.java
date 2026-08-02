package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.web.dto.CreateProductRequest;
import com.samhanair.logis.product.web.dto.ProductItemKind;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import com.samhanair.logis.product.web.dto.UpdateProductUsageRequest;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * PR #996 fix 라운드의 R-01·R-02·A-01 경계를 실 HTTP 경로로 고정한다.
 *
 * <p>품목과 규칙은 모두 POST API로 만들며, 수량 동기화 규칙은 주문 계산을 결정하지 않는
 * shadow-only 계약을 유지한다. 테스트 전용 데이터베이스에서만 쓰고 각 테스트 후 정리한다.
 */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
class QuantitySyncRuleSurfaceFixIT extends AbstractPostgresIT {

    private static final String LEGACY_REF = "896-r-rule-surface";
    private static final String MODEL_PREFIX = "896-R-SURFACE-";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private DataSource dataSource;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() throws Exception {
        cleanup();
        Mockito.lenient().when(dynamicPermissionClient.canView(ArgumentMatchers.anyString(), ArgumentMatchers.anyString()))
                .thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(ArgumentMatchers.anyString(), ArgumentMatchers.anyString()))
                .thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(UUID.class), ArgumentMatchers.anyString(),
                        ArgumentMatchers.any(PermissionAction.class)))
                .thenReturn(true);
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void R01_관리자_POST는_legacy_수량과_다른_S03을_저장하지_않는다() throws Exception {
        createProduct("896-R-SURFACE-R01-SOURCE");
        createProduct("896-R-SURFACE-R01-TARGET");

        MvcResult result = mockMvc.perform(post("/api/v1/quantity-sync-rules")
                        .with(asMasterUser())
                        .header("X-User-Role", "MASTER")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(ruleRequest(
                                "SINGLE_S03_CEILING_DRAIN_PUMP",
                                "896-R-SURFACE-R01-SOURCE",
                                "896-R-SURFACE-R01-TARGET",
                                new BigDecimal("0.28"),
                                new BigDecimal("25")))))
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(body).contains("legacy");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM quantity_sync_rule WHERE legacy_ref = ? AND is_deleted = false",
                Integer.class, LEGACY_REF)).isZero();
    }

    @Test
    void R02_관리자_POST로_만든_유효한_enabled_S03도_품목_노출_PATCH를_차단하지_않는다() throws Exception {
        createProduct("896-R-SURFACE-R02-SOURCE");
        createProduct("896-R-SURFACE-R02-TARGET");
        createRule("896-R-SURFACE-R02-SOURCE", "896-R-SURFACE-R02-TARGET",
                BigDecimal.ONE, BigDecimal.ONE);

        MvcResult result = mockMvc.perform(patch("/api/v1/products/{modelCode}/usage",
                        "896-R-SURFACE-R02-SOURCE")
                        .with(asMasterUser())
                        .header("X-User-Role", "MASTER")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(
                                new UpdateProductUsageRequest(UsageScope.BOTH, List.of()))))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain("수량 동기화 규칙이 이 품목을 참조하고 있어 상태를 변경할 수 없습니다");
    }

    @Test
    void A01_PARTNER는_관측용_S03만_받고_범위없는_전역_규칙은_받지_않는다() throws Exception {
        createProduct("896-R-SURFACE-A01-SOURCE");
        createProduct("896-R-SURFACE-A01-TARGET");
        createRuleWithKey("GENERIC_A01_RULE", "896-R-SURFACE-A01-SOURCE",
                "896-R-SURFACE-A01-TARGET", BigDecimal.ONE, BigDecimal.ONE);
        createProduct("896-R-SURFACE-A01-S03-SOURCE");
        createProduct("896-R-SURFACE-A01-S03-TARGET");
        createRule("896-R-SURFACE-A01-S03-SOURCE", "896-R-SURFACE-A01-S03-TARGET",
                BigDecimal.ONE, BigDecimal.ONE);

        MvcResult adminResult = mockMvc.perform(get("/api/v1/quantity-sync-rules")
                        .param("estimateCategory", "SINGLE_SET")
                        .with(asMasterUser())
                        .header("X-User-Role", "MASTER")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andReturn();
        assertThat(adminResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(adminResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("GENERIC_A01_RULE");

        MvcResult result = mockMvc.perform(get("/api/v1/quantity-sync-rules")
                        .param("estimateCategory", "SINGLE_SET")
                        .with(user("partner-user").roles("PARTNER"))
                        .header("X-Is-Partner", "true")
                        .header("X-Partner-Code", "QA-PARTNER"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("SINGLE_S03_CEILING_DRAIN_PUMP")
                .doesNotContain("896-R-SURFACE-A01-SOURCE");
    }

    @Test
    void A03_legacyRef만_S03인_일반_규칙은_품목_무결성_검사를_비껴가지_않는다() throws Exception {
        createProduct("896-R-SURFACE-A03-SOURCE");
        createProduct("896-R-SURFACE-A03-TARGET");
        createRuleWithKey("GENERIC_S03_REF_BYPASS", "896-R-SURFACE-A03-SOURCE",
                "896-R-SURFACE-A03-TARGET", BigDecimal.ONE, BigDecimal.ONE);

        MvcResult result = mockMvc.perform(patch("/api/v1/products/{modelCode}/usage",
                        "896-R-SURFACE-A03-SOURCE")
                        .with(asMasterUser())
                        .header("X-User-Role", "MASTER")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(
                                new UpdateProductUsageRequest(UsageScope.NONE, List.of()))))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("GENERIC_S03_REF_BYPASS");
    }

    private void createProduct(String code) throws Exception {
        UUID categoryId = jdbcTemplate.queryForObject(
                "SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        CreateProductRequest request = new CreateProductRequest(
                code + " 품목", code, categoryId, BigDecimal.ZERO, BigDecimal.ZERO, "KRW",
                null, null, ProductItemKind.GENERAL, ProductCategory.SINGLE_SET, null,
                null, null, null, BigDecimal.ZERO, BigDecimal.ZERO, null,
                UsageScope.BOTH, List.of(EstimateCategory.SINGLE_SET), null);

                mockMvc.perform(post("/products")
                        .with(asMasterUser())
                        .header("X-User-Role", "MASTER")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(request)))
                .andExpect(status().isCreated());
    }

    private void createRule(String sourceCode, String targetCode,
                            BigDecimal factor, BigDecimal multiplier) throws Exception {
        createRuleWithKey("SINGLE_S03_CEILING_DRAIN_PUMP", sourceCode, targetCode, factor, multiplier);
    }

    private void createRuleWithKey(String ruleKey, String sourceCode, String targetCode,
                                   BigDecimal factor, BigDecimal multiplier) throws Exception {
                mockMvc.perform(post("/api/v1/quantity-sync-rules")
                        .with(asMasterUser())
                        .header("X-User-Role", "MASTER")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(ruleRequest(
                                ruleKey, sourceCode, targetCode,
                                factor, multiplier))))
                .andExpect(status().isCreated());
    }

    private QuantitySyncRuleRequest ruleRequest(String ruleKey, String sourceCode, String targetCode,
                                                BigDecimal factor, BigDecimal multiplier) {
        return new QuantitySyncRuleRequest(
                ruleKey, QuantitySyncEstimateCategory.SINGLE_SET, "S-03 shadow 규칙", true,
                "SUM", MAPPER.createObjectNode(), QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.ADD, 10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, factor)),
                List.of(new QuantitySyncRuleRequest.TargetRequest(targetCode, multiplier, "NONE", 1)));
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor asMasterUser() {
        return user("master-user").roles("MASTER");
    }

    private void cleanup() {
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
        jdbcTemplate.update("DELETE FROM product_estimate_exposure WHERE product_id IN "
                + "(SELECT id FROM products WHERE model_code LIKE ?)", MODEL_PREFIX + "%");
        jdbcTemplate.update("DELETE FROM products WHERE model_code LIKE ?", MODEL_PREFIX + "%");
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
