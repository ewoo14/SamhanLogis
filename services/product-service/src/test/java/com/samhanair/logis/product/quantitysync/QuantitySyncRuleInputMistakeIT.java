package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.service.QuantitySyncRuleService;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
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
 * 재수렴(PR #958 R2) 결함 2 [MED] — 평범한 입력 실수 4종(A~D)이 전부 위장 409로 뭉개지던
 * 것을 실 {@link QuantitySyncRuleService} + 실 Postgres로 검증한다.
 *
 * <p>fix 전에는 A(ruleKey 중복)·B(source productCode 중복)·C(target displayOrder 중복)·
 * D(target productCode 중복) 넷 다 검증 없이 DB 부분 unique index까지 도달해
 * {@link org.springframework.dao.DataIntegrityViolationException}로 실패했다. 이 예외는
 * {@code GlobalExceptionHandler}가 HTTP 계층에서만 CONFLICT(409, "동시 편집 충돌 또는
 * 제약 위반")로 매핑하므로, 서비스를 직접 호출하는 이 IT에서는 fix 전 raw
 * {@code DataIntegrityViolationException}이 그대로 전파된다 — fix 후에는 4종 모두 저장
 * 전에 {@link BusinessException}으로 걸러지고 원인별 메시지를 갖는다.
 */
@SpringBootTest(classes = ProductServiceApplication.class)
class QuantitySyncRuleInputMistakeIT extends AbstractPostgresIT {

    private static final String CREATED_BY = "896-S2-MISTAKE";
    private static final String LEGACY_REF = "896-mistake";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private QuantitySyncRuleService service;

    @BeforeEach
    void setUp() {
        cleanup();
        product("MISTAKE-SRC-A");
        product("MISTAKE-TGT-B");
        product("MISTAKE-TGT-C");
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void A_이미_존재하는_ruleKey로_생성하면_원인이_분명한_409를_받는다() throws Exception {
        service.create(request("MISTAKE_RULE_DUP", "MISTAKE-SRC-A", "MISTAKE-TGT-B"), "qa-mistake");

        assertThatThrownBy(() -> service.create(
                request("MISTAKE_RULE_DUP", "MISTAKE-SRC-A", "MISTAKE-TGT-C"), "qa-mistake"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 존재하는 규칙 키입니다")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.CONFLICT);
        assertThat(activeRuleCount("MISTAKE_RULE_DUP")).isEqualTo(1);
    }

    @Test
    void B_source에_같은_productCode를_두_번_지정하면_원인이_분명한_400을_받는다() throws Exception {
        QuantitySyncRuleRequest request = new QuantitySyncRuleRequest(
                "MISTAKE_RULE_B", QuantitySyncEstimateCategory.HOME_MULTI, "이름", true, "SUM",
                MAPPER.readTree("{}"), QuantitySyncInactiveBehavior.ZERO, QuantitySyncConflictPolicy.ADD,
                10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest("MISTAKE-SRC-A", new BigDecimal("1")),
                        new QuantitySyncRuleRequest.SourceRequest("MISTAKE-SRC-A", new BigDecimal("2"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest(
                        "MISTAKE-TGT-B", new BigDecimal("1"), "NONE", 1)));

        assertThatThrownBy(() -> service.create(request, "qa-mistake"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("source productCode가 중복되었습니다")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        assertThat(activeRuleCount("MISTAKE_RULE_B")).isZero();
    }

    @Test
    void C_target_displayOrder를_두_번_지정하면_원인이_분명한_400을_받는다() throws Exception {
        QuantitySyncRuleRequest request = new QuantitySyncRuleRequest(
                "MISTAKE_RULE_C", QuantitySyncEstimateCategory.HOME_MULTI, "이름", true, "SUM",
                MAPPER.readTree("{}"), QuantitySyncInactiveBehavior.ZERO, QuantitySyncConflictPolicy.ADD,
                10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest("MISTAKE-SRC-A", new BigDecimal("1"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest("MISTAKE-TGT-B", new BigDecimal("1"), "NONE", 1),
                        new QuantitySyncRuleRequest.TargetRequest(
                                "MISTAKE-TGT-C", new BigDecimal("1"), "NONE", 1)));

        assertThatThrownBy(() -> service.create(request, "qa-mistake"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("target displayOrder가 중복되었습니다")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        assertThat(activeRuleCount("MISTAKE_RULE_C")).isZero();
    }

    @Test
    void D_target에_같은_productCode를_두_번_지정하면_원인이_분명한_400을_받는다() throws Exception {
        QuantitySyncRuleRequest request = new QuantitySyncRuleRequest(
                "MISTAKE_RULE_D", QuantitySyncEstimateCategory.HOME_MULTI, "이름", true, "SUM",
                MAPPER.readTree("{}"), QuantitySyncInactiveBehavior.ZERO, QuantitySyncConflictPolicy.ADD,
                10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest("MISTAKE-SRC-A", new BigDecimal("1"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest("MISTAKE-TGT-B", new BigDecimal("1"), "NONE", 1),
                        new QuantitySyncRuleRequest.TargetRequest(
                                "MISTAKE-TGT-B", new BigDecimal("1"), "NONE", 2)));

        assertThatThrownBy(() -> service.create(request, "qa-mistake"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("target productCode가 중복되었습니다")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        assertThat(activeRuleCount("MISTAKE_RULE_D")).isZero();
    }

    // ---- 🚨 2026-07-28 범위 축소 R5 A1-① RED-first(S-3) — 별칭(모델코드/모델명)으로 같은
    // 품목을 두 번 지정해도 실 서비스 + 실 Postgres에서 원인이 분명한 400을 받는다. R5
    // 실측: 모델코드로 한 번, 모델명으로 한 번 같은 품목을 source에 지정하면 Java는
    // 문자열이 다르다는 이유로 통과시키고 DB 부분 unique 인덱스(UUID 비교)에서만 걸려
    // "동시 편집 충돌 또는 제약 위반"(409)으로 원인이 위장됐다. ----

    @Test
    void E_별칭_모델코드_모델명으로_같은_품목을_source에_두_번_지정하면_원인이_분명한_400을_받는다() throws Exception {
        productWithAlias("MISTAKE-ALIAS-E-CODE", "MISTAKE-ALIAS-E-NAME");
        QuantitySyncRuleRequest request = new QuantitySyncRuleRequest(
                "MISTAKE_RULE_E", QuantitySyncEstimateCategory.HOME_MULTI, "이름", true, "SUM",
                MAPPER.readTree("{}"), QuantitySyncInactiveBehavior.ZERO, QuantitySyncConflictPolicy.ADD,
                10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest("MISTAKE-ALIAS-E-CODE", new BigDecimal("1")),
                        new QuantitySyncRuleRequest.SourceRequest("MISTAKE-ALIAS-E-NAME", new BigDecimal("1"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest(
                        "MISTAKE-TGT-B", new BigDecimal("1"), "NONE", 1)));

        assertThatThrownBy(() -> service.create(request, "qa-mistake"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("같은 품목을 중복 지정")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        assertThat(activeRuleCount("MISTAKE_RULE_E")).isZero();
    }

    @Test
    void F_별칭_모델코드_모델명으로_같은_품목을_target에_두_번_지정하면_원인이_분명한_400을_받는다() throws Exception {
        productWithAlias("MISTAKE-ALIAS-F-CODE", "MISTAKE-ALIAS-F-NAME");
        QuantitySyncRuleRequest request = new QuantitySyncRuleRequest(
                "MISTAKE_RULE_F", QuantitySyncEstimateCategory.HOME_MULTI, "이름", true, "SUM",
                MAPPER.readTree("{}"), QuantitySyncInactiveBehavior.ZERO, QuantitySyncConflictPolicy.ADD,
                10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest("MISTAKE-SRC-A", new BigDecimal("1"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest(
                                "MISTAKE-ALIAS-F-CODE", new BigDecimal("1"), "NONE", 1),
                        new QuantitySyncRuleRequest.TargetRequest(
                                "MISTAKE-ALIAS-F-NAME", new BigDecimal("1"), "NONE", 2)));

        assertThatThrownBy(() -> service.create(request, "qa-mistake"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("같은 품목을 중복 지정")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        assertThat(activeRuleCount("MISTAKE_RULE_F")).isZero();
    }

    @Test
    void G_별칭으로_지정해도_source와_target이_같은_품목이면_원인이_분명한_400을_받는다() throws Exception {
        productWithAlias("MISTAKE-ALIAS-G-CODE", "MISTAKE-ALIAS-G-NAME");
        QuantitySyncRuleRequest request = new QuantitySyncRuleRequest(
                "MISTAKE_RULE_G", QuantitySyncEstimateCategory.HOME_MULTI, "이름", true, "SUM",
                MAPPER.readTree("{}"), QuantitySyncInactiveBehavior.ZERO, QuantitySyncConflictPolicy.ADD,
                10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest("MISTAKE-ALIAS-G-CODE", new BigDecimal("1"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest(
                        "MISTAKE-ALIAS-G-NAME", new BigDecimal("1"), "NONE", 1)));

        assertThatThrownBy(() -> service.create(request, "qa-mistake"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("source와 target은 같을 수 없습니다")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        assertThat(activeRuleCount("MISTAKE_RULE_G")).isZero();
    }

    /** model_code와 model_name을 서로 다른 값으로 둔 품목 — 별칭(alias) 조회 재현용. */
    private void productWithAlias(String modelCode, String modelName) {
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        UUID productId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO products (
                    id, name, model_name, category_id, selling_price, purchase_price,
                    created_at, created_by, is_deleted, status, model_code, product_type,
                    usage_scope)
                VALUES (?, ?, ?, ?, 0, 0, now(), ?, false, 'ACTIVE', ?, 'SINGLE', 'BOTH')
                """, productId, modelCode + " 품목", modelName, categoryId, CREATED_BY, modelCode);
        jdbcTemplate.update("""
                INSERT INTO product_estimate_exposure (
                    id, product_id, estimate_category, display_order,
                    created_at, created_by, is_deleted)
                VALUES (?, ?, 'HOME_MULTI', 1, now(), ?, false)
                """, UUID.randomUUID(), productId, CREATED_BY);
    }

    private QuantitySyncRuleRequest request(String ruleKey, String sourceCode, String targetCode) throws Exception {
        JsonNode condition = MAPPER.readTree("{}");
        return new QuantitySyncRuleRequest(ruleKey, QuantitySyncEstimateCategory.HOME_MULTI,
                ruleKey + " 이름", true, "SUM", condition, QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.ADD, 10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, new BigDecimal("1"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest(targetCode, new BigDecimal("1"), "NONE", 1)));
    }

    private long activeRuleCount(String ruleKey) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM quantity_sync_rule WHERE rule_key = ? AND is_deleted = false",
                Long.class, ruleKey);
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
        // 세 DELETE를 한 transaction으로 묶는다 — 다른 quantitysync IT와 동일 원인
        // (deferred constraint trigger가 부분 상태에서 오탐).
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
