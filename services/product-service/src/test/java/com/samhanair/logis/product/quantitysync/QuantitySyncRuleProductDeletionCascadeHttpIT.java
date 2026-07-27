package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
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
 * 재수렴 결함 2 [최우선] — enabled=false 규칙이 참조하는 Product 삭제가 허용된(R1 fix) 뒤,
 * 그 규칙과 무관한 다른 규칙의 목록·조회·생성·수정까지 전부 404로 벽돌이 되는지를
 * 실 HTTP 왕복(MockMvc 전체 서블릿 dispatch)으로 재현한다.
 *
 * <p>PR #958 재수렴 라운드 원문 재현 순서를 그대로 따른다:
 * <ol>
 *   <li>비활성 규칙 생성 (C→D 참조) — HTTP 201</li>
 *   <li>DELETE product D — HTTP 204 (enabled 게이트로 이제 허용, R1 fix 자체는 결함이 아님)</li>
 *   <li>GET 목록 — fix 전 404, fix 후 200(무관한 규칙 + 깨진 규칙의 placeholder)</li>
 *   <li>GET 무관한 단건 — 항상 200(회귀 방지 lock)</li>
 *   <li>POST 완전히 무관한 새 규칙 — fix 전 404, fix 후 201</li>
 *   <li>PUT 무관한 기존 규칙 편집 — fix 전 404, fix 후 200</li>
 *   <li>GET 깨진 규칙 자신 — fix 전 404, fix 후 200 + "(삭제된 품목)" placeholder(M-2 자가복구 가시성)</li>
 *   <li>DELETE 깨진 규칙 — 항상 204(자가복구 경로), 이후 목록에서 placeholder 소멸</li>
 * </ol>
 */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
class QuantitySyncRuleProductDeletionCascadeHttpIT extends AbstractPostgresIT {

    private static final String CREATED_BY = "896-S2-CASCADE";
    private static final String LEGACY_REF = "896-cascade";
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
        product("R2QA-SRC-C");
        product("R2QA-DEL-D");
        product("R2QA-UNREL-A");
        product("R2QA-UNREL-B");
        product("R2QA-NEW-E");
        product("R2QA-NEW-F");
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void 비활성_규칙의_품목_삭제가_무관한_규칙_전체를_벽돌로_만들지_않는다() throws Exception {
        UUID deletedProductId = productId("R2QA-DEL-D");

        // 1) 비활성 규칙 생성 (C→D 참조) — HTTP 201
        mockMvc.perform(post("/api/v1/quantity-sync-rules")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson("R2QA_BROKEN", false, "R2QA-SRC-C", "R2QA-DEL-D", 10)))
                .andExpect(status().isCreated());

