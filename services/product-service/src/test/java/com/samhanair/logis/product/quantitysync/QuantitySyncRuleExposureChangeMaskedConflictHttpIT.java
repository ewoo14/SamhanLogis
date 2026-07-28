package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
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
import com.samhanair.logis.product.web.dto.UpdateProductRequest;
import com.samhanair.logis.product.web.dto.UpdateProductUsageRequest;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
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
 * 재수렴 R4 결함 A [HIGH] — 노출 카테고리 변경이 "위장 409".
 *
 * <p>usageScope 자체가 NONE으로 전이하지 않아도(즉 {@link ProductService#update}/
 * {@code updateUsageAndReturn}의 기존 "NONE 전이" 가드로는 잡히지 않아도), 품목이 활성
 * 수량 동기화 규칙의 category에서 노출이 빠지면(product_estimate_exposure soft-delete)
 * V24 {@code trg_qsr_exposure_validate_graph} deferred trigger가 커밋 시점에 위반을 던진다.
 * 이 예외는 {@link org.springframework.dao.DataIntegrityViolationException}으로 번역되고
 * {@code GlobalExceptionHandler.handleDataIntegrityViolation}이 원인을 "동시 편집 충돌 또는
 * 제약 위반"(409)으로 뭉갠다.
 *
 * <p>서로 다른 <b>세 진입점</b>(T4a: {@code PATCH /products/{id}}, T4b:
 * {@code PATCH /api/v1/products/{modelCode}/usage}, T7: {@code PATCH /products/{id}}
 * usageScope=PARTNER_ORDER)이 전부 같은 원인·같은 마스킹을 재현한다 — U-1이 요구하는
 * "경로별 가드 추가가 아니라 구조적 fix"를 검증하려면 셋 다 <b>같은 코드 변경</b>(fix는
 * {@code GlobalExceptionHandler}/{@code QuantitySyncViolationTranslator} 한 곳)으로
 * 동시에 GREEN이 되어야 한다.
 */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
class QuantitySyncRuleExposureChangeMaskedConflictHttpIT extends AbstractPostgresIT {

    private static final String LEGACY_REF = "896-r4-exposure";
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
    void setUp() {
        cleanup();
        Mockito.lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.anyString(), Mockito.any(PermissionAction.class)))
                .thenReturn(true);
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void T4a_PATCH_products_id로_노출카테고리_제거시_원인이_드러난다() throws Exception {
        String sourceCode = createProduct("R4EXP-T4A-SRC", List.of(EstimateCategory.HOME_MULTI, EstimateCategory.SINGLE_SET));
        String targetCode = createProduct("R4EXP-T4A-TGT", List.of(EstimateCategory.HOME_MULTI));
        createEnabledRule("R4EXP_T4A_RULE", sourceCode, targetCode);
        UUID sourceId = productId(sourceCode);

        // usageScope는 그대로 BOTH — estimateCategories에서 HOME_MULTI만 제거(SINGLE_SET만 남김).
        UpdateProductRequest req = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, List.of(EstimateCategory.SINGLE_SET), null);

        MvcResult result = mockMvc.perform(patch("/products/{id}", sourceId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(req)))
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        recordAndAssert("T4a", result.getResponse().getStatus(), body);
    }

    @Test
    void T4b_PATCH_usage로_categories에서_HOME_MULTI_제거시_원인이_드러난다() throws Exception {
        String sourceCode = createProduct("R4EXP-T4B-SRC", List.of(EstimateCategory.HOME_MULTI, EstimateCategory.SINGLE_SET));
        String targetCode = createProduct("R4EXP-T4B-TGT", List.of(EstimateCategory.HOME_MULTI));
        createEnabledRule("R4EXP_T4B_RULE", sourceCode, targetCode);

        UpdateProductUsageRequest req = new UpdateProductUsageRequest(
                UsageScope.BOTH, List.of(EstimateCategory.SINGLE_SET));

        MvcResult result = mockMvc.perform(patch("/api/v1/products/{modelCode}/usage", sourceCode)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(req)))
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        recordAndAssert("T4b", result.getResponse().getStatus(), body);
    }

    @Test
    void T7_PATCH_products_id_usageScope_PARTNER_ORDER로_전환시_원인이_드러난다() throws Exception {
        String sourceCode = createProduct("R4EXP-T7-SRC", List.of(EstimateCategory.HOME_MULTI));
        String targetCode = createProduct("R4EXP-T7-TGT", List.of(EstimateCategory.HOME_MULTI));
        createEnabledRule("R4EXP_T7_RULE", sourceCode, targetCode);
        UUID sourceId = productId(sourceCode);

        // usageScope=PARTNER_ORDER는 NONE이 아니므로 기존 "NONE 전이" 가드를 통과한다.
        // 그러나 isEstimateScope(PARTNER_ORDER)=false → syncEstimateExposures가 모든
        // 견적 노출을 soft-delete한다 — HOME_MULTI 노출도 함께 사라진다.
        UpdateProductRequest req = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                UsageScope.PARTNER_ORDER, null, null);

        MvcResult result = mockMvc.perform(patch("/products/{id}", sourceId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(req)))
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        recordAndAssert("T7", result.getResponse().getStatus(), body);
    }

    /**
     * fix 전/후 공용 assertion — RED 시점엔 이 메서드에서 실패해 원문을 남기고, GREEN
     * 시점엔 그대로 통과한다. 상태코드는 409(CONFLICT)를 유지하되(진짜 제약 위반이므로
     * U-4.3과 정합) 메시지가 "동시 편집 충돌"이 아니라 구체적 사유(카테고리 제약)를
     * 담아야 한다.
     *
     * <p>ruleKey는 이 메시지에 포함되지 않는다 — deferred trigger는 commit 시점(요청
     * 컨텍스트가 이미 사라진 뒤)에 실패하므로 번역기가 "어떤 규칙 때문인지"까지는 복원할
     * 수 없다({@link QuantitySyncViolationTranslator} 클래스 Javadoc "한계" 참조). "무엇이
     * 위반됐는지"(카테고리 제약)는 구체적으로 드러나는 것으로 U-1을 만족한다.
     */
    private void recordAndAssert(String label, int status, String body) {
        System.out.println("=== 결함 A " + label + " 응답 === status=" + status + " body=" + body);
        assertThat(status).isEqualTo(409);
        assertThat(body)
                .as(label + " 응답 본문이 원인을 드러내야 한다(마스킹 금지)")
                .doesNotContain("동시 편집 충돌 또는 제약 위반")
                .contains("수량 동기화 규칙이 참조하는 품목의 노출 카테고리가 바뀌어 규칙 제약을 벗어났습니다");
    }

    private String createProduct(String code, List<EstimateCategory> categories) throws Exception {
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        CreateProductRequest req = new CreateProductRequest(
                code + " 품목", code, categoryId, BigDecimal.ZERO, BigDecimal.ZERO,
                "KRW", null, null, null, ProductCategory.HOME_MULTI, null, null, null, null,
                null, null, null, UsageScope.BOTH, categories, null);
        mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(req)))
                .andExpect(status().isCreated());
        return code;
    }

    private void createEnabledRule(String ruleKey, String sourceCode, String targetCode) throws Exception {
        QuantitySyncRuleRequest req = new QuantitySyncRuleRequest(ruleKey, QuantitySyncEstimateCategory.HOME_MULTI,
                ruleKey + " 이름", true, "SUM", MAPPER.readTree("{}"), QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.ADD, 10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, new BigDecimal("1"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest(targetCode, new BigDecimal("1"), "NONE", 1)));
        mockMvc.perform(post("/api/v1/quantity-sync-rules")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(req)))
                .andExpect(status().isCreated());
    }

    private UUID productId(String code) {
        return jdbcTemplate.queryForObject(
                "SELECT id FROM products WHERE model_code = ? AND is_deleted = false", UUID.class, code);
    }

    private void cleanup() {
        // 세 DELETE를 한 transaction으로 묶는다 — 별도 auto-commit 문으로 나누면 그 사이
        // 순간에 deferred constraint trigger가 "rule must have active source and target
        // rows"로 오탐한다(다른 quantitysync IT와 동일 원인).
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
                DELETE FROM product_estimate_exposure
                 WHERE product_id IN (SELECT id FROM products WHERE model_code LIKE 'R4EXP-%')
                """);
        jdbcTemplate.update("DELETE FROM products WHERE model_code LIKE 'R4EXP-%'");
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
