package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Arrays;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.testcontainers.containers.PostgreSQLContainer;

/** V31의 products 광역 삭제를 V35가 정확히 복구하는 회귀 IT. */
class Issue1096ProductCleanupMigrationIT {

    private static final String CLEANUP_ACTOR = "issue-1096-test-seed-cleanup";
    private static final String TARGET_PRODUCT_ID = "b0000000-0000-0000-0000-000000000001";
    private static final String REGULAR_PRODUCT_ID = "f0000000-0000-0000-0000-000000000001";
    private static final String TARGET_ALIAS_ID = "f1000000-0000-0000-0000-000000000001";
    private static final String REGULAR_ALIAS_ID = "f1000000-0000-0000-0000-000000000002";
    private static final String TARGET_BUNDLE_ID = "f2000000-0000-0000-0000-000000000001";
    private static final String REGULAR_BUNDLE_ID = "f2000000-0000-0000-0000-000000000002";
    private static final String TARGET_EXPOSURE_ID = "f3000000-0000-0000-0000-000000000001";
    private static final String REGULAR_EXPOSURE_ID = "f3000000-0000-0000-0000-000000000002";
    private static final String HVAC_CATEGORY_ID = "00000000-0000-0000-0000-000000001001";
    private static final List<String> NON_GOODS_MODEL_CODES = List.of(
            "00101", "01018", "AAAA-00026", "AAAA-00027", "AAAA-00028", "AAAA-00029",
            "AAAA-00030", "AAAA-00032", "AAAA-00033", "ZENG-00001", "ZENG-00003",
            "ZENG-00004", "ZENG-00005", "설치비1", "설치비10", "설치비11", "설치비12",
            "설치비13", "설치비14", "설치비15", "설치비2", "설치비3", "설치비4",
            "설치비5", "설치비6", "설치비7", "설치비8", "설치비9", "영업수수료",
            "운임", "절삭", "조달수수료", "카드수수료", "판매수수료");

    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("issue_1096_product_cleanup_db")
            .withUsername("samhan")
            .withPassword("samhan_dev_pw");

    @BeforeAll
    static void seedBeforeV31() throws Exception {
        POSTGRES.start();
        migrateTo(30);
        try (Connection connection = connection()) {
            insertProduct(connection, TARGET_PRODUCT_ID, null, "V31-target-product");
            insertProduct(connection, REGULAR_PRODUCT_ID, null, "V31-regular-product");
            for (String modelCode : NON_GOODS_MODEL_CODES) {
                insertProduct(connection, "f4000000-0000-0000-0000-"
                        + String.format("%012d", NON_GOODS_MODEL_CODES.indexOf(modelCode) + 1),
                        modelCode, "V31-non-goods-" + modelCode);
            }
            insertAlias(connection, TARGET_ALIAS_ID, TARGET_PRODUCT_ID, "V31-TARGET-ALIAS");
            insertAlias(connection, REGULAR_ALIAS_ID, REGULAR_PRODUCT_ID, "V31-REGULAR-ALIAS");
            insertBundleComponent(connection, TARGET_BUNDLE_ID, TARGET_PRODUCT_ID, "V31-TARGET-COMPONENT");
            insertBundleComponent(connection, REGULAR_BUNDLE_ID, REGULAR_PRODUCT_ID, "V31-REGULAR-COMPONENT");
            insertExposure(connection, TARGET_EXPOSURE_ID, TARGET_PRODUCT_ID);
            insertExposure(connection, REGULAR_EXPOSURE_ID, REGULAR_PRODUCT_ID);
        }
    }

    @AfterAll
    static void stopContainer() {
        if (POSTGRES.isRunning()) {
            POSTGRES.stop();
        }
    }

    @Test
    @DisplayName("V35는 V31 비대상 복구·V33 비상품 전환을 수행하고 재실행에도 변하지 않는다")
    void repairsOnlyOutOfScopeRowsAndReappliesNonGoodsConversion() throws Exception {
        migrateToLatest();

        assertThat(productState(REGULAR_PRODUCT_ID)).containsExactly(false, null);
        assertThat(productState(TARGET_PRODUCT_ID)).containsExactly(true, CLEANUP_ACTOR);
        assertThat(count("product_aliases", "main_product_id", REGULAR_PRODUCT_ID, false)).isEqualTo(1);
        assertThat(count("product_aliases", "main_product_id", TARGET_PRODUCT_ID, true)).isEqualTo(1);
        assertThat(count("bundle_component", "bundle_product_id", REGULAR_PRODUCT_ID, false)).isEqualTo(1);
        assertThat(count("bundle_component", "bundle_product_id", TARGET_PRODUCT_ID, true)).isEqualTo(1);
        assertThat(count("product_estimate_exposure", "product_id", REGULAR_PRODUCT_ID, false)).isEqualTo(1);
        assertThat(count("product_estimate_exposure", "product_id", TARGET_PRODUCT_ID, true)).isEqualTo(1);
        assertThat(nonGoodsCount()).isEqualTo(34);
        assertThat(nonGoodsWithInventoryManagement()).isZero();

        // V35 SQL 자체를 한 번 더 실행해 이미 수동 복구된 DB 경로의 멱등성도 검증한다.
        try (Connection connection = connection()) {
            connection.setAutoCommit(false);
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V35__repair_issue_1096_product_cleanup.sql"));
            connection.commit();
        }

        assertThat(productState(REGULAR_PRODUCT_ID)).containsExactly(false, null);
        assertThat(productState(TARGET_PRODUCT_ID)).containsExactly(true, CLEANUP_ACTOR);
        assertThat(nonGoodsCount()).isEqualTo(34);
        assertThat(nonGoodsWithInventoryManagement()).isZero();
    }

