package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
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
 * 재수렴 R4 결함 B [MED] — jsonb 와 Jackson 의 수치 동등성이 달라 REPLACE 중복이 위장 409.
 *
 * <p>{@link QuantitySyncRuleValidator#validate}(:246)의 REPLACE 중복 사전 검사가
 * {@code JsonNode.equals()}를 쓰는데, Jackson 은 {@code IntNode(1)}과 {@code DoubleNode(1.0)}을
 * 다른 노드로 본다({@code isNumber()}는 같아도 구현 타입이 다르면 {@code equals}가 false).
 * 반면 V24:307 DB 트리거의 {@code r1.condition_json = r2.condition_json}(jsonb {@code =})는
 * 숫자를 {@code numeric}으로 비교해 {@code 1}과 {@code 1.0}을 같다고 본다. 그 결과:
 * <ul>
 *   <li>T26 — {@code {"optionEquals":["k",1]}}로 REPLACE 규칙 생성 → 201</li>
 *   <li>T27 — 같은 category/target, {@code {"optionEquals":["k",1.0]}}로 두 번째 REPLACE
 *       생성 → Java 사전 검사는 "다르다"고 통과시키지만 DB 트리거가 "같다"고 거부해
 *       409 "동시 편집 충돌 또는 제약 위반"(마스킹)</li>
 *   <li>대조 — 완전히 같은 {@code {"optionEquals":["k",1]}}로 다시 생성하면 Java 사전 검사가
 *       바로 잡아 400 "동일 condition의 REPLACE target이 중복됩니다."(fix 전에도 이미 통과하던
 *       기존 동작 — U-4.4 회귀 방지 lock 겸용)</li>
 * </ul>
 *
 * <p>U-2 — 표기만 다른 동일 condition(1 vs 1.0)에 대해 Java 층과 DB 층의 판정이 갈리면 안
 * 된다. fix 후에는 T27도 T26의 정확한 재현(같은 condition)과 동일하게 400 + 같은 메시지를
 * 받아야 한다(상태 코드까지 일치 — 409 유지가 아니라 400으로 바뀜에 유의, 결함 A 의 "409지만
 * 메시지만 명확해짐"과는 다른 종류의 fix).
 */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
class QuantitySyncRuleReplaceDuplicateJsonbNumericEqualityHttpIT extends AbstractPostgresIT {

    private static final String LEGACY_REF = "896-r4-jsonbeq";
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
        Mockito.lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.anyString(), Mockito.any(PermissionAction.class)))
                .thenReturn(true);
        createProduct("R4JEQ-SRC1");
        createProduct("R4JEQ-SRC2");
        createProduct("R4JEQ-SRC3");
        createProduct("R4JEQ-TGT");
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void T26_T27_숫자표기만_다른_condition의_REPLACE_중복도_400으로_원인이_드러난다() throws Exception {
        // T26 — 최초 REPLACE 등록, condition 정수 1 → 201
        mockMvc.perform(post("/api/v1/quantity-sync-rules")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson("R4JEQ_RULE_INT", "R4JEQ-SRC1", "{\"optionEquals\":[\"k\",1]}")))
                .andExpect(status().isCreated());

        // T27 — 같은 category/target, condition 소수 1.0(수치는 같음) → fix 전 409(마스킹),
        // fix 후 400(동일 condition REPLACE 중복, T26과 완전히 같은 메시지).
        MvcResult t27 = mockMvc.perform(post("/api/v1/quantity-sync-rules")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson("R4JEQ_RULE_DOUBLE", "R4JEQ-SRC2", "{\"optionEquals\":[\"k\",1.0]}")))
                .andReturn();
        String t27Body = t27.getResponse().getContentAsString(StandardCharsets.UTF_8);
        System.out.println("=== 결함 B T27 응답 === status=" + t27.getResponse().getStatus() + " body=" + t27Body);

        assertThat(t27.getResponse().getStatus())
                .as("T27: 1 vs 1.0은 jsonb 상 같은 값이므로 대조군(T26 재현)과 같은 400을 받아야 한다")
                .isEqualTo(400);
        assertThat(t27Body)
                .doesNotContain("동시 편집 충돌 또는 제약 위반")
                .contains("동일 condition의 REPLACE target이 중복됩니다.");

        // 대조 — 완전히 같은 condition(정수 1)으로 다시 시도하면 이미(fix 전부터) 400이었다.
        // U-4.4 회귀 방지 lock: fix가 이 기존 동작을 건드리지 않았는지 같은 테스트에서 확인한다.
        MvcResult control = mockMvc.perform(post("/api/v1/quantity-sync-rules")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson("R4JEQ_RULE_CONTROL", "R4JEQ-SRC3", "{\"optionEquals\":[\"k\",1]}")))
                .andReturn();
        String controlBody = control.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(control.getResponse().getStatus()).isEqualTo(400);
        assertThat(controlBody).contains("동일 condition의 REPLACE target이 중복됩니다.");
    }

    private String ruleJson(String ruleKey, String sourceCode, String conditionRaw) throws Exception {
        QuantitySyncRuleRequest request = new QuantitySyncRuleRequest(ruleKey, QuantitySyncEstimateCategory.HOME_MULTI,
                ruleKey + " 이름", true, "SUM", MAPPER.readTree(conditionRaw), QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.REPLACE, 10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, new BigDecimal("1"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest("R4JEQ-TGT", new BigDecimal("1"), "NONE", 1)));
        return MAPPER.writeValueAsString(request);
    }

    private void createProduct(String code) throws Exception {
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        CreateProductRequest req = new CreateProductRequest(
                code + " 품목", code, categoryId, BigDecimal.ZERO, BigDecimal.ZERO,
                "KRW", null, null, null, ProductCategory.HOME_MULTI, null, null, null, null,
                null, null, null, UsageScope.BOTH, List.of(EstimateCategory.HOME_MULTI), null);
        mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(req)))
                .andExpect(status().isCreated());
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
        jdbcTemplate.update("""
                DELETE FROM product_estimate_exposure
                 WHERE product_id IN (SELECT id FROM products WHERE model_code LIKE 'R4JEQ-%')
                """);
        jdbcTemplate.update("DELETE FROM products WHERE model_code LIKE 'R4JEQ-%'");
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
