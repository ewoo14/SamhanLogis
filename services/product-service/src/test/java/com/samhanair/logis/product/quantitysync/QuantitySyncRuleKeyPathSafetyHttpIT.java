package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

/**
 * 재수렴(PR #958 R2) 결함 3 [MED~HIGH] — {@code ruleKey}에 '/'가 들어가면 API로 만든 규칙을
 * API로 다시 조회/삭제할 수 없게 되는(영구 고아) 문제를 실 HTTP 왕복(MockMvc 전체 서블릿
 * dispatch)으로 검증한다.
 *
 * <p>{@code ruleKey}는 {@code QuantitySyncRuleController}의 GET/PUT/DELETE에서 그대로 URL
 * 경로 세그먼트로 쓰인다(:49,65,74). '/'가 원문으로 들어가면 Spring이 경로를 분할해 다른
 * 리소스로 오인하고, 퍼센트 인코딩(%2F)은 Tomcat이 400 HTML로 거부한다 — 어느 쪽으로도
 * 그 규칙을 다시 가리킬 수 없다. fix는 <b>생성 시점 차단</b>(Bean Validation
 * {@code @Pattern} + DB CHECK backstop)이므로, 이 IT는 "애초에 orphan이 생기지 않는지"를
 * 검증한다 — 생성이 막히면 이후 조회/삭제 라우팅 문제 자체가 발생할 수 없다.
 */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
class QuantitySyncRuleKeyPathSafetyHttpIT extends AbstractPostgresIT {

    private static final String CREATED_BY = "896-S2-KEYSAFE";
    private static final String LEGACY_REF = "896-keysafe";
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
        product("KEYSAFE-SRC-A");
        product("KEYSAFE-TGT-B");
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void ruleKey에_슬래시가_있으면_생성_자체가_거부되어_영구_고아가_생기지_않는다() throws Exception {
        mockMvc.perform(post("/api/v1/quantity-sync-rules")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson("KEYSAFE/ORPHAN", "KEYSAFE-SRC-A", "KEYSAFE-TGT-B")))
                .andExpect(status().isBadRequest());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM quantity_sync_rule WHERE rule_key = ?", Integer.class, "KEYSAFE/ORPHAN"))
                .isZero();
    }

    @Test
    void 기존_시드_문서_키_형식과_DbProbeIT의_하이픈_키_형식은_여전히_허용된다() throws Exception {
        // 회귀 방지 lock — 정본 §6.2 예시(HOME_HOSE_1WAY_L: 대문자+숫자+밑줄)와 기존
        // QuantitySyncRuleDbProbeIT의 하이픈 키(DB-SELFSWAP 계열) 양쪽 다 막히면 안 된다(S-5).
        mockMvc.perform(post("/api/v1/quantity-sync-rules")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ruleJson("HOME_HOSE_1WAY_L", "KEYSAFE-SRC-A", "KEYSAFE-TGT-B")))
                .andExpect(status().isCreated());
    }

    @Test
    void DB_직접_SQL로_만들어도_슬래시가_있는_rule_key는_CHECK_제약이_거부한다() throws Exception {
        // S-5 backstop — Java Bean Validation을 우회하는 경로(raw SQL)도 V24
        // chk_qsr_rule_key_path_safe CHECK 제약이 막아야 한다(Java·DB 어느 경로로도
        // 위반된 값이 들어오지 않아야 결함 3이 재발하지 않는다).
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(true);
            try (PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO quantity_sync_rule (
                        id, rule_key, estimate_category, name, enabled, aggregation, condition_json,
                        inactive_behavior, conflict_policy, priority, legacy_ref,
                        created_at, created_by, is_deleted)
                    VALUES (?, ?, 'HOME_MULTI', ?, true, 'SUM', '{}'::jsonb, 'ZERO', 'ADD', 10, ?, now(), ?, false)
                    """)) {
                statement.setObject(1, UUID.randomUUID());
                statement.setString(2, "KEYSAFE/DB/ORPHAN");
                statement.setString(3, "이름");
                statement.setString(4, LEGACY_REF);
                statement.setString(5, CREATED_BY);
                // 메시지에 제약 이름을 명시적으로 요구한다 — 그렇지 않으면 이 rule에
                // source/target 행이 없어서 나는 무관한 deferred trigger 예외("rule must
                // have active source and target rows")와 뒤섞여 어느 쪽이 막았는지 알 수 없다.
                assertThatThrownBy(statement::executeUpdate)
                        .isInstanceOf(SQLException.class)
                        .hasMessageContaining("chk_qsr_rule_key_path_safe");
            }
        }
    }

    private String ruleJson(String ruleKey, String sourceCode, String targetCode) throws Exception {
        classifyQuantitySyncTarget(targetCode);
        JsonNode condition = MAPPER.readTree("{}");
        QuantitySyncRuleRequest request = new QuantitySyncRuleRequest(ruleKey,
                QuantitySyncEstimateCategory.HOME_MULTI, "키 안전성 테스트", true, "SUM", condition,
                QuantitySyncInactiveBehavior.ZERO, QuantitySyncConflictPolicy.ADD, 10, LEGACY_REF,
                java.util.List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, new BigDecimal("1"))),
                java.util.List.of(new QuantitySyncRuleRequest.TargetRequest(
                        targetCode, new BigDecimal("1"), "NONE", 1)));
        return MAPPER.writeValueAsString(request);
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
        jdbcTemplate.update("""
                INSERT INTO product_estimate_exposure (
                    id, product_id, estimate_category, display_order,
                    created_at, created_by, is_deleted)
                VALUES (?, ?, 'HOME_MULTI', 1, now(), ?, false)
                """, UUID.randomUUID(), productId, CREATED_BY);
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
