package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.QuantitySyncRuleService;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import com.samhanair.logis.product.web.dto.UpdateProductRequest;
import com.samhanair.logis.product.web.dto.UpdateProductUsageRequest;
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
 * R1 결함 2(a) [MED] · 결함 3 [MED] — 품목 단종/삭제가 수량 동기화 규칙 때문에 막힐 때
 * 사용자가 원인을 알 수 있는지(J-4), 그리고 비활성 규칙은 그 강제력이 없는지(J-3)를
 * 실 {@link ProductService} + 실 {@link QuantitySyncRuleService} + 실 Postgres로 검증한다.
 *
 * <p>fail-closed 자체(활성 규칙이 참조하면 막는다)는 결함이 아니었다 — 원인이 "동시 편집
 * 충돌 또는 제약 위반"으로 위장되는 것과, 비활성 규칙까지 강제력을 갖는 것이 결함이었다.
 */
@SpringBootTest(classes = ProductServiceApplication.class)
class QuantitySyncRuleProductDiscontinueIT extends AbstractPostgresIT {

    private static final String CREATED_BY = "896-S2-DISCONTINUE";
    private static final String LEGACY_REF = "896-disc";
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
    void 활성_규칙이_참조하면_단종이_거부되고_원인이_드러난다() throws Exception {
        UUID sourceId = product("DISC-SRC-A");
        product("DISC-TGT-B");
        quantitySyncRuleService.create(request("DISC_RULE_A", true, "DISC-SRC-A", "DISC-TGT-B"), "qa-disc");

        assertThatThrownBy(() -> productService.discontinue(sourceId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("DISC_RULE_A");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM products WHERE id = ?", String.class, sourceId))
                .isEqualTo("ACTIVE");
    }

    @Test
    void 활성_규칙이_참조하면_삭제도_거부되고_원인이_드러난다() throws Exception {
        UUID sourceId = product("DISC-SRC-C");
        product("DISC-TGT-D");
        quantitySyncRuleService.create(request("DISC_RULE_C", true, "DISC-SRC-C", "DISC-TGT-D"), "qa-disc");

        assertThatThrownBy(() -> productService.delete(sourceId, "qa-disc"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("DISC_RULE_C");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT is_deleted FROM products WHERE id = ?", Boolean.class, sourceId))
                .isFalse();
    }

    @Test
    void 비활성_규칙만_참조하면_단종이_허용된다() throws Exception {
        UUID sourceId = product("DISC-SRC-E");
        product("DISC-TGT-F");
        quantitySyncRuleService.create(request("DISC_RULE_E", false, "DISC-SRC-E", "DISC-TGT-F"), "qa-disc");

        productService.discontinue(sourceId);

        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM products WHERE id = ?", String.class, sourceId))
                .isEqualTo("DISCONTINUED");
    }

    @Test
    void 수량_동기화_규칙과_무관한_품목은_평소대로_단종된다() {
        UUID unrelated = product("DISC-UNRELATED");

        productService.discontinue(unrelated);

        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM products WHERE id = ?", String.class, unrelated))
                .isEqualTo("DISCONTINUED");
    }

    // ---- 재수렴 결함 3 [MED] — discontinue/delete만 덮이고 update()/노출구분 변경 경로는
    // 빠져 있었다. PATCH usageScope=NONE(update())과 수동 override(updateUsageAndReturn())
    // 양쪽 모두 같은 가드를 타야 한다(M-5). ----

    @Test
    void 활성_규칙이_참조하면_PATCH로_노출구분을_NONE으로_바꿀_수_없고_원인이_드러난다() throws Exception {
        UUID targetId = product("DISC-USAGE-SRC-A");
        product("DISC-USAGE-TGT-B");
        quantitySyncRuleService.create(request("DISC_RULE_USAGE_A", true, "DISC-USAGE-SRC-A", "DISC-USAGE-TGT-B"),
                "qa-disc");
        UpdateProductRequest usageNone = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, UsageScope.NONE, null, null);

        assertThatThrownBy(() -> productService.update(targetId, usageNone))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("DISC_RULE_USAGE_A");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT usage_scope FROM products WHERE id = ?", String.class, targetId))
                .isEqualTo("BOTH");
    }

    @Test
    void 활성_규칙이_참조하면_수동_노출override로도_NONE으로_바꿀_수_없고_원인이_드러난다() throws Exception {
        product("DISC-USAGE-SRC-C");
        product("DISC-USAGE-TGT-D");
        quantitySyncRuleService.create(request("DISC_RULE_USAGE_C", true, "DISC-USAGE-TGT-D", "DISC-USAGE-SRC-C"),
                "qa-disc");
        UpdateProductUsageRequest override = new UpdateProductUsageRequest(UsageScope.NONE, null);

        assertThatThrownBy(() -> productService.updateUsageAndReturn("DISC-USAGE-SRC-C", override))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("DISC_RULE_USAGE_C");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT usage_scope FROM products WHERE model_code = ?", String.class, "DISC-USAGE-SRC-C"))
                .isEqualTo("BOTH");
    }

    @Test
    void 노출구분_변경_거부와_단종_거부는_같은_품목_같은_원인이면_같은_메시지를_낸다() throws Exception {
        // 결함 3 재발 방지 lock — item 11(PATCH usageScope=NONE)과 item 12(discontinue)가
        // 같은 품목·같은 원인인데 다른 메시지를 냈다(update()에는 가드가 없어 DB 층 제약
        // 위반의 범용 409로, discontinue()는 서비스 층의 친절한 메시지로). 두 경로가 같은
        // 공용 helper를 타면 문자열이 완전히 같아야 한다.
        UUID targetId = product("DISC-USAGE-SRC-E");
        product("DISC-USAGE-TGT-F");
        quantitySyncRuleService.create(request("DISC_RULE_USAGE_E", true, "DISC-USAGE-SRC-E", "DISC-USAGE-TGT-F"),
                "qa-disc");
        UpdateProductRequest usageNone = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, UsageScope.NONE, null, null);

        String usageChangeMessage = catchMessage(() -> productService.update(targetId, usageNone));
        String discontinueMessage = catchMessage(() -> productService.discontinue(targetId));

        assertThat(usageChangeMessage).isEqualTo(discontinueMessage);
    }

    private String catchMessage(Runnable action) {
        try {
            action.run();
            throw new AssertionError("예외가 발생해야 한다");
        } catch (BusinessException ex) {
            return ex.getMessage();
        }
    }

    private QuantitySyncRuleRequest request(String ruleKey, boolean enabled,
                                            String sourceCode, String targetCode) throws Exception {
        JsonNode condition = MAPPER.readTree("{}");
        return new QuantitySyncRuleRequest(ruleKey, QuantitySyncEstimateCategory.HOME_MULTI,
                ruleKey + " 이름", enabled, "SUM", condition, QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.ADD, 10, LEGACY_REF,
                java.util.List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, new BigDecimal("1"))),
                java.util.List.of(new QuantitySyncRuleRequest.TargetRequest(
                        targetCode, new BigDecimal("1"), "NONE", 1)));
    }

    private UUID product(String code) {
        UUID id = UUID.randomUUID();
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        jdbcTemplate.update("""
                INSERT INTO products (
                    id, name, model_name, category_id, selling_price, purchase_price,
                    created_at, created_by, is_deleted, status, model_code, product_type,
                    usage_scope, estimate_category)
                VALUES (?, ?, ?, ?, 0, 0, now(), ?, false, 'ACTIVE', ?, 'SINGLE', 'BOTH', 'HOME_MULTI')
                """, id, code + " 품목", code, categoryId, CREATED_BY, code);
        return id;
    }

    private void cleanup() {
        // source/target/rule 하드 삭제를 별도 auto-commit 문으로 나누면 그 사이 순간에
        // deferred constraint trigger가 "rule must have active source and target rows"로
        // 오탐한다 — 세 DELETE를 한 transaction으로 묶는다(QuantitySyncRuleCrudIT와 동일 원인).
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
