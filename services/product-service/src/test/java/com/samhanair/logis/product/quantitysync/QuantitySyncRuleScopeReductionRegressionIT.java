package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.service.BundleComponentService;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.ProductSheetSyncService;
import com.samhanair.logis.product.service.QuantitySyncRuleService;
import com.samhanair.logis.product.web.dto.BundleComponentRequest;
import com.samhanair.logis.product.web.dto.BundleComponentResponse;
import com.samhanair.logis.product.web.dto.CreateProductRequest;
import com.samhanair.logis.product.web.dto.ProductResponse;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.annotation.DirtiesContext;

/**
 * 🚨 2026-07-28 범위 축소(PR #958 R5 이후 개발책임자 결정) — DB 강제층(6개 constraint
 * trigger)을 products/bundle_component/product_estimate_exposure 3개 기존 테이블과
 * quantity_sync_rule/source/target 자신에서 전부 제거한 뒤, R5 가 그 층에서 재현했던
 * 결함이 실제로 사라졌는지 실행으로 고정한다.
 *
 * <p>본 파일이 다루는 두 결함은 실 HTTP 가 아니라 서비스 직접 호출로 재현됐던 것들이다
 * (R5 원 재현도 동일 — 구성품 replace-all·시트 sync 모두 내부 운영 경로).
 *
 * <ul>
 *   <li>A1-② — {@code V24:342} BUNDLE 검사에 {@code r.enabled = TRUE} 게이팅이 빠져
 *       꺼둔 규칙도 구성품 등록(PUT 상당, {@link BundleComponentService#replaceComponents})을
 *       영구 차단했다. 트리거 자체가 제거됐으므로 활성/비활성 무관하게 항상 성공해야 한다.</li>
 *   <li>A3-① — {@link ProductSheetSyncService#syncTab}이 규칙이 참조하는 품목을 시트에서
 *       지워도(GONE) 활성 규칙의 참조 무결성을 보존해야 하므로 해당 Product와 exposure를
 *       유지하고, 무관한 품목만 정리해야 한다.</li>
 * </ul>
 */
@SpringBootTest(properties = {
        "app.scheduling.enabled=false",
        "google.sheets.sheet-id=test-sheet-id",
        "google.sheets.endpoint-override=http://localhost:0"
})
@DirtiesContext
@WithMockUser(username = "test-sync")
class QuantitySyncRuleScopeReductionRegressionIT extends AbstractPostgresIT {

    private static final String CREATED_BY = "896-S2-SCOPEDOWN";
    private static final String LEGACY_REF = "896-scopedown";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private QuantitySyncRuleService quantitySyncRuleService;

    @Autowired
    private BundleComponentService bundleComponentService;

    @MockBean
    private GoogleSheetsClient sheetsClient;

    @Autowired
    private ProductSheetSyncService syncService;

    @Autowired
    private ProductService productService;

    @Autowired
    private ProductRepository productRepository;

