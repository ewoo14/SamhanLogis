package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.service.QuantitySyncRuleService;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleResponse;
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

/** 수량 동기화 규칙 CRUD의 실제 Product FK·soft-delete·UUID 비노출 계약 통합 테스트. */
@SpringBootTest(classes = ProductServiceApplication.class)
class QuantitySyncRuleCrudIT extends AbstractPostgresIT {

    private static final String CREATED_BY = "896-S2-CRUD";
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
        product("CRUD-SOURCE-A");
        product("CRUD-TARGET-B");
        product("CRUD-TARGET-C");
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void 생성_교체_soft_delete가_한_API_계약으로_동작하고_UUID를_노출하지_않는다() throws Exception {
        QuantitySyncRuleResponse created = service.create(request("CRUD_RULE", "CRUD-TARGET-B"), "qa-crud");
        assertThat(created.ruleKey()).isEqualTo("CRUD_RULE");
        assertThat(created.sources()).singleElement().extracting("productCode").isEqualTo("CRUD-SOURCE-A");
        assertThat(created.targets()).singleElement().extracting("productCode").isEqualTo("CRUD-TARGET-B");
        assertThat(MAPPER.writeValueAsString(created))
                .doesNotContain("\"id\"")
                .doesNotContain("ruleId")
                .doesNotContain("sourceProductId")
                .doesNotContain("targetProductId");

        QuantitySyncRuleResponse replaced = service.replace(
                "CRUD_RULE", request("CRUD_RULE", "CRUD-TARGET-C"), "qa-crud");
        assertThat(replaced.targets()).singleElement().extracting("productCode").isEqualTo("CRUD-TARGET-C");
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM quantity_sync_target t
                 JOIN quantity_sync_rule r ON r.id=t.rule_id
                WHERE r.rule_key='CRUD_RULE' AND t.is_deleted=true
                """, Integer.class)).isEqualTo(1);

        service.delete("CRUD_RULE", "qa-crud");
        assertThat(service.list(null)).isEmpty();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM quantity_sync_rule WHERE rule_key='CRUD_RULE' AND is_deleted=true",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void 기존_규칙의_source_target을_맞교환해도_순환으로_거부되지_않는다() throws Exception {
        // R1 결함 1 [HIGH] — 실 서비스 + 실 Postgres 양쪽을 통과하는 전체 스택 재현.
        // replace()가 validator.validate()를 호출한 뒤에야 옛 child를 soft-delete하므로
        // (QuantitySyncRuleService.java:116-126) 검증 시점에 옛 간선(A->B)과 새 간선(B->A)이
        // 합쳐져 순환으로 오판됐다.
        service.create(request("SWAP_RULE", "CRUD-TARGET-B"), "qa-crud");

        JsonNode condition = MAPPER.readTree("{}");
        QuantitySyncRuleRequest swapped = new QuantitySyncRuleRequest(
                "SWAP_RULE", QuantitySyncEstimateCategory.HOME_MULTI, "SWAP 테스트 규칙", true, "SUM",
                condition, QuantitySyncInactiveBehavior.ZERO, QuantitySyncConflictPolicy.ADD, 10,
                "896-swap",
                java.util.List.of(new QuantitySyncRuleRequest.SourceRequest(
                        "CRUD-TARGET-B", new BigDecimal("1"))),
                java.util.List.of(new QuantitySyncRuleRequest.TargetRequest(
                        "CRUD-SOURCE-A", new BigDecimal("1"), "NONE", 1)));

        QuantitySyncRuleResponse replaced = service.replace("SWAP_RULE", swapped, "qa-crud");

        assertThat(replaced.sources()).singleElement().extracting("productCode").isEqualTo("CRUD-TARGET-B");
        assertThat(replaced.targets()).singleElement().extracting("productCode").isEqualTo("CRUD-SOURCE-A");
    }

    private QuantitySyncRuleRequest request(String ruleKey, String targetCode) throws Exception {
        JsonNode condition = MAPPER.readTree("{}");
        return new QuantitySyncRuleRequest(ruleKey, QuantitySyncEstimateCategory.HOME_MULTI,
                "CRUD 테스트 규칙", true, "SUM", condition, QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.ADD, 10, "896-crud", 
                java.util.List.of(new QuantitySyncRuleRequest.SourceRequest(
                        "CRUD-SOURCE-A", new BigDecimal("1"))),
                java.util.List.of(new QuantitySyncRuleRequest.TargetRequest(
                        targetCode, new BigDecimal("1"), "NONE", 1)));
    }

    private void product(String code) {
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        jdbcTemplate.update("""
                INSERT INTO products (
                    id, name, model_name, category_id, selling_price, purchase_price,
                    created_at, created_by, is_deleted, status, model_code, product_type,
                    usage_scope, estimate_category)
                VALUES (?, ?, ?, ?, 0, 0, now(), ?, false, 'ACTIVE', ?, 'SINGLE', 'BOTH', 'HOME_MULTI')
                """, UUID.randomUUID(), code + " 품목", code, categoryId, CREATED_BY, code);
    }

    private void cleanup() {
        // source/target/rule hard-delete를 각각 별도 auto-commit 문으로 실행하면 그 사이
        // 순간(예: source만 지워지고 target·rule은 아직 남은 상태)에 deferred constraint
        // trigger가 "rule must have active source and target rows"로 오탐한다
        // (R1 fix 라운드에서 실측 — Suppressed DataIntegrityViolationException). 세 DELETE를
        // 한 transaction으로 묶어 트리거가 최종 상태(전부 삭제된 뒤)만 보게 한다.
        runInTransaction(connection -> {
            execute(connection, """
                    DELETE FROM quantity_sync_source
                     WHERE rule_id IN (SELECT id FROM quantity_sync_rule WHERE rule_key IN ('CRUD_RULE', 'SWAP_RULE'))
                    """);
            execute(connection, """
                    DELETE FROM quantity_sync_target
                     WHERE rule_id IN (SELECT id FROM quantity_sync_rule WHERE rule_key IN ('CRUD_RULE', 'SWAP_RULE'))
                    """);
            execute(connection, "DELETE FROM quantity_sync_rule WHERE rule_key IN ('CRUD_RULE', 'SWAP_RULE')");
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

    private void execute(Connection connection, String sql) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.executeUpdate();
        }
    }

    @FunctionalInterface
    private interface SqlWork {
        void run(Connection connection) throws Exception;
    }
}
