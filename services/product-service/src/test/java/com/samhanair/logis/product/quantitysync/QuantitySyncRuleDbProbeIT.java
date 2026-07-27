package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Types;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * I-2 증명용 직접 PostgreSQL SQL probe.
 *
 * <p>서비스·DTO·JPA repository를 사용하지 않고 isolated Testcontainers PostgreSQL에 SQL을 직접
 * 실행한다. 각 실패는 COMMIT 시점에 발생해야 하며, 실패한 transaction의 active rule count가
 * 증가하지 않는 것을 함께 확인한다.
 */
@SpringBootTest(classes = ProductServiceApplication.class)
class QuantitySyncRuleDbProbeIT extends AbstractPostgresIT {

    private static final String CREATED_BY = "896-S2-PROBE";

    @Autowired
    private DataSource dataSource;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void cleanBefore() {
        cleanup();
    }

    @AfterEach
    void cleanAfter() {
        cleanup();
    }

    @Test
    void DB_직접_SQL도_category_교차를_거부한다() throws Exception {
        UUID source = product("DB-CATEGORY-SOURCE", "HOME_MULTI", "SINGLE", "BOTH", true);
        UUID target = product("DB-CATEGORY-TARGET", "SINGLE_SET", "SINGLE", "BOTH", true);
        assertRejected(c -> {
            UUID rule = rule(c, "DB-CATEGORY", "HOME_MULTI", "ADD", "{}");
            source(c, rule, source, "1");
            target(c, rule, target, "1", 1);
        });
    }

    @Test
    void DB_직접_SQL도_source_target_동일을_거부한다() throws Exception {
        UUID product = product("DB-SAME", "HOME_MULTI", "SINGLE", "BOTH", true);
        assertRejected(c -> {
            UUID rule = rule(c, "DB-SAME", "HOME_MULTI", "ADD", "{}");
            source(c, rule, product, "1");
            target(c, rule, product, "1", 1);
        });
    }

    @Test
    void DB_직접_SQL도_REPLACE_중복을_거부한다() throws Exception {
        UUID source1 = product("DB-REPLACE-SOURCE-1", "HOME_MULTI", "SINGLE", "BOTH", true);
        UUID source2 = product("DB-REPLACE-SOURCE-2", "HOME_MULTI", "SINGLE", "BOTH", true);
        UUID targetProduct = product("DB-REPLACE-TARGET", "HOME_MULTI", "SINGLE", "BOTH", true);
        assertRejected(c -> {
            UUID first = rule(c, "DB-REPLACE-1", "HOME_MULTI", "REPLACE",
                    "{\"optionEquals\":[\"homeNoHose\",false]}");
            source(c, first, source1, "1");
            target(c, first, targetProduct, "1", 1);
            UUID second = rule(c, "DB-REPLACE-2", "HOME_MULTI", "REPLACE",
                    "{\"optionEquals\":[\"homeNoHose\",false]}");
            source(c, second, source2, "1");
            target(c, second, targetProduct, "1", 1);
        });
    }

    @Test
    void DB_직접_SQL도_순환_graph를_거부한다() throws Exception {
        UUID a = product("DB-CYCLE-A", "HOME_MULTI", "SINGLE", "BOTH", true);
        UUID b = product("DB-CYCLE-B", "HOME_MULTI", "SINGLE", "BOTH", true);
        assertRejected(c -> {
            UUID first = rule(c, "DB-CYCLE-1", "HOME_MULTI", "ADD", "{}");
            source(c, first, a, "1");
            target(c, first, b, "1", 1);
            UUID second = rule(c, "DB-CYCLE-2", "HOME_MULTI", "ADD", "{}");
            source(c, second, b, "1");
            target(c, second, a, "1", 1);
        });
    }

    @Test
    void DB_직접_SQL도_삭제_비노출_Product를_거부한다() throws Exception {
        UUID source = product("DB-HIDDEN-SOURCE", "HOME_MULTI", "SINGLE", "BOTH", true);
        UUID hidden = product("DB-HIDDEN-TARGET", "HOME_MULTI", "SINGLE", "NONE", true);
        assertRejected(c -> {
            UUID rule = rule(c, "DB-HIDDEN", "HOME_MULTI", "ADD", "{}");
            source(c, rule, source, "1");
            target(c, rule, hidden, "1", 1);
        });
    }

    @Test
    void DB_직접_SQL도_BUNDLE_component_경계를_거부한다() throws Exception {
        UUID bundle = product("DB-BUNDLE", "HOME_MULTI", "BUNDLE", "BOTH", true);
        UUID component = product("DB-COMPONENT", "HOME_MULTI", "SINGLE", "BOTH", true);
        bundleComponent(bundle, "DB-COMPONENT");
        assertRejected(c -> {
            UUID rule = rule(c, "DB-BUNDLE", "HOME_MULTI", "ADD", "{}");
            source(c, rule, bundle, "1");
            target(c, rule, component, "1", 1);
        });
    }

    @Test
    void DB_직접_SQL도_배수_scale과_범위를_거부한다() throws Exception {
        UUID sourceProduct = product("DB-SCALE-SOURCE", "HOME_MULTI", "SINGLE", "BOTH", true);
        UUID targetProduct = product("DB-SCALE-TARGET", "HOME_MULTI", "SINGLE", "BOTH", true);
        assertRejected(c -> {
            UUID rule = rule(c, "DB-SCALE", "HOME_MULTI", "ADD", "{}");
            source(c, rule, sourceProduct, "1.00001");
            target(c, rule, targetProduct, "1", 1);
        });
    }

