package db.migration;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import java.math.BigDecimal;
import java.sql.Connection;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

/** V38 카테고리 백필의 감사·수동보존·rollback 계약을 실제 PostgreSQL에서 검증한다. */
@SpringBootTest(classes = ProductServiceApplication.class, properties = "app.scheduling.enabled=false")
@DirtiesContext
@Transactional
class V38__ProductCategoryBackfillTest extends AbstractPostgresIT {

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void backfill_수동분류행을_제외하고_감사후_자동및미등록카테고리를_적용하며_rollback할수있다() throws Exception {
        Category wall = categoryRepository.findByCode("INDOOR_WALL").orElseThrow();
        Category indoor = categoryRepository.findByCode("INDOOR").orElseThrow();

        Product classifiedOutdoor = saveProduct("실외기", "BACKFILL-OUTDOOR", wall);
        Product classifiedWall = saveProduct("벽걸이 실내기", "BACKFILL-WALL", wall);
        Product unclassified = saveProduct("AM180NXVUHH1", "BACKFILL-UNKNOWN", indoor);
        Product componentInferred = saveProduct("이름 미상", "BACKFILL-COMPONENT", indoor);
        Product bundle = productRepository.saveAndFlush(Product.seedFromSheet(
                "구성품 역산 세트", "BACKFILL-BUNDLE", wall, BigDecimal.TEN, BigDecimal.TEN,
                ProductType.BUNDLE, ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI));
        jdbcTemplate.update("""
                INSERT INTO bundle_component (
                    id, bundle_product_id, component_product_code, default_qty, qty_mode, component_kind,
                    created_at, created_by, is_deleted, display_order
                ) VALUES (?, ?, ?, 1, 'FIXED', 'OUTDOOR', CURRENT_TIMESTAMP, 'test', FALSE, 1)
                """, UUID.randomUUID(), bundle.getId(), componentInferred.getModelCode());
        Product manual = saveProduct("실외기", "BACKFILL-MANUAL", wall);
        jdbcTemplate.update("UPDATE products SET classification_manual = TRUE WHERE id = ?", manual.getId());

        Connection connection = DataSourceUtils.getConnection(jdbcTemplate.getDataSource());
        V38__ProductCategoryBackfill.apply(connection);

        assertCategory(classifiedOutdoor.getId(), "OUTDOOR");
        assertCategory(classifiedWall.getId(), "INDOOR");
        assertCategory(unclassified.getId(), "UNREGISTERED");
        assertCategory(componentInferred.getId(), "OUTDOOR");
        assertCategory(manual.getId(), "INDOOR_WALL");

        assertThat(auditCount(classifiedOutdoor.getId())).isEqualTo(1);
        assertThat(auditCount(classifiedWall.getId())).isEqualTo(1);
        assertThat(auditCount(unclassified.getId())).isEqualTo(1);
        assertThat(auditCount(componentInferred.getId())).isEqualTo(1);
        assertThat(auditCount(manual.getId())).isZero();

        jdbcTemplate.update("""
                UPDATE products p
                   SET category_id = a.previous_category_id,
                       modified_by = 'test-rollback'
                  FROM product_category_backfill_audit a
                 WHERE a.migration_key = 'V38-PRODUCT-CATEGORY-BACKFILL'
                   AND a.product_id = p.id
                   AND a.product_id = ?
                   AND a.rolled_back_at IS NULL
                """, classifiedOutdoor.getId());
        jdbcTemplate.update("""
                UPDATE product_category_backfill_audit
                   SET rolled_back_at = CURRENT_TIMESTAMP,
                       rolled_back_by = 'test-rollback',
                       modified_by = 'test-rollback'
                 WHERE migration_key = 'V38-PRODUCT-CATEGORY-BACKFILL'
                   AND product_id = ?
                   AND rolled_back_at IS NULL
                """, classifiedOutdoor.getId());

        assertCategory(classifiedOutdoor.getId(), "INDOOR_WALL");
    }