    private static void migrateTo(int target) {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .target(String.valueOf(target))
                .load()
                .migrate();
    }

    private static void migrateToLatest() {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
    }

    private static Connection connection() throws Exception {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    private static void insertProduct(Connection connection, String id, String modelCode, String modelName)
            throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO products (
                    id, name, model_name, category_id, selling_price, purchase_price,
                    model_code, created_at, created_by, is_deleted
                ) VALUES (?::uuid, ?, ?, ?::uuid, 0, 0, ?, NOW(), 'system', FALSE)
                """)) {
            statement.setString(1, id);
            statement.setString(2, modelName);
            statement.setString(3, modelName);
            statement.setString(4, HVAC_CATEGORY_ID);
            statement.setString(5, modelCode);
            statement.executeUpdate();
        }
    }

    private static void insertAlias(Connection connection, String id, String productId, String aliasCode)
            throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO product_aliases (id, alias_code, main_product_id, created_at, created_by, is_deleted)
                VALUES (?::uuid, ?, ?::uuid, NOW(), 'system', FALSE)
                """)) {
            statement.setString(1, id);
            statement.setString(2, aliasCode);
            statement.setString(3, productId);
            statement.executeUpdate();
        }
    }

    private static void insertBundleComponent(Connection connection, String id, String productId, String componentCode)
            throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO bundle_component (id, bundle_product_id, component_product_code, created_at, created_by,
                                              is_deleted)
                VALUES (?::uuid, ?::uuid, ?, NOW(), 'system', FALSE)
                """)) {
            statement.setString(1, id);
            statement.setString(2, productId);
            statement.setString(3, componentCode);
            statement.executeUpdate();
        }
    }

    private static void insertExposure(Connection connection, String id, String productId) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO product_estimate_exposure (
                    id, product_id, estimate_category, created_at, created_by, is_deleted
                ) VALUES (?::uuid, ?::uuid, 'HOME_MULTI', NOW(), 'system', FALSE)
                """)) {
            statement.setString(1, id);
            statement.setString(2, productId);
            statement.executeUpdate();
        }
    }

    private static List<Object> productState(String productId) throws Exception {
        try (Connection connection = connection();
                PreparedStatement statement = connection.prepareStatement("""
                        SELECT is_deleted, deleted_by FROM products WHERE id = ?::uuid
                        """)) {
            statement.setString(1, productId);
            try (ResultSet result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
                return Arrays.asList(result.getBoolean("is_deleted"), result.getString("deleted_by"));
            }
        }
    }

    private static int count(String table, String productColumn, String productId, boolean deleted) throws Exception {
        String sql = "SELECT count(*) FROM " + table + " WHERE " + productColumn
                + " = ?::uuid AND is_deleted = ?";
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, productId);
            statement.setBoolean(2, deleted);
            try (ResultSet result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
                return result.getInt(1);
            }
        }
    }

    private static int nonGoodsCount() throws Exception {
        try (Connection connection = connection();
                PreparedStatement statement = connection.prepareStatement("""
                        SELECT count(*) FROM products
                         WHERE is_deleted = FALSE
                           AND model_code = ANY (?)
                           AND goods_type = 'NON_GOODS'
                        """)) {
            statement.setArray(1, statement.getConnection().createArrayOf("varchar", NON_GOODS_MODEL_CODES.toArray()));
            try (ResultSet result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
                return result.getInt(1);
            }
        }
    }

    private static int nonGoodsWithInventoryManagement() throws Exception {
        try (Connection connection = connection();
                PreparedStatement statement = connection.prepareStatement("""
                        SELECT count(*) FROM products
                         WHERE is_deleted = FALSE
                           AND model_code = ANY (?)
                           AND (goods_type <> 'NON_GOODS' OR inventory_qty_mgmt <> FALSE)
                        """)) {
            statement.setArray(1, statement.getConnection().createArrayOf("varchar", NON_GOODS_MODEL_CODES.toArray()));
            try (ResultSet result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
                return result.getInt(1);
            }
        }
    }
}
