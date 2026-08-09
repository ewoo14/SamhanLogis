package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.EstimateCategory;
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
import com.samhanair.logis.product.web.dto.CreateProductRequest;
import com.samhanair.logis.product.web.dto.ProductItemKind;
import com.samhanair.logis.product.web.dto.ProductResponse;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleRequest;
import com.samhanair.logis.product.web.dto.UpdateProductRequest;
import com.samhanair.logis.product.web.dto.UpdateProductUsageRequest;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.annotation.DirtiesContext;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import org.mockito.Mockito;

/**
 * PR #958 재수렴 R6 라운드 — 발견 각도가 지목한 도달 가능 결함 5건(1·2·3·5) +
 * 같은 계열 sweep 으로 발견한 {@code syncComponentTab} 인스턴스를 실 서비스 호출(HTTP
 * 컨트롤러 레이어와 동일한 {@link ProductService}/{@link BundleComponentService}/
 * {@link ProductSheetSyncService} 진입점) + 실 Postgres(Testcontainers)로 재현/고정한다.
 *
 * <p>모든 baseline 상태는 실 API 가 만들 수 있는 상태만 쓴다 — {@code product()} raw SQL
 * 헬퍼는 이 파일 계열의 기존 관례(QuantitySyncRuleProductDiscontinueIT 등)를 그대로 따르되
 * V18 이후 죽은 컬럼({@code products.estimate_category})은 건드리지 않고 살아있는
 * {@code product_estimate_exposure} 행만 심는다. 공격 동작(assert 대상 mutation)은 전부
 * 실 서비스 메서드 호출이다 — raw SQL 로 결과 상태를 직접 만들지 않는다.
 *
 * <p>I-1 — "값 열거가 아니라 결과 상태가 규칙을 깨는가"를 판정하므로, 결함 1은 UsageScope
 * 전 값(4종)을, 결함 2는 null/빈배열/null+유효값 혼합 격자를 돈다.
 */
@SpringBootTest(properties = {
        "app.scheduling.enabled=false",
        "google.sheets.sheet-id=test-sheet-id",
        "google.sheets.endpoint-override=http://localhost:0"
})
@AutoConfigureMockMvc
@DirtiesContext
@WithMockUser(username = "test-r6")
class QuantitySyncRuleReconvergenceR6IT extends AbstractPostgresIT {

    private static final String CREATED_BY = "896-S2-R6";
    private static final String LEGACY_REF = "896-r6";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private QuantitySyncRuleService quantitySyncRuleService;

    @Autowired
    private BundleComponentService bundleComponentService;

    @Autowired
    private ProductService productService;

    @Autowired
    private ProductRepository productRepository;

    @MockBean
    private GoogleSheetsClient sheetsClient;