    @Test
    void apply_재실행은_감사후_수동변경한_제품구분을_덮어쓰지_않는다() throws Exception {
        Category wall = categoryRepository.findByCode("INDOOR_WALL").orElseThrow();
        Category indoor = categoryRepository.findByCode("INDOOR").orElseThrow();
        Product product = saveProduct("실외기", "BACKFILL-MANUAL-RERUN", wall);

        Connection connection = DataSourceUtils.getConnection(jdbcTemplate.getDataSource());
        V38__ProductCategoryBackfill.apply(connection);
        assertCategory(product.getId(), "OUTDOOR");

        java.sql.Timestamp humanModifiedAt = java.sql.Timestamp.valueOf("2026-08-11 12:34:56");
        jdbcTemplate.update("""
                UPDATE products
                   SET category_id = ?, classification_manual = TRUE,
                       modified_at = ?, modified_by = 'human'
                 WHERE id = ?
                """, indoor.getId(), humanModifiedAt, product.getId());

        V38__ProductCategoryBackfill.apply(connection);

        assertCategory(product.getId(), "INDOOR");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT classification_manual FROM products WHERE id = ?", Boolean.class, product.getId()))
                .isTrue();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT modified_at FROM products WHERE id = ?", java.sql.Timestamp.class, product.getId()))
                .isEqualTo(humanModifiedAt);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT modified_by FROM products WHERE id = ?", String.class, product.getId()))
                .isEqualTo("human");
        assertThat(auditRollbackAt(product.getId())).isNull();
    }

    @Test
    void apply_재실행은_수동행을_정상자동행과_섞어도_수동행만_건너뛴다() throws Exception {
        Category wall = categoryRepository.findByCode("INDOOR_WALL").orElseThrow();
        Category outdoor = categoryRepository.findByCode("OUTDOOR").orElseThrow();
        Category indoor = categoryRepository.findByCode("INDOOR").orElseThrow();
        Product manualApplied = saveProduct("실외기", "BACKFILL-MANUAL-APPLIED", wall);
        Product manualThirdCategory = saveProduct("실외기", "BACKFILL-MANUAL-THIRD", wall);
        Product automatic = saveProduct("실외기", "BACKFILL-AUTOMATIC-RERUN", wall);

        Connection connection = DataSourceUtils.getConnection(jdbcTemplate.getDataSource());
        V38__ProductCategoryBackfill.apply(connection);

        java.sql.Timestamp sameCategoryModifiedAt = java.sql.Timestamp.valueOf("2026-08-11 12:35:00");
        jdbcTemplate.update("""
                UPDATE products
                   SET category_id = ?, classification_manual = TRUE,
                       modified_at = ?, modified_by = 'human-same'
                 WHERE id = ?
                """, outdoor.getId(), sameCategoryModifiedAt, manualApplied.getId());
        java.sql.Timestamp thirdCategoryModifiedAt = java.sql.Timestamp.valueOf("2026-08-11 12:35:01");
        jdbcTemplate.update("""
                UPDATE products
                   SET category_id = ?, classification_manual = TRUE,
                       modified_at = ?, modified_by = 'human-third'
                 WHERE id = ?
                """, indoor.getId(), thirdCategoryModifiedAt, manualThirdCategory.getId());

        V38__ProductCategoryBackfill.apply(connection);

        assertCategory(manualApplied.getId(), "OUTDOOR");
        assertCategory(manualThirdCategory.getId(), "INDOOR");
        assertCategory(automatic.getId(), "OUTDOOR");
        assertProductModified(manualApplied.getId(), sameCategoryModifiedAt, "human-same");
        assertProductModified(manualThirdCategory.getId(), thirdCategoryModifiedAt, "human-third");
        assertThat(auditRollbackAt(manualApplied.getId())).isNull();
        assertThat(auditRollbackAt(manualThirdCategory.getId())).isNull();
        assertThat(auditRollbackAt(automatic.getId())).isNull();
    }