    @Test
    void DB_직접_SQL도_불완전_graph를_원자적으로_거부한다() throws Exception {
        UUID goodSource = product("DB-ATOMIC-SOURCE", "HOME_MULTI", "SINGLE", "BOTH", true);
        UUID goodTarget = product("DB-ATOMIC-TARGET", "HOME_MULTI", "SINGLE", "BOTH", true);
        UUID invalid = product("DB-ATOMIC-INVALID", "HOME_MULTI", "SINGLE", "BOTH", true);
        long before = activeRules();
        assertThatThrownBy(() -> inTransaction(c -> {
            UUID good = rule(c, "DB-ATOMIC-GOOD", "HOME_MULTI", "ADD", "{}");
            source(c, good, goodSource, "1");
            target(c, good, goodTarget, "1", 1);
            UUID bad = rule(c, "DB-ATOMIC-BAD", "HOME_MULTI", "ADD", "{}");
            source(c, bad, invalid, "1");
            target(c, bad, invalid, "1", 1);
        })).isInstanceOf(SQLException.class);
        assertThat(activeRules()).isEqualTo(before);
    }

    private void assertRejected(SqlWork work) throws Exception {
        long before = activeRules();
        assertThatThrownBy(() -> inTransaction(work)).isInstanceOf(SQLException.class);
        assertThat(activeRules()).isEqualTo(before);
    }

    private void inTransaction(SqlWork work) throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                work.run(connection);
                connection.commit();
            } catch (Exception failure) {
                connection.rollback();
                throw failure;
            }
        }
    }

    private UUID product(String code, String category, String type,
                         String usageScope, boolean active) {
        UUID id = UUID.randomUUID();
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        jdbcTemplate.update("""
                INSERT INTO products (
                    id, name, model_name, category_id, selling_price, purchase_price,
                    created_at, created_by, is_deleted, status, model_code, product_type,
                    usage_scope, estimate_category)
                VALUES (?, ?, ?, ?, 0, 0, now(), ?, ?, ?, ?, ?, ?, ?)
                """, id, code + " name", code, categoryId, CREATED_BY, !active,
                active ? "ACTIVE" : "DISCONTINUED", code, type, usageScope, category);
        return id;
    }

    private void bundleComponent(UUID bundleId, String componentCode) {
        jdbcTemplate.update("""
                INSERT INTO bundle_component (
                    id, bundle_product_id, component_product_code, default_qty, qty_mode,
                    component_kind, is_default, created_at, created_by, is_deleted)
                VALUES (?, ?, ?, 1, 'FIXED', 'ACCESSORY', false, now(), ?, false)
                """, UUID.randomUUID(), bundleId, componentCode, CREATED_BY);
    }

    private UUID rule(Connection connection, String key, String category,
                      String policy, String condition) throws SQLException {
        UUID id = UUID.randomUUID();
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO quantity_sync_rule (
                    id, rule_key, estimate_category, name, enabled, aggregation, condition_json,
                    inactive_behavior, conflict_policy, priority, legacy_ref,
                    created_at, created_by, is_deleted)
                VALUES (?, ?, ?, ?, true, 'SUM', ?::jsonb, 'ZERO', ?, 10, ?, now(), ?, false)
                """)) {
            statement.setObject(1, id);
            statement.setString(2, key);
            statement.setString(3, category);
            statement.setString(4, key + " name");
            statement.setString(5, condition);
            statement.setString(6, policy);
            statement.setString(7, key + " legacy");
            statement.setString(8, CREATED_BY);
            statement.executeUpdate();
        }
        return id;
    }

    private void source(Connection connection, UUID ruleId, UUID productId,
                        String factor) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO quantity_sync_source (
                    id, rule_id, source_product_id, factor,
                    created_at, created_by, is_deleted)
                VALUES (?, ?, ?, ?, now(), ?, false)
                """)) {
            statement.setObject(1, UUID.randomUUID());
            statement.setObject(2, ruleId);
            statement.setObject(3, productId);
            statement.setBigDecimal(4, new BigDecimal(factor));
            statement.setString(5, CREATED_BY);
            statement.executeUpdate();
        }
    }

    private void target(Connection connection, UUID ruleId, UUID productId,
                        String multiplier, int displayOrder) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO quantity_sync_target (
                    id, rule_id, target_product_id, multiplier, rounding_mode, display_order,
                    created_at, created_by, is_deleted)
                VALUES (?, ?, ?, ?, 'NONE', ?, now(), ?, false)
                """)) {
            statement.setObject(1, UUID.randomUUID());
            statement.setObject(2, ruleId);
            statement.setObject(3, productId);
            statement.setBigDecimal(4, new BigDecimal(multiplier));
            statement.setInt(5, displayOrder);
            statement.setString(6, CREATED_BY);
            statement.executeUpdate();
        }
    }

    private long activeRules() {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM quantity_sync_rule WHERE is_deleted = false", Long.class);
    }

    private void cleanup() {
        jdbcTemplate.update("DELETE FROM quantity_sync_source WHERE created_by = ?", CREATED_BY);
        jdbcTemplate.update("DELETE FROM quantity_sync_target WHERE created_by = ?", CREATED_BY);
        jdbcTemplate.update("DELETE FROM quantity_sync_rule WHERE created_by = ?", CREATED_BY);
        jdbcTemplate.update("DELETE FROM bundle_component WHERE created_by = ?", CREATED_BY);
        jdbcTemplate.update("DELETE FROM products WHERE created_by = ?", CREATED_BY);
    }

    @FunctionalInterface
    private interface SqlWork {
        void run(Connection connection) throws Exception;
    }
}