    @BeforeEach
    void setUp() throws Exception {
        cleanup();
        syncService.clearHashCacheForTest();
        lenient().doNothing().when(sheetsClient).invalidateCache();
        lenient().when(sheetsClient.readSheetFormulas(anyString(), anyString())).thenReturn(List.of());
        lenient().when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void A1_2_꺼둔_규칙이_참조해도_구성품_등록이_더_이상_차단되지_않는다() throws Exception {
        UUID bundleId = product("SCOPE-A1-2-BUNDLE", "BUNDLE");
        product("SCOPE-A1-2-COMPONENT", "SINGLE");

        // R5 원 재현과 동일하게 enabled=false 규칙이 BUNDLE(source)->COMPONENT(target)를 참조한다.
        quantitySyncRuleService.create(ruleRequest("SCOPE_A1_2_RULE", false,
                "SCOPE-A1-2-BUNDLE", "SCOPE-A1-2-COMPONENT"), "qa-scope");

        List<BundleComponentResponse> result = bundleComponentService.replaceComponents(
                "SCOPE-A1-2-BUNDLE",
                List.of(new BundleComponentRequest("SCOPE-A1-2-COMPONENT", new BigDecimal("1"),
                        BundleComponent.QtyMode.FIXED, BundleComponent.ComponentKind.ACCESSORY,
                        null, true, null)),
                "qa-scope");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).componentProductCode()).isEqualTo("SCOPE-A1-2-COMPONENT");
        Integer activeComponents = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM bundle_component
                 WHERE bundle_product_id = ? AND is_deleted = false
                """, Integer.class, bundleId);
        assertThat(activeComponents).isEqualTo(1);
    }

    @Test
    void A3_1_활성_규칙이_참조하는_품목이_시트에서_사라져도_시트동기화가_보존한다() throws Exception {
        String goneCode = createHomeMultiProduct("SCOPE-A3-1-GONE");
        String partnerCode = createHomeMultiProduct("SCOPE-A3-1-PARTNER");

        quantitySyncRuleService.create(ruleRequest("SCOPE_A3_1_RULE", true, goneCode, partnerCode), "qa-scope");

        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("SCOPE GONE", goneCode, "", "1,000,000", "", "900,000"),
                row("SCOPE PARTNER", partnerCode, "", "1,000,000", "", "900,000")
        ));
        ProductSheetSyncService.SyncSummary baseline = syncService.syncAll();
        assertThat(baseline.byTab.get("홈멀티").error).isNull();

        // GONE만 시트에서 사라짐 — 활성 규칙 참조 품목은 시트 정리 대상이어도 보존해야 한다.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(homeMultiRows(
                row("SCOPE PARTNER", partnerCode, "", "1,000,000", "", "900,000")
        ));

        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();

        ProductSheetSyncService.TabSyncResult homeTab = summary.byTab.get("홈멀티");
        assertThat(homeTab).isNotNull();
        assertThat(homeTab.error).isNull();
        assertThat(homeTab.softDeleted).isZero();

        Boolean goneDeleted = jdbcTemplate.queryForObject(
                "SELECT is_deleted FROM products WHERE model_code = ?", Boolean.class, goneCode);
        assertThat(goneDeleted).isFalse();
        assertThat(jdbcTemplate.queryForObject("""
                SELECT is_deleted FROM product_estimate_exposure
                 WHERE product_id = (SELECT id FROM products WHERE model_code = ?)
                   AND estimate_category = 'HOME_MULTI'
                """, Boolean.class, goneCode)).isFalse();
    }

    private QuantitySyncRuleRequest ruleRequest(String ruleKey, boolean enabled,
                                                String sourceCode, String targetCode) throws Exception {
        JsonNode condition = MAPPER.readTree("{}");
        return new QuantitySyncRuleRequest(ruleKey, QuantitySyncEstimateCategory.HOME_MULTI,
                ruleKey + " 이름", enabled, "SUM", condition, QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.ADD, 10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, new BigDecimal("1"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest(targetCode, new BigDecimal("1"), "NONE", 1)));
    }

    private String createHomeMultiProduct(String code) {
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        CreateProductRequest req = new CreateProductRequest(
                code + " 품목", code, categoryId, BigDecimal.ZERO, BigDecimal.ZERO,
                "KRW", null, null, null, ProductCategory.HOME_MULTI, null, null, null, null,
                null, null, null, UsageScope.BOTH, List.of(EstimateCategory.HOME_MULTI), null);
        ProductResponse created = productService.create(req);
        return created.modelCode();
    }

    /** raw SQL 품목 생성 — productType(BUNDLE/SINGLE)을 직접 지정해야 하는 A1-② 전용. */
    private UUID product(String code, String productType) {
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        UUID productId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO products (
                    id, name, model_name, category_id, selling_price, purchase_price,
                    created_at, created_by, is_deleted, status, model_code, product_type,
                    usage_scope)
                VALUES (?, ?, ?, ?, 0, 0, now(), ?, false, 'ACTIVE', ?, ?, 'BOTH')
                """, productId, code + " 품목", code, categoryId, CREATED_BY, code, productType);
        jdbcTemplate.update("""
                INSERT INTO product_estimate_exposure (
                    id, product_id, estimate_category, display_order,
                    created_at, created_by, is_deleted)
                VALUES (?, ?, 'HOME_MULTI', 1, now(), ?, false)
                """, UUID.randomUUID(), productId, CREATED_BY);
        return productId;
    }

    private void cleanup() {
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
        // bundle_component 행의 created_by는 replaceComponents() 호출 시 넘긴 actor
        // ("qa-scope")로 찍힌다 — 이 클래스의 CREATED_BY 상수와 다르므로 created_by가
        // 아니라 bundle_product_id(SCOPE-% 품목) 기준으로 지워야 FK 위반 없이 정리된다.
        jdbcTemplate.update("""
                DELETE FROM bundle_component
                 WHERE bundle_product_id IN (SELECT id FROM products WHERE model_code LIKE 'SCOPE-%')
                """);
        jdbcTemplate.update("""
                DELETE FROM price_history
                 WHERE product_id IN (SELECT id FROM products WHERE model_code LIKE 'SCOPE-%')
                """);
        jdbcTemplate.update("""
                DELETE FROM product_estimate_exposure
                 WHERE product_id IN (SELECT id FROM products WHERE model_code LIKE 'SCOPE-%')
                """);
        jdbcTemplate.update("DELETE FROM products WHERE model_code LIKE 'SCOPE-%'");
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

    @SafeVarargs
    private static List<List<Object>> homeMultiRows(List<Object>... dataRows) {
        java.util.List<java.util.List<Object>> all = new java.util.ArrayList<>();
        all.add(List.of("품 명", "모델명", "비고", "출고가", "비고", "납품가"));
        for (List<Object> r : dataRows) {
            all.add(r);
        }
        return all;
    }

    private static List<Object> row(Object... vals) {
        return List.of(vals);
    }
}