    @Test
    void rollback은_V38_적용값을_사후_수정한_행을_보존한다() throws Exception {
        Category wall = categoryRepository.findByCode("INDOOR_WALL").orElseThrow();
        Category outdoor = categoryRepository.findByCode("OUTDOOR").orElseThrow();
        Product product = saveProduct("실외기", "ROLLBACK-MANUAL-EDIT", wall);

        Connection connection = DataSourceUtils.getConnection(jdbcTemplate.getDataSource());
        V38__ProductCategoryBackfill.apply(connection);
        assertCategory(product.getId(), "OUTDOOR");

        jdbcTemplate.update("""
                UPDATE products
                   SET category_id = ?, classification_manual = TRUE, modified_by = 'human-after-v38'
                 WHERE id = ?
                """, outdoor.getId(), product.getId());

        V38__ProductCategoryBackfill.rollback(connection, "test-rollback");

        assertCategory(product.getId(), "OUTDOOR");
        assertThat(jdbcTemplate.queryForObject("""
                SELECT rolled_back_at
                  FROM product_category_backfill_audit
                 WHERE migration_key = 'V38-PRODUCT-CATEGORY-BACKFILL'
                   AND product_id = ?
        """, java.sql.Timestamp.class, product.getId())).isNull();
    }

    @Test
    void rollback_후_apply는_이미_rollback된_감사행을_다시_적용하지_않는다() throws Exception {
        Category wall = categoryRepository.findByCode("INDOOR_WALL").orElseThrow();
        Product product = saveProduct("실외기", "BACKFILL-ROLLBACK-APPLY", wall);
        Connection connection = DataSourceUtils.getConnection(jdbcTemplate.getDataSource());

        V38__ProductCategoryBackfill.apply(connection);
        assertCategory(product.getId(), "OUTDOOR");
        assertThat(V38__ProductCategoryBackfill.rollback(connection, "test-rollback-apply"))
                .isGreaterThan(0);
        assertCategory(product.getId(), "INDOOR_WALL");

        V38__ProductCategoryBackfill.apply(connection);

        assertCategory(product.getId(), "INDOOR_WALL");
        assertThat(auditRollbackAt(product.getId())).isNotNull();
    }

    @Test
    void rollback은_혼합_batch에서_실제로_복원한_행만_감사완료한다() throws Exception {
        Category wall = categoryRepository.findByCode("INDOOR_WALL").orElseThrow();
        Category outdoor = categoryRepository.findByCode("OUTDOOR").orElseThrow();
        Product applied = saveProduct("실외기", "ROLLBACK-BATCH-APPLIED", wall);
        Product manuallyChanged = saveProduct("실외기", "ROLLBACK-BATCH-MANUAL", wall);
        Product softDeleted = saveProduct("실외기", "ROLLBACK-BATCH-DELETED", wall);
        Product alreadyRolledBack = saveProduct("실외기", "ROLLBACK-BATCH-DONE", wall);
        Product auditDeleted = saveProduct("실외기", "ROLLBACK-BATCH-AUDIT-DELETED", wall);

        Connection connection = DataSourceUtils.getConnection(jdbcTemplate.getDataSource());
        V38__ProductCategoryBackfill.apply(connection);

        jdbcTemplate.update("""
                UPDATE products
                   SET category_id = ?, classification_manual = TRUE, modified_by = 'human-after-v38'
                 WHERE id = ?
                """, outdoor.getId(), manuallyChanged.getId());
        jdbcTemplate.update("""
                UPDATE products
                   SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP, deleted_by = 'test'
                 WHERE id = ?
                """, softDeleted.getId());
        jdbcTemplate.update("""
                UPDATE products p
                   SET category_id = a.previous_category_id, modified_by = 'prior-rollback'
                  FROM product_category_backfill_audit a
                 WHERE a.migration_key = 'V38-PRODUCT-CATEGORY-BACKFILL'
                   AND a.product_id = p.id
                   AND p.id = ?
                """, alreadyRolledBack.getId());
        jdbcTemplate.update("""
                UPDATE product_category_backfill_audit
                   SET rolled_back_at = CURRENT_TIMESTAMP, rolled_back_by = 'prior-rollback'
                 WHERE migration_key = 'V38-PRODUCT-CATEGORY-BACKFILL'
                   AND product_id = ?
                """, alreadyRolledBack.getId());
        jdbcTemplate.update("""
                UPDATE product_category_backfill_audit
                   SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP, deleted_by = 'test'
                 WHERE migration_key = 'V38-PRODUCT-CATEGORY-BACKFILL'
                   AND product_id = ?
                """, auditDeleted.getId());

        int expectedRollbackCount = rollbackCandidateCount();
        assertThat(expectedRollbackCount).isGreaterThan(0);
        assertThat(V38__ProductCategoryBackfill.rollback(connection, "batch-rollback"))
                .isEqualTo(expectedRollbackCount);
        assertCategory(applied.getId(), "INDOOR_WALL");
        assertCategory(manuallyChanged.getId(), "OUTDOOR");
        assertCategoryIncludingDeleted(softDeleted.getId(), "OUTDOOR");
        assertCategory(alreadyRolledBack.getId(), "INDOOR_WALL");
        assertCategory(auditDeleted.getId(), "OUTDOOR");
        assertThat(auditRollbackAt(applied.getId())).isNotNull();
        assertThat(auditRollbackAt(manuallyChanged.getId())).isNull();
        assertThat(auditRollbackAt(softDeleted.getId())).isNull();
        assertThat(auditRollbackAt(alreadyRolledBack.getId())).isNotNull();
        assertThat(auditRollbackAt(auditDeleted.getId())).isNull();
    }

