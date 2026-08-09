package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.QuantitySyncConflictPolicy;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.domain.QuantitySyncInactiveBehavior;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidator;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.service.BundleComponentService;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.ProductSheetSyncService;
import com.samhanair.logis.product.service.QuantitySyncRuleService;
import com.samhanair.logis.product.web.dto.BundleComponentRequest;
import com.samhanair.logis.product.web.dto.CreateProductRequest;
import com.samhanair.logis.product.web.dto.ProductItemKind;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;

/** PR #958 R7 — R6 round-2 리뷰 5건을 pre-fix 상태에서 재현하는 RED 테스트. */
@SpringBootTest(properties = {
        "app.scheduling.enabled=false",
        "google.sheets.sheet-id=test-sheet-id",
        "google.sheets.endpoint-override=http://localhost:0"
})
@AutoConfigureMockMvc
@DirtiesContext
@WithMockUser(username = "test-r7")
class QuantitySyncRuleReconvergenceR7IT extends AbstractPostgresIT {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String CREATED_BY = "896-S2-R7";
    private static final String LEGACY_REF = "896-r7";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private BundleComponentService bundleComponentService;

    @SpyBean
    private QuantitySyncRuleService quantitySyncRuleService;

    @SpyBean
    private QuantitySyncRuleValidator ruleValidator;