    @Autowired
    private ProductSheetSyncService syncService;

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() throws Exception {
        cleanup();
        lenient().doNothing().when(sheetsClient).invalidateCache();
        lenient().when(sheetsClient.readSheetFormulas(anyString(), anyString())).thenReturn(List.of());
        lenient().when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                Mockito.any(UUID.class), anyString(), Mockito.any(PermissionAction.class))).thenReturn(true);
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    // ================================================================
    // 결함 1 [HIGH·계열 5회차] — UsageScope 전 값 격자 (I-1)
    // ================================================================

    @ParameterizedTest
    @EnumSource(UsageScope.class)
    void 활성_규칙이_참조하면_수동override의_어떤_UsageScope_값도_노출을_깨지_못한다(UsageScope targetScope) throws Exception {
        String sourceCode = createHomeMultiProduct("R6D1-SRC-" + targetScope);
        String targetCode = createHomeMultiProduct("R6D1-TGT-" + targetScope);
        createRuleViaHttp(ruleRequest("R6D1_RULE_" + targetScope, true, sourceCode, targetCode));

        UpdateProductUsageRequest req = new UpdateProductUsageRequest(targetScope, null);

        if (targetScope == UsageScope.ESTIMATE || targetScope == UsageScope.BOTH) {
            // 카테고리 무변경(estimateCategories=null) — 기존 HOME_MULTI 노출이 유지되므로
            // 규칙을 깨지 않는다. 과차단 회귀가 없어야 한다(I-2).
            productService.updateUsageAndReturn(sourceCode, req);
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT usage_scope FROM products WHERE model_code = ?", String.class, sourceCode))
                    .isEqualTo(targetScope.name());
            assertThat(activeExposureCount(sourceCode, "HOME_MULTI")).isEqualTo(1);
        } else {
            // NONE·PARTNER_ORDER 둘 다 견적 노출을 전량 삭제하는 scope다 — 활성 규칙이
            // 참조하면 막혀야 한다. 구 코드는 NONE만 막고 PARTNER_ORDER는 통과시켰다(결함 1).
            assertThatThrownBy(() -> productService.updateUsageAndReturn(sourceCode, req))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("수량 동기화")
                    .hasMessageContaining("R6D1_RULE_" + targetScope);
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT usage_scope FROM products WHERE model_code = ?", String.class, sourceCode))
                    .isEqualTo("BOTH");
            assertThat(activeExposureCount(sourceCode, "HOME_MULTI")).isEqualTo(1);
        }
    }

    @ParameterizedTest
    @EnumSource(UsageScope.class)
    void 활성_규칙이_참조하면_PATCH의_어떤_UsageScope_값도_노출을_깨지_못한다(UsageScope targetScope) throws Exception {
        String sourceCode = createHomeMultiProduct("R6D1P-SRC-" + targetScope);
        String targetCode = createHomeMultiProduct("R6D1P-TGT-" + targetScope);
        UUID sourceId = productRepository.findByModelCodeAndIsDeletedFalse(sourceCode).orElseThrow().getId();
        createRuleViaHttp(ruleRequest("R6D1P_RULE_" + targetScope, true, sourceCode, targetCode));

        UpdateProductRequest req = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, targetScope, null, null);

        if (targetScope == UsageScope.ESTIMATE || targetScope == UsageScope.BOTH) {
            productService.update(sourceId, req);
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT usage_scope FROM products WHERE id = ?", String.class, sourceId))
                    .isEqualTo(targetScope.name());
        } else {
            assertThatThrownBy(() -> productService.update(sourceId, req))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("수량 동기화")
                    .hasMessageContaining("R6D1P_RULE_" + targetScope);
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT usage_scope FROM products WHERE id = ?", String.class, sourceId))
                    .isEqualTo("BOTH");
        }
    }

    // ================================================================
    // 결함 2 [HIGH·이 fix 가 새로 만든 500] — estimateCategories null 원소 격자 (I-2)
    // ================================================================

    static List<List<EstimateCategory>> categoryGrids() {
        return List.of(
                Arrays.asList((EstimateCategory) null),
                List.of(),
                Arrays.asList(null, EstimateCategory.HOME_MULTI),
                List.of(EstimateCategory.HOME_MULTI, EstimateCategory.HOME_MULTI));
    }

    @ParameterizedTest
    @MethodSource("categoryGrids")
    void 규칙과_무관한_품목은_estimateCategories에_null이_섞여도_500이_아니다(List<EstimateCategory> categories) throws Exception {
        String code = createHomeMultiProduct("R6D2-UNRELATED-" + System.nanoTime());
        UUID id = productRepository.findByModelCodeAndIsDeletedFalse(code).orElseThrow().getId();

        UpdateProductRequest req = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, categories, null);

        // 구 코드는 Set.copyOf(categories)에서 null 원소에 NullPointerException을 던졌다
        // (규칙 참조 여부와 무관 — 이 품목은 어떤 규칙과도 무관하다). 신 코드는 정상 처리한다.
        productService.update(id, req);
    }

    @ParameterizedTest
    @MethodSource("categoryGrids")
    void 규칙과_무관한_품목은_usage_override의_estimateCategories에_null이_섞여도_500이_아니다(
            List<EstimateCategory> categories) throws Exception {
        String code = createHomeMultiProduct("R6D2U-UNRELATED-" + System.nanoTime());

        UpdateProductUsageRequest req = new UpdateProductUsageRequest(UsageScope.BOTH, categories);

        productService.updateUsageAndReturn(code, req);
    }

    @Test
    void null_카테고리_배열이_활성_규칙을_깨면_500이_아니라_409로_거부된다() throws Exception {
        String sourceCode = createHomeMultiProduct("R6D2-BLOCK-SRC");
        String targetCode = createHomeMultiProduct("R6D2-BLOCK-TGT");
        createRuleViaHttp(ruleRequest("R6D2_BLOCK_RULE", true, sourceCode, targetCode));

        UpdateProductUsageRequest req = new UpdateProductUsageRequest(
                UsageScope.BOTH, Arrays.asList((EstimateCategory) null));

        // [null] 은 normalizeCategories로 빈 집합이 되어 HOME_MULTI가 사라진다 — 규칙이
        // 참조하므로 CONFLICT로 거부되어야 한다(NPE로 500이 아니라).
        assertThatThrownBy(() -> productService.updateUsageAndReturn(sourceCode, req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("R6D2_BLOCK_RULE");
        assertThat(activeExposureCount(sourceCode, "HOME_MULTI")).isEqualTo(1);
    }

    // ================================================================
    // 결함 3 [MED] — 구성품 교체가 BUNDLE 자기구성품 연결을 만든다 (I-3)
    // ================================================================

    @Test
    void 활성_규칙이_source로_참조하는_BUNDLE에_target_품목을_구성품으로_replaceComponents로_추가할_수_없다() throws Exception {
        UUID bundleId = product("R6D3-BUNDLE", "BUNDLE");
        product("R6D3-COMP", "SINGLE");
        createRuleViaHttp(ruleRequest("R6D3_RULE", true, "R6D3-BUNDLE", "R6D3-COMP"));

        assertThatThrownBy(() -> bundleComponentService.replaceComponents(
                "R6D3-BUNDLE",
                List.of(new BundleComponentRequest("R6D3-COMP", new BigDecimal("1"),
                        BundleComponent.QtyMode.FIXED, BundleComponent.ComponentKind.ACCESSORY,
                        null, true, null)),
                "qa-r6"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("R6D3_RULE");

        Integer activeComponents = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM bundle_component
                 WHERE bundle_product_id = ? AND is_deleted = false
                """, Integer.class, bundleId);
        assertThat(activeComponents).isEqualTo(0);
    }

    @Test
    void 활성_규칙이_source로_참조하는_BUNDLE에_target_품목을_addRegisteredComponent로_추가할_수_없다() throws Exception {
        UUID bundleId = product("R6D3B-BUNDLE", "BUNDLE");
        product("R6D3B-COMP", "SINGLE");
        createRuleViaHttp(ruleRequest("R6D3B_RULE", true, "R6D3B-BUNDLE", "R6D3B-COMP"));

        assertThatThrownBy(() -> bundleComponentService.addRegisteredComponent(
                "R6D3B-BUNDLE", "R6D3B-COMP", BundleComponent.ComponentKind.ACCESSORY))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("R6D3B_RULE");

        Integer activeComponents = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM bundle_component
                 WHERE bundle_product_id = ? AND is_deleted = false
                """, Integer.class, bundleId);
        assertThat(activeComponents).isEqualTo(0);
    }

    @Test
    void 활성_규칙이_source로_참조하는_BUNDLE에_target_품목을_replaceRegisteredComponentLink로_추가할_수_없다() throws Exception {
        UUID bundleId = product("R6D3C-BUNDLE", "BUNDLE");
        product("R6D3C-COMP", "SINGLE");
        createRuleViaHttp(ruleRequest("R6D3C_RULE", true, "R6D3C-BUNDLE", "R6D3C-COMP"));

        assertThatThrownBy(() -> bundleComponentService.replaceRegisteredComponentLink(
                "R6D3C-BUNDLE", "R6D3C-COMP", BundleComponent.ComponentKind.ACCESSORY, "qa-r6"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수량 동기화")
                .hasMessageContaining("R6D3C_RULE");

        Integer activeComponents = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM bundle_component
                 WHERE bundle_product_id = ? AND is_deleted = false
                """, Integer.class, bundleId);
        assertThat(activeComponents).isEqualTo(0);
    }

    @Test
    void 규칙과_무관한_구성품_교체는_평소대로_허용된다() throws Exception {
        UUID bundleId = product("R6D3-UNRELATED-BUNDLE", "BUNDLE");
        product("R6D3-UNRELATED-COMP", "SINGLE");

        var result = bundleComponentService.replaceComponents(
                "R6D3-UNRELATED-BUNDLE",
                List.of(new BundleComponentRequest("R6D3-UNRELATED-COMP", new BigDecimal("1"),
                        BundleComponent.QtyMode.FIXED, BundleComponent.ComponentKind.ACCESSORY,
                        null, true, null)),
                "qa-r6");

        assertThat(result).hasSize(1);
        Integer activeComponents = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM bundle_component
                 WHERE bundle_product_id = ? AND is_deleted = false
                """, Integer.class, bundleId);
        assertThat(activeComponents).isEqualTo(1);
    }

    // ================================================================
    // 결함 5 [MED] — 노출 override 해제 후 시트 sync 가 규칙 참조 품목을 NONE 으로 되돌린다 (I-5)
    // ================================================================

    @Test
    void override_해제_후_시트sync가_활성_규칙_참조_품목의_usageScope를_NONE으로_되돌리지_않는다() throws Exception {
        String partCode = createSinglePartProduct("R6D5-PART");
        String peerCode = createHomeMultiProduct("R6D5-PEER");

        // ① 관리자가 구성품(SINGLE_PART, 기본 usageScope=NONE) 품목을 수동 override 로
        //    홈멀티 노출 — 실 API 경로.
        productService.updateUsageAndReturn(partCode,
                new UpdateProductUsageRequest(UsageScope.BOTH, List.of(EstimateCategory.HOME_MULTI)));
        // ② 그 품목을 참조하는 활성 규칙 생성.
        createRuleViaHttp(ruleRequest("R6D5_RULE", true, partCode, peerCode));
        // ③ 관리자가 수동 override 해제.
        productService.clearUsageOverride(partCode);

        assertThat(jdbcTemplate.queryForObject(
                "SELECT usage_scope FROM products WHERE model_code = ?", String.class, partCode))
                .isEqualTo("BOTH");

        // ④ 실 ProductSheetSyncService.syncTab 경로 — 구성품 탭 매핑(usageScope=NONE)에
        //    이 품목이 등장하면 override 해제로 무방비가 된 usageScope를 되돌리려 한다.
        //    싱글 구성품 SheetTabMapping 컬럼: nameColumn=0, modelCodeColumn=2,
        //    releasePriceColumn=5, deliveryPriceColumn=7.
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 구성품_단가인상!A1:Z")).thenReturn(singlePartRows(
                row("R6D5 PART", "", partCode, "", "", "1,000,000", "", "900,000")
        ));

        ProductSheetSyncService.SyncSummary summary = syncService.syncAll();
        ProductSheetSyncService.TabSyncResult tab = summary.byTab.get("싱글 구성품");
        assertThat(tab).isNotNull();
        assertThat(tab.error).isNull();

        assertThat(jdbcTemplate.queryForObject(
                "SELECT usage_scope FROM products WHERE model_code = ?", String.class, partCode))
                .isEqualTo("BOTH");
        assertThat(activeExposureCount(partCode, "HOME_MULTI")).isEqualTo(1);
    }

    // ================================================================
    // 결함 4 [MED·이 fix 가 새로 만든 차단] — 시트 sync 의 외부 HTTP 대기가 일반 품목
    // 편집을 인질로 잡지 않는다 (I-4). 라이브 타이밍(실서버)은 별도 라이브QA 문서로
    // 제출한다 — 이 IT는 결정론적 blocking mock 으로 락 보유 구간 자체를 고정한다.
    // ================================================================

    @Test
    void 시트sync의_외부HTTP_대기가_일반_품목편집을_인질로_잡지_않는다() throws Exception {
        String code = createHomeMultiProduct("R6D4-PRODUCT");
        UUID id = productRepository.findByModelCodeAndIsDeletedFalse(code).orElseThrow().getId();

        CountDownLatch httpCallStarted = new CountDownLatch(1);
        CountDownLatch releaseHttpCall = new CountDownLatch(1);
        when(sheetsClient.readSheetDisplay(eq("test-sheet-id"), eq("홈멀티_단가인상!A1:Z")))
                .thenAnswer(invocation -> {
                    httpCallStarted.countDown();
                    releaseHttpCall.await(30, TimeUnit.SECONDS);
                    return homeMultiRows(row("R6D4 PRODUCT", code, "", "1,000,000", "", "900,000"));
                });

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch updateCompleted = new CountDownLatch(1);
        try {
            Future<?> syncFuture = executor.submit(() -> {
                ProductSheetSyncService.SyncSummary summary = syncService.syncAll();
                if (summary.error != null) {
                    throw new IllegalStateException(summary.error);
                }
            });
            assertThat(httpCallStarted.await(5, TimeUnit.SECONDS))
                    .as("sync가 시트 HTTP 호출에 진입해야 한다")
                    .isTrue();

            long updateStartedNanos = System.nanoTime();
            Future<?> updateFuture = executor.submit(() -> {
                productService.update(id, new UpdateProductRequest(null, null, null, "R6D4 편집됨"));
                updateCompleted.countDown();
            });

            // 락이 시트 HTTP 대기를 덮으면(구 코드) update()가 advisory lock 대기로
            // 이 시점(HTTP 여전히 블록 중)에 완료되지 못한다. 덮지 않으면(신 코드) 즉시 완료된다.
            boolean completedWhileHttpBlocked = updateCompleted.await(1500, TimeUnit.MILLISECONDS);
            long updateElapsedMillis = (System.nanoTime() - updateStartedNanos) / 1_000_000;
            System.out.printf("R6_EDIT_DURING_SHEET_WAIT completed=%s elapsed_ms=%d%n",
                    completedWhileHttpBlocked, updateElapsedMillis);

            releaseHttpCall.countDown();
            syncFuture.get(15, TimeUnit.SECONDS);
            updateFuture.get(15, TimeUnit.SECONDS);

            assertThat(completedWhileHttpBlocked)
                    .as("일반 품목 편집이 시트 HTTP 응답을 기다리지 않고 즉시 완료되어야 한다")
                    .isTrue();
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT description FROM products WHERE id = ?", String.class, id))
                    .isEqualTo("R6D4 편집됨");
        } finally {
            releaseHttpCall.countDown();
            executor.shutdownNow();
        }
    }

    // ================================================================
    // 계열 sweep 으로 발견 — syncComponentTab 도 같은 자기구성품 결함을 만든다 (I-3)
    // ================================================================

    @Test
    void 활성_규칙이_source로_참조하는_BUNDLE에_구성품탭_시트sync가_target을_구성품으로_연결하지_않는다() throws Exception {
        UUID bundleId = product("R6SWEEP-BUNDLE", "BUNDLE");
        product("R6SWEEP-COMP", "SINGLE");
        createRuleViaHttp(ruleRequest("R6SWEEP_RULE", true, "R6SWEEP-BUNDLE", "R6SWEEP-COMP"));

        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 구성품_단가인상!A1:Z")).thenReturn(List.of(
                List.of("세트", "모델명", "구분", "수량"),
                List.of("R6SWEEP-BUNDLE", "R6SWEEP-COMP", "", "")
        ));

        ProductSheetSyncService.ComponentSyncResult result = syncService.syncComponentTab(
                new ProductSheetSyncService.ComponentTabMapping("싱글 구성품_단가인상", false));

        assertThat(result.error).isNull();
        Integer activeComponents = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM bundle_component
                 WHERE bundle_product_id = ? AND is_deleted = false
                """, Integer.class, bundleId);
        assertThat(activeComponents).isEqualTo(0);
    }

    // ================================================================
    // 헬퍼
    // ================================================================

    @Test
    void http_fixture가_SINGLE_SET과_COMM_MULTI_및_COMMERCIAL_MULTI_alias를_실제경로로_검증한다() throws Exception {
        for (QuantitySyncEstimateCategory category : List.of(
                QuantitySyncEstimateCategory.SINGLE_SET,
                QuantitySyncEstimateCategory.COMM_MULTI)) {
            ProductCategory productCategory = category == QuantitySyncEstimateCategory.SINGLE_SET
                    ? ProductCategory.SINGLE_SET : ProductCategory.COMMERCIAL_MULTI;
            EstimateCategory estimateCategory = category == QuantitySyncEstimateCategory.SINGLE_SET
                    ? EstimateCategory.SINGLE_SET : EstimateCategory.COMMERCIAL_MULTI;
            String source = createCategorizedProduct("R6D6-SRC-" + category,
                    productCategory, estimateCategory);
            String target = createCategorizedProduct("R6D6-TGT-" + category,
                    productCategory, estimateCategory);
            createRuleViaHttp(ruleRequest("R6D6-RULE-" + category, true, source, target, category));
        }

        String commercial = createHomeMultiProduct("R6D6-COMMERCIAL");
        productService.updateUsageAndReturn(commercial,
                new UpdateProductUsageRequest(UsageScope.BOTH,
                        List.of(EstimateCategory.COMMERCIAL_MULTI)));

        assertThat(activeExposureCount(commercial, "COMMERCIAL_MULTI")).isEqualTo(1);
    }

    private int activeExposureCount(String modelCode, String category) {
        return jdbcTemplate.queryForObject("""
                SELECT count(*) FROM product_estimate_exposure
                 WHERE product_id = (SELECT id FROM products WHERE model_code = ?)
                   AND estimate_category = ? AND is_deleted = false
                """, Integer.class, modelCode, category);
    }

    private QuantitySyncRuleRequest ruleRequest(String ruleKey, boolean enabled,
                                                 String sourceCode, String targetCode) throws Exception {
        return ruleRequest(ruleKey, enabled, sourceCode, targetCode,
                QuantitySyncEstimateCategory.HOME_MULTI);
    }

    private QuantitySyncRuleRequest ruleRequest(String ruleKey, boolean enabled,
                                                 String sourceCode, String targetCode,
                                                 QuantitySyncEstimateCategory category) throws Exception {
        JsonNode condition = MAPPER.readTree("{}");
        return new QuantitySyncRuleRequest(ruleKey, category,
                ruleKey + " name", enabled, "SUM", condition, QuantitySyncInactiveBehavior.ZERO,
                QuantitySyncConflictPolicy.ADD, 10, LEGACY_REF,
                List.of(new QuantitySyncRuleRequest.SourceRequest(sourceCode, new BigDecimal("1"))),
                List.of(new QuantitySyncRuleRequest.TargetRequest(targetCode, new BigDecimal("1"), "NONE", 1)));
    }

    private String createHomeMultiProduct(String code) throws Exception {
        return createCategorizedProduct(code, ProductCategory.HOME_MULTI, EstimateCategory.HOME_MULTI);
    }

    private String createCategorizedProduct(String code, ProductCategory productCategory,
                                            EstimateCategory estimateCategory) throws Exception {
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        CreateProductRequest req = new CreateProductRequest(
                code + " name", code, categoryId, BigDecimal.ZERO, BigDecimal.ZERO,
                "KRW", null, null, ProductItemKind.GENERAL, productCategory,
                null, null, null, null, BigDecimal.ZERO, BigDecimal.ZERO, null,
                UsageScope.BOTH, List.of(estimateCategory), null);
        createProductViaHttp(req);
        return code;
    }

    /** 구성품(SINGLE_PART) 품목은 HTTP create API로 만든다. */
    private String createSinglePartProduct(String code) throws Exception {
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        CreateProductRequest req = new CreateProductRequest(
                code + " name", code, categoryId, BigDecimal.ZERO, BigDecimal.ZERO,
                "KRW", null, null, ProductItemKind.GENERAL, ProductCategory.SINGLE_PART,
                null, null, null, null, BigDecimal.ZERO, BigDecimal.ZERO, null,
                UsageScope.NONE, null, null);
        createProductViaHttp(req);
        return code;
    }

    private UUID product(String code, String productType) throws Exception {
        UUID categoryId = jdbcTemplate.queryForObject("SELECT id FROM categories ORDER BY id LIMIT 1", UUID.class);
        ProductItemKind itemKind = "BUNDLE".equals(productType)
                ? ProductItemKind.SET : ProductItemKind.GENERAL;
        BundleMode bundleMode = itemKind == ProductItemKind.SET ? BundleMode.EXPAND : null;
        CreateProductRequest req = new CreateProductRequest(
                code + " name", code, categoryId, BigDecimal.ZERO, BigDecimal.ZERO,
                "KRW", null, null, itemKind, ProductCategory.HOME_MULTI, bundleMode,
                null, null, null, BigDecimal.ZERO, BigDecimal.ZERO, null,
                UsageScope.BOTH, List.of(EstimateCategory.HOME_MULTI), null);
        createProductViaHttp(req);
        return productRepository.findByModelCodeAndIsDeletedFalse(code).orElseThrow().getId();
    }

    private void createProductViaHttp(CreateProductRequest request) throws Exception {
        mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(request)))
                .andExpect(status().isCreated());
    }

    private void createRuleViaHttp(QuantitySyncRuleRequest request) throws Exception {
        mockMvc.perform(post("/api/v1/quantity-sync-rules")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MAPPER.writeValueAsString(request)))
                .andExpect(status().isCreated());
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
        jdbcTemplate.update("""
                DELETE FROM bundle_component
                 WHERE bundle_product_id IN (
                     SELECT id FROM products WHERE model_code LIKE 'R6%' OR created_by = ?)
                """, CREATED_BY);
        jdbcTemplate.update("""
                DELETE FROM price_history
                 WHERE product_id IN (
                     SELECT id FROM products WHERE model_code LIKE 'R6%' OR created_by = ?)
                """, CREATED_BY);
        jdbcTemplate.update("""
                DELETE FROM product_estimate_exposure
                 WHERE product_id IN (
                     SELECT id FROM products WHERE model_code LIKE 'R6%' OR created_by = ?)
                """, CREATED_BY);
        jdbcTemplate.update("DELETE FROM products WHERE model_code LIKE 'R6%' OR created_by = ?", CREATED_BY);
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
        // 홈멀티 SheetTabMapping 컬럼: nameColumn=0, modelCodeColumn=1,
        // releasePriceColumn=3, deliveryPriceColumn=5.
        all.add(List.of("품 명", "모델명", "비고", "출고가", "비고", "납품가"));
        for (List<Object> r : dataRows) {
            all.add(r);
        }
        return all;
    }

    @SafeVarargs
    private static List<List<Object>> singlePartRows(List<Object>... dataRows) {
        java.util.List<java.util.List<Object>> all = new java.util.ArrayList<>();
        // 싱글 구성품 SheetTabMapping 컬럼: nameColumn=0, modelCodeColumn=2,
        // releasePriceColumn=5, deliveryPriceColumn=7.
        all.add(List.of("품 명", "평형", "모델명", "비고", "비고", "출고가", "비고", "납품가"));
        for (List<Object> r : dataRows) {
            all.add(r);
        }
        return all;
    }

    private static List<Object> row(Object... vals) {
        return List.of(vals);
    }
}
