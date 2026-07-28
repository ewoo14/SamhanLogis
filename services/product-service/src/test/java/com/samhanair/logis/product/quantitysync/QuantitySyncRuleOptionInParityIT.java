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
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 재수렴 결함 1 [HIGH] — {@code optionIn} 조건의 Java validator ↔ V24 DB constraint trigger
 * 양쪽이 같은 답을 내는지 실 {@link QuantitySyncRuleService} + 실 Postgres로 검증한다.
 *
 * <p>fix 전에는 {@code QuantitySyncRuleValidator.validateOptionPair(value, allowList=true)}의
 * 불리언식 오류로 스칼라·빈 배열이 Java를 통과해 DB commit 시점 deferred constraint
 * trigger에서만 걸렸다 — 사용자는 "option 조건의 key/value가 허용 계약과 다릅니다"(400) 대신
 * DataIntegrityViolationException 유래의 "동시 편집 충돌 또는 제약 위반"(409)을 원인 불명으로
 * 받았다. 이 IT는 서비스 계층까지 통과해 실제로 DB에 도달하는지(fix 전) 대 Java 단에서
 * 즉시 막히는지(fix 후)를 잠근다 — 순수 validator 단위 테스트({@link QuantitySyncRuleValidationTest})
 * 만으로는 "DB에서만 걸린다"는 결함의 핵심을 증명하지 못한다.
 */
@SpringBootTest(classes = ProductServiceApplication.class)
class QuantitySyncRuleOptionInParityIT extends AbstractPostgresIT {

    private static final String CREATED_BY = "896-S2-OPTIONIN";
    private static final String LEGACY_REF = "896-optionin";
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
        product("OPTIONIN-SRC");
        product("OPTIONIN-TARGET");
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void optionIn_값이_스칼라면_Java_계층에서_즉시_거부되고_DB까지_가지_않는다() throws Exception {
        QuantitySyncRuleRequest request = request("OPTIONIN_SCALAR", "{\"optionIn\":[\"homeHoseType\",\"L\"]}");

        assertThatThrownBy(() -> service.create(request, "qa-optionin"))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        assertThat(activeRuleCount("OPTIONIN_SCALAR")).isZero();
    }

    @Test
    void optionIn_값이_빈_배열이면_Java_계층에서_즉시_거부되고_DB까지_가지_않는다() throws Exception {
        QuantitySyncRuleRequest request = request("OPTIONIN_EMPTY", "{\"optionIn\":[\"homeHoseType\",[]]}");

        assertThatThrownBy(() -> service.create(request, "qa-optionin"))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        assertThat(activeRuleCount("OPTIONIN_EMPTY")).isZero();
    }

    @Test
    void optionIn_값이_비공란_배열이면_저장된다() throws Exception {
        // control — Java·DB 양쪽이 수락해야 하는 유일한 형태(V24:170-175).
        QuantitySyncRuleRequest request = request("OPTIONIN_CONTROL", "{\"optionIn\":[\"homeHoseType\",[\"L\"]]}");

        service.create(request, "qa-optionin");

        assertThat(activeRuleCount("OPTIONIN_CONTROL")).isEqualTo(1);
    }

    private QuantitySyncRuleRequest request(String ruleKey, String conditionRaw) throws Exception {
        JsonNode condition = MAPPER.readTree(conditionRaw);
        return new QuantitySyncRuleRequest(ruleKey, QuantitySyncEstimateCategory.HOME_MULTI,
                ruleKey + " 이름", true, "SUM", condition, QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.ADD, 10, LEGACY_REF,
                java.util.List.of(new QuantitySyncRuleRequest.SourceRequest(
                        "OPTIONIN-SRC", new BigDecimal("1"))),
                java.util.List.of(new QuantitySyncRuleRequest.TargetRequest(
                        "OPTIONIN-TARGET", new BigDecimal("1"), "NONE", 1)));
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
        // 재수렴 결함 1 [최우선] S-2 fix — products.estimate_category(V18 이후 죽은 컬럼)
        // 대신 product_estimate_exposure에 노출 행을 심는다 — quantity_sync 검증이 읽는
        // 카테고리 컬럼만 실 API와 같다(행 전체 동일 아님 — modified_at/modified_by는
        // NULL로 남아 실 API 결과와 다르다, 2026-07-28 R4 정정, QuantitySyncRuleDbProbeIT
        // 참조).
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
        // rows"로 오탐한다(QuantitySyncRuleCrudIT/QuantitySyncRuleProductDiscontinueIT와 동일 원인).
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