    @Autowired
    private ProductSheetSyncService syncService;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private GoogleSheetsClient sheetsClient;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() throws Exception {
        cleanup();
        lenient().when(sheetsClient.readSheetFormulas(anyString(), anyString())).thenReturn(List.of());
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                org.mockito.Mockito.any(UUID.class), anyString(),
                org.mockito.Mockito.any(PermissionAction.class))).thenReturn(true);
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    void bundle_write_and_rule_create_are_serialized_as_one_graph_mutation() throws Exception {
        createProduct("R7-RACE-BUNDLE", ProductItemKind.SET, ProductCategory.HOME_MULTI,
                BundleMode.EXPAND, UsageScope.BOTH, List.of(EstimateCategory.HOME_MULTI));
        createProduct("R7-RACE-COMP", null, ProductCategory.HOME_MULTI,
                null, UsageScope.BOTH, List.of(EstimateCategory.HOME_MULTI));

        CountDownLatch componentCheckFinished = new CountDownLatch(1);
        CountDownLatch ruleValidationFinished = new CountDownLatch(1);
        doAnswer(invocation -> {
            Object value = invocation.callRealMethod();
            componentCheckFinished.countDown();
            await(ruleValidationFinished);
            return value;
        }).when(quantitySyncRuleService).findEnabledRuleKeysBrokenByBundleComponents(any(), any());
        doAnswer(invocation -> {
            Object value = invocation.callRealMethod();
            ruleValidationFinished.countDown();
            await(componentCheckFinished);
            return value;
        }).when(ruleValidator).validate(any());

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> componentWrite = executor.submit(() -> {
                var request = new BundleComponentRequest("R7-RACE-COMP", BigDecimal.ONE,
                        BundleComponent.QtyMode.FOLLOW_SET,
                        BundleComponent.ComponentKind.ACCESSORY, null, false, null);
                var response = mockMvc.perform(put("/api/v1/products/R7-RACE-BUNDLE/components")
                                .with(asMasterUser())
                                .header("X-User-Id", UUID.randomUUID().toString())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(MAPPER.writeValueAsString(List.of(request))))
                        .andReturn();
                if (response.getResponse().getStatus() != 200) {
                    throw new AssertionError("component HTTP status=" + response.getResponse().getStatus());
                }
                return null;
            });
            Future<?> ruleWrite = executor.submit(() -> {
                createRuleViaHttp(ruleRequest("R7-RACE-RULE", "R7-RACE-BUNDLE", "R7-RACE-COMP"));
                return null;
            });
            Throwable componentFailure = failure(componentWrite);
            Throwable ruleFailure = failure(ruleWrite);
            assertThat(java.util.stream.Stream.of(componentFailure, ruleFailure)
                    .filter(java.util.Objects::nonNull)
                    .count()).isEqualTo(1);
        } finally {
            executor.shutdownNow();
        }

        int activeComponents = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM bundle_component bc
                 JOIN products p ON p.id = bc.bundle_product_id
                WHERE p.model_code = 'R7-RACE-BUNDLE' AND bc.is_deleted = false
                """, Integer.class);
        int activeRules = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM quantity_sync_rule
                WHERE rule_key = 'R7-RACE-RULE' AND is_deleted = false
                """, Integer.class);

        assertThat(activeComponents + activeRules)
                .as("동시 검증을 통과한 구성품과 규칙이 함께 커밋되면 안 된다")
                .isLessThan(2);
    }

    @Test
    void older_sheet_response_cannot_overwrite_newer_response() throws Exception {
        createProduct("R7-SHEET-RACE", null, ProductCategory.HOME_MULTI,
                null, UsageScope.BOTH, List.of(EstimateCategory.HOME_MULTI));
        ProductSheetSyncService.SheetTabMapping mapping = new ProductSheetSyncService.SheetTabMapping(
                "R7", "R7_RACE", "R7_BEFORE", ProductCategory.HOME_MULTI, UsageScope.BOTH,
                EstimateCategory.HOME_MULTI, 0, 1, 3, 5);
        CountDownLatch olderStarted = new CountDownLatch(1);
        CountDownLatch releaseOlder = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        when(sheetsClient.readSheetDisplay("test-sheet-id", "R7_RACE!A1:Z")).thenAnswer(invocation -> {
            if (calls.getAndIncrement() == 0) {
                olderStarted.countDown();
                await(releaseOlder);
                return sheetRows("2,000,000", "900,000");
            }
            return sheetRows("3,000,000", "900,000");
        });

        long raceStartedNanos = System.nanoTime();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> older = executor.submit(() -> syncService.syncTab(
                    mapping, categoryRepository.findByCode("INDOOR_WALL").orElseThrow()));
            assertThat(olderStarted.await(5, TimeUnit.SECONDS)).isTrue();
            Future<?> newer = executor.submit(() -> syncService.syncTab(
                    mapping, categoryRepository.findByCode("INDOOR_WALL").orElseThrow()));
            get(newer);
            releaseOlder.countDown();
            get(older);
        } finally {
            releaseOlder.countDown();
            executor.shutdownNow();
        }

        BigDecimal finalReleasePrice = jdbcTemplate.queryForObject(
                "SELECT release_price FROM products WHERE model_code = 'R7-SHEET-RACE'",
                BigDecimal.class);
        long raceElapsedMillis = (System.nanoTime() - raceStartedNanos) / 1_000_000;
        System.out.printf("R7_SYNC_REVERSE older=2000000 newer=3000000 final=%s elapsed_ms=%d%n",
                finalReleasePrice, raceElapsedMillis);
        assertThat(finalReleasePrice).isEqualByComparingTo("3000000");
    }

    @Test
    void blocked_component_row_does_not_leave_parent_marker_on_child() throws Exception {
        createProduct("R7-COMP-BUNDLE", ProductItemKind.SET, ProductCategory.HOME_MULTI,
                BundleMode.EXPAND, UsageScope.BOTH, List.of(EstimateCategory.HOME_MULTI));
        createProduct("R7-COMP-CHILD", null, ProductCategory.HOME_MULTI,
                null, UsageScope.BOTH, List.of(EstimateCategory.HOME_MULTI));
        createRuleViaHttp(ruleRequest("R7-COMP-RULE", "R7-COMP-BUNDLE", "R7-COMP-CHILD"));

        when(sheetsClient.readSheetDisplay(anyString(), eq("R7_COMPONENT!A1:Z"))).thenReturn(List.of(
                List.of("\uC138\uD2B8", "\uBAA8\uB378\uBA85", "\uAD6C\uBD84", "\uC218\uB7C9"),
                List.of("R7-COMP-BUNDLE", "R7-COMP-CHILD", "", "")
        ));

        ProductSheetSyncService.ComponentSyncResult result = syncService.syncComponentTab(
                new ProductSheetSyncService.ComponentTabMapping("R7_COMPONENT", false));

        assertThat(result.blockedByRuleOccurrences).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM bundle_component bc
                 JOIN products p ON p.id = bc.bundle_product_id
                WHERE p.model_code = 'R7-COMP-BUNDLE' AND bc.is_deleted = false
                """, Integer.class)).isZero();
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("R7-COMP-CHILD")
                .orElseThrow().getParentBundleSetModel()).isNull();
    }

    @Test
    void r6_fixture_guard_requires_http_creation_and_rejects_sql_bundle_fixture() throws Exception {
        String source = Files.readString(repoRoot().resolve(
                "services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/"
                        + "QuantitySyncRuleReconvergenceR6IT.java"), StandardCharsets.UTF_8);

        assertThat(source).contains("MockMvc");
        assertThat(source).doesNotContain("quantitySyncRuleService.create");
        assertThat(source).doesNotContain("INSERT INTO products");
        assertThat(source).doesNotContain("INSERT INTO product_estimate_exposure");
    }

    @Test
    void r6_fixture_guard_covers_single_set_and_commercial_multi_alias_categories() throws Exception {
        String source = Files.readString(repoRoot().resolve(
                "services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/"
                        + "QuantitySyncRuleReconvergenceR6IT.java"), StandardCharsets.UTF_8);

        assertThat(source)
                .contains("QuantitySyncEstimateCategory.SINGLE_SET")
                .contains("QuantitySyncEstimateCategory.COMM_MULTI")
                .contains("EstimateCategory.COMMERCIAL_MULTI");
    }

    private QuantitySyncRuleRequest ruleRequest(String key, String sourceCode, String targetCode)
            throws Exception {
        JsonNode condition = MAPPER.readTree("{}");
        return new QuantitySyncRuleRequest(key, QuantitySyncEstimateCategory.HOME_MULTI,
                key, true, "SUM", condition, QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.ADD, 10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, BigDecimal.ONE)),
                List.of(new QuantitySyncRuleRequest.TargetRequest(
                        targetCode, BigDecimal.ONE, "NONE", 1)));
    }

    private void createProduct(String code, ProductItemKind itemKind, ProductCategory productCategory,
                               BundleMode bundleMode, UsageScope usageScope,
                               List<EstimateCategory> categories) throws Exception {
        UUID categoryId = categoryRepository.findAll().stream().findFirst().orElseThrow().getId();
        CreateProductRequest request = new CreateProductRequest(
                code + " name", code, categoryId, BigDecimal.ZERO, BigDecimal.ZERO, "KRW",
                null, null, itemKind, productCategory, bundleMode, null, null, null,
                BigDecimal.ZERO, BigDecimal.ZERO, null, usageScope, categories, null);
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/products")
                        .with(asMasterUser())
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(request)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isCreated());
    }

    private void createRuleViaHttp(QuantitySyncRuleRequest request) throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(
                                "/api/v1/quantity-sync-rules")
                        .with(asMasterUser())
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(request)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isCreated());
    }

    private static RequestPostProcessor asMasterUser() {
        return org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                .user("test-r7").roles("MASTER");
    }

    private static List<List<Object>> sheetRows(String releasePrice, String deliveryPrice) {
        return List.of(
                List.of("\uD488\uBAA9\uBA85", "\uBAA8\uB378\uBA85", "\uBE44\uACE0", "\uCD9C\uACE0\uAC00",
                        "\uBE44\uACE0", "\uD310\uB9E4\uAC00"),
                List.of("R7 sheet", "R7-SHEET-RACE", "", releasePrice, "", deliveryPrice));
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(2, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private static void get(Future<?> future) throws Exception {
        try {
            future.get(10, TimeUnit.SECONDS);
        } catch (java.util.concurrent.ExecutionException failure) {
            if (failure.getCause() instanceof Exception exception) {
                throw exception;
            }
            throw failure;
        }
    }

    private static Throwable failure(Future<?> future) throws Exception {
        try {
            future.get(10, TimeUnit.SECONDS);
            return null;
        } catch (java.util.concurrent.ExecutionException failure) {
            return failure.getCause();
        }
    }

    private static Path repoRoot() {
        Path current = Path.of("").toAbsolutePath();
        while (current != null && !Files.exists(current.resolve("settings.gradle"))) {
            current = current.getParent();
        }
        return current == null ? Path.of("").toAbsolutePath() : current;
    }

    private void cleanup() {
        jdbcTemplate.update("DELETE FROM quantity_sync_source WHERE rule_id IN "
                + "(SELECT id FROM quantity_sync_rule WHERE legacy_ref = ?)", LEGACY_REF);
        jdbcTemplate.update("DELETE FROM quantity_sync_target WHERE rule_id IN "
                + "(SELECT id FROM quantity_sync_rule WHERE legacy_ref = ?)", LEGACY_REF);
        jdbcTemplate.update("DELETE FROM quantity_sync_rule WHERE legacy_ref = ?", LEGACY_REF);
        jdbcTemplate.update("DELETE FROM bundle_component WHERE bundle_product_id IN "
                + "(SELECT id FROM products WHERE model_code LIKE 'R7-%' OR created_by = ?)", CREATED_BY);
        jdbcTemplate.update("DELETE FROM product_estimate_exposure WHERE product_id IN "
                + "(SELECT id FROM products WHERE model_code LIKE 'R7-%' OR created_by = ?)", CREATED_BY);
        jdbcTemplate.update("DELETE FROM price_history WHERE product_id IN "
                + "(SELECT id FROM products WHERE model_code LIKE 'R7-%' OR created_by = ?)", CREATED_BY);
        jdbcTemplate.update("DELETE FROM products WHERE model_code LIKE 'R7-%' OR created_by = ?", CREATED_BY);
    }
}