    private Product saveProduct(String name, String modelCode, Category category) {
        return productRepository.saveAndFlush(Product.seedFromSheet(
                name, modelCode, category, BigDecimal.TEN, BigDecimal.TEN,
                ProductType.SINGLE, ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI));
    }

    private void assertCategory(UUID productId, String expectedCode) {
        String actual = jdbcTemplate.queryForObject("""
                SELECT c.code
                  FROM products p
                  JOIN categories c ON c.id = p.category_id
                 WHERE p.id = ?
                """, String.class, productId);
        assertThat(actual).isEqualTo(expectedCode);
    }

    private void assertCategoryIncludingDeleted(UUID productId, String expectedCode) {
        String actual = jdbcTemplate.queryForObject("""
                SELECT c.code
                  FROM products p
                  JOIN categories c ON c.id = p.category_id
                 WHERE p.id = ?
                """, String.class, productId);
        assertThat(actual).isEqualTo(expectedCode);
    }

    private void assertProductModified(UUID productId, java.sql.Timestamp expectedModifiedAt,
                                       String expectedModifiedBy) {
        assertThat(jdbcTemplate.queryForObject(
                "SELECT modified_at FROM products WHERE id = ?", java.sql.Timestamp.class, productId))
                .isEqualTo(expectedModifiedAt);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT modified_by FROM products WHERE id = ?", String.class, productId))
                .isEqualTo(expectedModifiedBy);
    }

    private java.sql.Timestamp auditRollbackAt(UUID productId) {
        return jdbcTemplate.queryForObject("""
                SELECT rolled_back_at
                  FROM product_category_backfill_audit
                 WHERE migration_key = 'V38-PRODUCT-CATEGORY-BACKFILL'
                   AND product_id = ?
                """, java.sql.Timestamp.class, productId);
    }

    private int rollbackCandidateCount() {
        return jdbcTemplate.queryForObject("""
                SELECT count(*)
                  FROM products p
                  JOIN product_category_backfill_audit a ON a.product_id = p.id
                 WHERE a.migration_key = 'V38-PRODUCT-CATEGORY-BACKFILL'
                   AND a.rolled_back_at IS NULL
                   AND a.is_deleted = FALSE
                   AND p.is_deleted = FALSE
                   AND p.classification_manual = FALSE
                   AND p.category_id = a.applied_category_id
                """, Integer.class);
    }

    private int auditCount(UUID productId) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT count(*)
                  FROM product_category_backfill_audit
                 WHERE migration_key = 'V38-PRODUCT-CATEGORY-BACKFILL'
                   AND product_id = ?
                """, Integer.class, productId);
        return count == null ? 0 : count;
    }
}
