package db.migration;

import com.samhanair.logis.product.service.ProductNameCategoryClassifier;
import com.samhanair.logis.product.domain.BundleComponent.ComponentKind;
import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * 제품구분 카테고리를 품목명 보수 규칙으로 백필한다.
 *
 * <p>시트 신규 적재와 {@link ProductNameCategoryClassifier} 하나를 공유한다. 수동 L/M/S 분류가
 * 지정된 행은 대상에서 제외하며, 모든 실제 변경은 감사행을 먼저 남겨 rollback 근거를 보존한다.
 */
public class V38__ProductCategoryBackfill extends BaseJavaMigration {

    static final String MIGRATION_KEY = "V38-PRODUCT-CATEGORY-BACKFILL";
    private static final String ACTOR = "V38__PRODUCT_CATEGORY_BACKFILL";
    private static final UUID UNCLASSIFIED_ID = UUID.fromString("00000000-0000-0000-0000-000000001100");

    @Override
    public void migrate(Context context) throws Exception {
        apply(context.getConnection());
    }

    /**
     * V38 본문을 실행한다. migration 재실행 검증에서도 같은 감사·적용 규칙을 사용한다.
     *
     * @param connection Flyway 또는 격리 검증 DB 연결
     */
    static void apply(Connection connection) throws SQLException {
        createAuditTable(connection);
        ensureUnregisteredRoot(connection);

        Map<String, UUID> categoryIds = loadCategoryIds(connection);
        List<Candidate> candidates = loadCandidates(connection);
        insertAudits(connection, candidates, categoryIds);
        applyAuditedChanges(connection);
    }

    /**
     * V38 감사행의 조건부 rollback을 실행한다.
     *
     * <p>V38 적용값과 현재값이 다르면 사후 변경으로 간주한다. 수동분류 플래그가 켜진 행,
     * soft-delete 행, 이미 rollback된 감사행도 대상에서 제외한다. 제품 갱신과 감사 완료 표시는
     * 하나의 CTE 문장에서 {@code RETURNING} 결과로 연결해 실제 복원된 행만 완료 처리한다.
     *
     * @param connection rollback 대상 DB 연결
     * @param actor       rollback 수행자 식별자
     * @return 실제 복원·완료 처리된 감사행 수
     */
    static int rollback(Connection connection, String actor) throws SQLException {
        if (actor == null || actor.isBlank()) {
            throw new SQLException("V38 rollback 수행자 식별자가 비어 있습니다.");
        }
        try (PreparedStatement statement = connection.prepareStatement("""
                WITH restored AS (
                    UPDATE products p
                       SET category_id = a.previous_category_id,
                           modified_at = CURRENT_TIMESTAMP,
                           modified_by = ?
                      FROM product_category_backfill_audit a
                     WHERE a.migration_key = ?
                       AND a.product_id = p.id
                       AND a.rolled_back_at IS NULL
                       AND a.is_deleted = FALSE
                       AND p.is_deleted = FALSE
                       AND p.classification_manual = FALSE
                       AND p.category_id = a.applied_category_id
                     RETURNING a.id
                )
                UPDATE product_category_backfill_audit a
                   SET rolled_back_at = CURRENT_TIMESTAMP,
                       rolled_back_by = ?,
                       modified_at = CURRENT_TIMESTAMP,
                       modified_by = ?
                  FROM restored r
                 WHERE a.id = r.id
                """)) {
            statement.setString(1, actor);
            statement.setString(2, MIGRATION_KEY);
            statement.setString(3, actor);
            statement.setString(4, actor);
            return statement.executeUpdate();
        }
    }

    private static void createAuditTable(Connection connection) throws SQLException {
        execute(connection, """
                CREATE TABLE IF NOT EXISTS product_category_backfill_audit (
                    id UUID PRIMARY KEY,
                    migration_key VARCHAR(64) NOT NULL,
                    product_id UUID NOT NULL,
                    previous_category_id UUID NOT NULL,
                    previous_category_code VARCHAR(50) NOT NULL,
                    applied_category_id UUID NOT NULL,
                    applied_category_code VARCHAR(50) NOT NULL,
                    reason VARCHAR(500) NOT NULL,
                    rolled_back_at TIMESTAMP,
                    rolled_back_by VARCHAR(100),
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    created_by VARCHAR(100) NOT NULL,
                    modified_at TIMESTAMP,
                    modified_by VARCHAR(100),
                    deleted_at TIMESTAMP,
                    deleted_by VARCHAR(100),
                    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                    CONSTRAINT uq_product_category_backfill_audit
                        UNIQUE (migration_key, product_id)
                )
                """);
        execute(connection, """
                CREATE INDEX IF NOT EXISTS ix_product_category_backfill_audit_product
                    ON product_category_backfill_audit (product_id, rolled_back_at)
                    WHERE is_deleted = FALSE
                """);
    }

