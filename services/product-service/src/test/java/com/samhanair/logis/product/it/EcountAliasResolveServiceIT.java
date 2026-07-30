package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.service.EcountAliasResolveService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** ECOUNT staging alias 가 삭제된 Product UUID 를 반환하지 않는지 실 PostgreSQL 로 검증한다. */
@SpringBootTest(classes = ProductServiceApplication.class)
class EcountAliasResolveServiceIT extends AbstractPostgresIT {

    private static final String MODEL_CODE_PREFIX = "R6-ALIAS-984-";
    private static final String ALIAS_CODE_PREFIX = "R6-ALIAS-CODE-984-";
    private static final String ACTOR = "r6-alias-984-test";

    @Autowired
    private EcountAliasResolveService service;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void cleanupBeforeTest() {
        cleanupFixture();
    }

    @AfterEach
    void cleanupAfterTest() {
        cleanupFixture();
    }

    @Test
    void active_Product를_가리키는_staging_alias는_계속_해소된다() {
        Product product = createProduct("ACTIVE");
        String aliasCode = ALIAS_CODE_PREFIX + "ACTIVE";
        insertAlias(aliasCode, product.getId(), 1);

        Map<String, UUID> resolved = service.resolve(List.of(aliasCode));

        assertThat(resolved).containsEntry(aliasCode, product.getId());
    }

    @Test
    void soft_deleted_Product를_가리키는_staging_alias는_해소하지_않는다() {
        Product product = createProduct("DELETED");
        String aliasCode = ALIAS_CODE_PREFIX + "DELETED";
        jdbcTemplate.update("""
                UPDATE products
                   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = ?
                 WHERE id = ?
                """, ACTOR, product.getId());
        insertAlias(aliasCode, product.getId(), 2);

        Map<String, UUID> resolved = service.resolve(List.of(aliasCode));

        assertThat(resolved).doesNotContainKey(aliasCode);
    }

    private Product createProduct(String suffix) {
        Category category = categoryRepository.findAll().stream().findFirst().orElseThrow();
        Product product = Product.seedFromSheet(
                "R6 alias test " + suffix,
                MODEL_CODE_PREFIX + suffix,
                category,
                new BigDecimal("1000"),
                new BigDecimal("800"),
                ProductType.SINGLE,
                null,
                null,
                null);
        return productRepository.saveAndFlush(product);
    }

    private void insertAlias(String aliasCode, UUID productId, int rowNo) {
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_item_alias (
                    alias_code, main_item_code, main_product_uuid, source_file_hash, source_row_no
                ) VALUES (?, ?, ?, ?, ?)
                """, aliasCode, MODEL_CODE_PREFIX + "MAIN", productId, "R6-ALIAS-HASH", rowNo);
    }

    private void cleanupFixture() {
        jdbcTemplate.update("DELETE FROM staging.ecount_item_alias WHERE alias_code LIKE ?",
                ALIAS_CODE_PREFIX + "%");
        jdbcTemplate.update("DELETE FROM products WHERE model_code LIKE ?", MODEL_CODE_PREFIX + "%");
    }
}
