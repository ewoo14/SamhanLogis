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

    // ---- R1 결함 1 [HIGH] · 결함 2 [MED] DB 층 RED-first ----

    @Test
    void DB_직접_SQL도_비활성_규칙은_Product_비노출_전환을_막지_않는다() throws Exception {
        // R1 결함 2(a): PUT rule enabled=false 후에도 discontinue가 여전히 409였다.
        // DB constraint trigger가 enabled를 전혀 읽지 않아서다 — 비활성 규칙이 참조하는
        // Product를 비노출로 바꿔도 graph 검증이 막으면 안 된다.
        UUID source = product("DB-DISABLED-VIS-SOURCE", "HOME_MULTI", "SINGLE", "BOTH", true);
        UUID target = product("DB-DISABLED-VIS-TARGET", "HOME_MULTI", "SINGLE", "BOTH", true);
        inTransaction(c -> {
            UUID rule = rule(c, "DB-DISABLED-VIS", "HOME_MULTI", "ADD", "{}", false);
            source(c, rule, source, "1");
            target(c, rule, target, "1", 1);
            try (PreparedStatement statement = c.prepareStatement(
                    "UPDATE products SET usage_scope = 'NONE' WHERE id = ?")) {
                statement.setObject(1, target);
                statement.executeUpdate();
            }
        });

        assertThat(jdbcTemplate.queryForObject(
                "SELECT usage_scope FROM products WHERE id = ?", String.class, target))
                .isEqualTo("NONE");
    }

    @Test
    void DB_직접_SQL도_비활성_규칙간_순환은_거부하지_않는다() throws Exception {
        // R1 결함 2(b): 규칙 X(A->B, enabled=false) 저장 후 규칙 Y(B->A)가 순환으로
        // 오거부됐다. cycle CTE가 enabled를 걸러야 한다.
        UUID a = product("DB-DISABLED-CYCLE-A", "HOME_MULTI", "SINGLE", "BOTH", true);
        UUID b = product("DB-DISABLED-CYCLE-B", "HOME_MULTI", "SINGLE", "BOTH", true);
        inTransaction(c -> {
            UUID disabled = rule(c, "DB-DISABLED-CYCLE-1", "HOME_MULTI", "ADD", "{}", false);
            source(c, disabled, a, "1");
            target(c, disabled, b, "1", 1);
            UUID enabled = rule(c, "DB-DISABLED-CYCLE-2", "HOME_MULTI", "ADD", "{}", true);
            source(c, enabled, b, "1");
            target(c, enabled, a, "1", 1);
        });

        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM quantity_sync_rule
                 WHERE rule_key IN ('DB-DISABLED-CYCLE-1', 'DB-DISABLED-CYCLE-2') AND is_deleted = false
                """, Integer.class)).isEqualTo(2);
    }

    @Test
    void DB_직접_SQL은_같은_규칙의_source_target_교체를_수락한다() throws Exception {
        // R1 결함 1 재현 원문의 DB측 대응을 영구 회귀로 고정한다: "같은 최종 상태를 직접
        // SQL로 만들면 DB 트리거는 수락한다"는 리뷰어의 수기 확인 그대로다. deferred
        // constraint trigger는 커밋 시점의 최종 상태만 재검사하므로 자기 자신의 옛/새
        // 간선이 뒤섞이는 결함이 DB 층에는 원래 없었다(결함 1은 서비스 activeRuleSnapshots()
        // 타이밍 문제). 따라서 이 테스트는 RED-first가 아니라 그 사실을 잠그는 parity
        // 확인이며, 수정 전후 항상 GREEN이어야 한다.
        //
        // 최초 rule/source/target 삽입은 반드시 rule()/source()/target() 헬퍼로 **한
        // transaction 안에서** 해야 한다 — 별도 auto-commit 문으로 rule만 먼저 커밋하면
        // 그 순간 "rule must have active source and target rows"에 걸린다(자기 자신도
        // R1 fix 라운드에서 이 실수로 한 차례 깨졌었다).
        UUID x = product("DB-SELFSWAP-X", "HOME_MULTI", "SINGLE", "BOTH", true);
        UUID y = product("DB-SELFSWAP-Y", "HOME_MULTI", "SINGLE", "BOTH", true);
        inTransaction(c -> {
            UUID rule = rule(c, "DB-SELFSWAP", "HOME_MULTI", "ADD", "{}");
            source(c, rule, x, "1");
            target(c, rule, y, "1", 1);
        });

        inTransaction(c -> {
            try (PreparedStatement swapSource = c.prepareStatement("""
                    UPDATE quantity_sync_source SET source_product_id = ?
                     WHERE rule_id = (SELECT id FROM quantity_sync_rule WHERE rule_key = 'DB-SELFSWAP')
                       AND source_product_id = ?
                    """)) {
                swapSource.setObject(1, y);
                swapSource.setObject(2, x);
                swapSource.executeUpdate();
            }
            try (PreparedStatement swapTarget = c.prepareStatement("""
                    UPDATE quantity_sync_target SET target_product_id = ?
                     WHERE rule_id = (SELECT id FROM quantity_sync_rule WHERE rule_key = 'DB-SELFSWAP')
                       AND target_product_id = ?
                    """)) {
                swapTarget.setObject(1, x);
                swapTarget.setObject(2, y);
                swapTarget.executeUpdate();
            }
        });

        assertThat(jdbcTemplate.queryForObject("""
                SELECT s.source_product_id FROM quantity_sync_source s
                 JOIN quantity_sync_rule r ON r.id = s.rule_id
                WHERE r.rule_key = 'DB-SELFSWAP'
                """, UUID.class)).isEqualTo(y);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT t.target_product_id FROM quantity_sync_target t
                 JOIN quantity_sync_rule r ON r.id = t.rule_id
                WHERE r.rule_key = 'DB-SELFSWAP'
                """, UUID.class)).isEqualTo(x);
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
                    usage_scope)
                VALUES (?, ?, ?, ?, 0, 0, now(), ?, ?, ?, ?, ?, ?)
                """, id, code + " name", code, categoryId, CREATED_BY, !active,
                active ? "ACTIVE" : "DISCONTINUED", code, type, usageScope);
        // 재수렴 결함 1 [최우선] S-2 fix — products.estimate_category(V18 이후 죽은 컬럼)
        // 대신 product_estimate_exposure에 노출 행을 심는다 — quantity_sync 검증이 실제로
        // 읽는 컬럼(카테고리 판정)만 실 API와 같게 맞춘 것이다. 이 파일은 서비스·JPA를
        // 우회하는 순수 DB probe이므로(클래스 Javadoc) 실 API 경로를 쓸 수 없어 S-2 두 번째
        // 대안을 적용한다. 🚨2026-07-28 R4 정정: 행 전체가 실 API와 동일하지는 않다 —
        // modified_at/modified_by가 이 INSERT 컬럼 목록에 없어 NULL로 남는데, 실 API는
        // BaseEntity JPA auditing(@LastModifiedDate 등)으로 최초 생성 시에도 그 두 컬럼을
        // created_at/created_by와 같은 값으로 채운다(NULL이 아님). 이 파일은 그 두 컬럼을
        // 읽지 않아 도달 가능한 결함은 아니다(docs/dev-reports/2026-07-28-896-s2-quantity-
        // sync-schema.md §9 참조).
        jdbcTemplate.update("""
                INSERT INTO product_estimate_exposure (
                    id, product_id, estimate_category, display_order,
                    created_at, created_by, is_deleted)
                VALUES (?, ?, ?, 1, now(), ?, false)
                """, UUID.randomUUID(), id, category, CREATED_BY);
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
        return rule(connection, key, category, policy, condition, true);
    }

    private UUID rule(Connection connection, String key, String category,
                      String policy, String condition, boolean enabled) throws SQLException {
        UUID id = UUID.randomUUID();
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO quantity_sync_rule (
                    id, rule_key, estimate_category, name, enabled, aggregation, condition_json,
                    inactive_behavior, conflict_policy, priority, legacy_ref,
                    created_at, created_by, is_deleted)
                VALUES (?, ?, ?, ?, ?, 'SUM', ?::jsonb, 'ZERO', ?, 10, ?, now(), ?, false)
                """)) {
            statement.setObject(1, id);
            statement.setString(2, key);
            statement.setString(3, category);
            statement.setString(4, key + " name");
            statement.setBoolean(5, enabled);
            statement.setString(6, condition);
            statement.setString(7, policy);
            statement.setString(8, key + " legacy");
            statement.setString(9, CREATED_BY);
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
        // source/target/rule 하드 삭제를 별도 auto-commit 문으로 나누면 그 사이 순간에
        // deferred constraint trigger가 "rule must have active source and target rows"로
        // 오탐한다. 기존 8종은 전부 rollback되어 문제가 없었지만, 새로 추가한 성공(commit)
        // 케이스(비활성 규칙 2종·selfswap parity)부터는 세 DELETE를 한 transaction으로
        // 묶어야 한다.
        try {
            inTransaction(c -> {
                try (PreparedStatement s = c.prepareStatement(
                        "DELETE FROM quantity_sync_source WHERE created_by = ?")) {
                    s.setString(1, CREATED_BY);
                    s.executeUpdate();
                }
                try (PreparedStatement s = c.prepareStatement(
                        "DELETE FROM quantity_sync_target WHERE created_by = ?")) {
                    s.setString(1, CREATED_BY);
                    s.executeUpdate();
                }
                try (PreparedStatement s = c.prepareStatement(
                        "DELETE FROM quantity_sync_rule WHERE created_by = ?")) {
                    s.setString(1, CREATED_BY);
                    s.executeUpdate();
                }
            });
        } catch (Exception e) {
            throw new IllegalStateException("cleanup 실패", e);
        }
        jdbcTemplate.update("DELETE FROM bundle_component WHERE created_by = ?", CREATED_BY);
        // product_estimate_exposure가 products FK를 참조하므로 products보다 먼저 지운다.
        jdbcTemplate.update("DELETE FROM product_estimate_exposure WHERE created_by = ?", CREATED_BY);
        jdbcTemplate.update("DELETE FROM products WHERE created_by = ?", CREATED_BY);
    }

    @FunctionalInterface
    private interface SqlWork {
        void run(Connection connection) throws Exception;
    }
}