    private static void ensureUnregisteredRoot(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO categories (
                    id, code, name, parent_id, display_order, serial_managed,
                    created_at, created_by, is_deleted
                )
                SELECT ?, 'UNCLASSIFIED', '미분류', NULL,
                       COALESCE(MAX(display_order), 0) + 1, FALSE,
                       CURRENT_TIMESTAMP, ?, FALSE
                  FROM categories
                 WHERE parent_id IS NULL
                   AND is_deleted = FALSE
                ON CONFLICT DO NOTHING
                """)) {
            statement.setObject(1, UNCLASSIFIED_ID);
            statement.setString(2, ACTOR);
            statement.executeUpdate();
        }
    }

    private static Map<String, UUID> loadCategoryIds(Connection connection) throws SQLException {
        Map<String, UUID> categoryIds = new HashMap<>();
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT code, id
                  FROM categories
                 WHERE is_deleted = FALSE
                   AND code IN ('SERVICE', 'CONTROL', 'PIPING', 'OUTDOOR', 'HVAC',
                                'INDOOR_WALL', 'INDOOR_CEILING', 'INDOOR', 'UNCLASSIFIED')
                """);
             ResultSet resultSet = statement.executeQuery()) {
            while (resultSet.next()) {
                categoryIds.put(resultSet.getString("code"), resultSet.getObject("id", UUID.class));
            }
        }
        if (categoryIds.size() != 9) {
            throw new SQLException("V38 제품구분 카테고리 시드가 누락되었습니다: " + categoryIds.keySet());
        }
        return categoryIds;
    }

    private static List<Candidate> loadCandidates(Connection connection) throws SQLException {
        List<Candidate> candidates = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT p.id, p.name, p.category_id, c.code AS category_code, component_roles.component_kinds
                  FROM products p
                  JOIN categories c ON c.id = p.category_id
                  LEFT JOIN (
                      SELECT component_product_code,
                             array_agg(DISTINCT component_kind) AS component_kinds
                        FROM bundle_component
                       WHERE is_deleted = FALSE
                       GROUP BY component_product_code
                  ) component_roles ON component_roles.component_product_code = p.model_code
                 WHERE p.is_deleted = FALSE
                   AND p.classification_manual = FALSE
                """);
             ResultSet resultSet = statement.executeQuery()) {
            while (resultSet.next()) {
                candidates.add(new Candidate(
                        resultSet.getObject("id", UUID.class),
                        resultSet.getString("name"),
                        resultSet.getObject("category_id", UUID.class),
                        resultSet.getString("category_code"),
                        componentKinds(resultSet.getArray("component_kinds"))
                ));
            }
        }
        return candidates;
    }

    private static void insertAudits(Connection connection, List<Candidate> candidates,
                                     Map<String, UUID> categoryIds) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO product_category_backfill_audit (
                    id, migration_key, product_id,
                    previous_category_id, previous_category_code,
                    applied_category_id, applied_category_code,
                    reason, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (migration_key, product_id) DO NOTHING
                """)) {
            for (Candidate candidate : candidates) {
                String appliedCode = ProductNameCategoryClassifier.classify(candidate.name(), candidate.componentKinds());
                UUID appliedCategoryId = categoryIds.get(appliedCode);
                if (candidate.categoryId().equals(appliedCategoryId)) {
                    continue;
                }
                statement.setObject(1, UUID.randomUUID());
                statement.setString(2, MIGRATION_KEY);
                statement.setObject(3, candidate.productId());
                statement.setObject(4, candidate.categoryId());
                statement.setString(5, candidate.categoryCode());
                statement.setObject(6, appliedCategoryId);
                statement.setString(7, appliedCode);
                statement.setString(8, appliedCode.equals(ProductNameCategoryClassifier.UNCLASSIFIED_CODE)
                        ? "품목명 보수 규칙 미일치 → 미분류"
                        : "품목명 보수 규칙 자동분류 → " + appliedCode);
                statement.setString(9, ACTOR);
                statement.addBatch();
            }
            statement.executeBatch();
        }
    }

    private static void applyAuditedChanges(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                UPDATE products p
                   SET category_id = a.applied_category_id,
                       modified_at = CURRENT_TIMESTAMP,
                       modified_by = ?
                  FROM product_category_backfill_audit a
                 WHERE a.migration_key = ?
                   AND a.product_id = p.id
                   AND a.rolled_back_at IS NULL
                   AND a.is_deleted = FALSE
                   AND p.is_deleted = FALSE
                   AND p.classification_manual = FALSE
                   AND p.category_id IS DISTINCT FROM a.applied_category_id
                """)) {
            statement.setString(1, ACTOR);
            statement.setString(2, MIGRATION_KEY);
            statement.executeUpdate();
        }
    }

    private static void execute(Connection connection, String sql) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.execute();
        }
    }

    private static EnumSet<ComponentKind> componentKinds(Array sqlArray) throws SQLException {
        EnumSet<ComponentKind> kinds = EnumSet.noneOf(ComponentKind.class);
        if (sqlArray == null) {
            return kinds;
        }
        Object array = sqlArray.getArray();
        if (array instanceof Object[] values) {
            for (Object value : values) {
                kinds.add(ComponentKind.valueOf(value.toString()));
            }
        }
        return kinds;
    }

    private record Candidate(UUID productId, String name, UUID categoryId, String categoryCode,
                             EnumSet<ComponentKind> componentKinds) {
    }
}
