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
import java.util.UUID;
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
        jdbcTemplate.update("""
                DELETE FROM quantity_sync_source
                 WHERE rule_id IN (SELECT id FROM quantity_sync_rule WHERE rule_key='CRUD_RULE')
                """);
        jdbcTemplate.update("""
                DELETE FROM quantity_sync_target
                 WHERE rule_id IN (SELECT id FROM quantity_sync_rule WHERE rule_key='CRUD_RULE')
                """);
        jdbcTemplate.update("DELETE FROM quantity_sync_rule WHERE rule_key = 'CRUD_RULE'");
        jdbcTemplate.update("DELETE FROM products WHERE created_by = ?", CREATED_BY);
    }
}