        // 무관한 규칙을 먼저 만들어 둔다 (GET 단건/PUT 편집 대상).
        mockMvc.perform(post("/api/v1/quantity-sync-rules")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson("R2QA_UNRELATED", true, "R2QA-UNREL-A", "R2QA-UNREL-B", 20)))
                .andExpect(status().isCreated());

        // 2) DELETE product D — HTTP 204 (enabled 게이트로 이제 허용)
        // X-User-Id는 HeaderAuthenticationFilter가 UUID로 해석하므로 반드시 유효한 UUID 문자열이어야
        // 한다 — 처음 CREATED_BY(비-UUID 문자열)를 넣었더니 인증 자체가 실패해 403이 났다(자체 버그).
        mockMvc.perform(delete("/products/{id}", deletedProductId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isNoContent());

        // 3) GET 목록 — fix 전 404, fix 후 200
        // getContentAsString()은 인자 없이 쓰면 charset이 깨진다(feedback_mockmvc_getcontentasstring_charset.md) —
        // andReturn() 후 UTF_8을 명시해 한글 비교를 안전하게 한다.
        MvcResult listResult = mockMvc.perform(get("/api/v1/quantity-sync-rules")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn();
        String listBody = listResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(listBody)
                .contains("R2QA_UNRELATED")
                .contains("R2QA_BROKEN")
                .contains("삭제된 품목");

        // 4) GET 무관한 단건 — 항상 200 (회귀 방지 lock)
        mockMvc.perform(get("/api/v1/quantity-sync-rules/{ruleKey}", "R2QA_UNRELATED")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk());

        // 5) POST 완전히 무관한 새 규칙 — fix 전 404, fix 후 201
        mockMvc.perform(post("/api/v1/quantity-sync-rules")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson("R2QA_NEW", true, "R2QA-NEW-E", "R2QA-NEW-F", 30)))
                .andExpect(status().isCreated());

        // 6) PUT 무관한 기존 규칙 편집 — fix 전 404, fix 후 200
        mockMvc.perform(put("/api/v1/quantity-sync-rules/{ruleKey}", "R2QA_UNRELATED")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson("R2QA_UNRELATED", true, "R2QA-UNREL-A", "R2QA-UNREL-B", 99)))
                .andExpect(status().isOk());

        // 7) GET 깨진 규칙 자신 — fix 전 404, fix 후 200 + placeholder (M-2 자가복구 가시성)
        MvcResult brokenResult = mockMvc.perform(get("/api/v1/quantity-sync-rules/{ruleKey}", "R2QA_BROKEN")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(brokenResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("삭제된 품목");

        // 8) DELETE 깨진 규칙 — 자가복구 경로, 이후 목록에서 placeholder 소멸
        mockMvc.perform(delete("/api/v1/quantity-sync-rules/{ruleKey}", "R2QA_BROKEN")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isNoContent());
        MvcResult afterDeleteResult = mockMvc.perform(get("/api/v1/quantity-sync-rules")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(afterDeleteResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("R2QA_UNRELATED")
                .doesNotContain("R2QA_BROKEN");
    }

    private String ruleJson(String ruleKey, boolean enabled, String sourceCode, String targetCode,
                            int priority) throws Exception {
        JsonNode condition = MAPPER.readTree("{}");
        QuantitySyncRuleRequest request = new QuantitySyncRuleRequest(ruleKey,
                QuantitySyncEstimateCategory.HOME_MULTI, ruleKey + " 이름", enabled, "SUM", condition,
                QuantitySyncInactiveBehavior.ZERO, QuantitySyncConflictPolicy.ADD, priority, LEGACY_REF,
                java.util.List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, new BigDecimal("1"))),
                java.util.List.of(new QuantitySyncRuleRequest.TargetRequest(
                        targetCode, new BigDecimal("1"), "NONE", 1)));
        return MAPPER.writeValueAsString(request);
    }

    private UUID productId(String code) {
        return jdbcTemplate.queryForObject(
                "SELECT id FROM products WHERE model_code = ? AND is_deleted = false", UUID.class, code);
    }

    private void product(String code) {
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        UUID productId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO products (
                    id, name, model_name, category_id, selling_price, purchase_price,
                    created_at, created_by, is_deleted, status, model_code, product_type,
                    usage_scope)
                VALUES (?, ?, ?, ?, 0, 0, now(), ?, false, 'ACTIVE', ?, 'SINGLE', 'BOTH')
                """, productId, code + " 품목", code, categoryId, CREATED_BY, code);
        // 재수렴 결함 1 [최우선] S-2 fix — products.estimate_category(V18 이후 죽은 컬럼)
        // 대신 실 API가 만드는 것과 동일하게 product_estimate_exposure에 노출 행을 심는다.
        jdbcTemplate.update("""
                INSERT INTO product_estimate_exposure (
                    id, product_id, estimate_category, display_order,
                    created_at, created_by, is_deleted)
                VALUES (?, ?, 'HOME_MULTI', 1, now(), ?, false)
                """, UUID.randomUUID(), productId, CREATED_BY);
    }

    private void cleanup() {
        // 세 DELETE를 한 transaction으로 묶는다 — 별도 auto-commit 문으로 나누면 그 사이
        // 순간에 deferred constraint trigger가 "rule must have active source and target
        // rows"로 오탐한다(기존 quantitysync IT들과 동일 원인).
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
        // product_estimate_exposure가 products FK를 참조하므로 products보다 먼저 지운다.
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
