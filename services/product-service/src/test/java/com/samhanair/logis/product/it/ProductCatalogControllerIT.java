package com.samhanair.logis.product.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.ProductSpecRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

/** 7 카탈로그 endpoint smoke + usageScope 필터 IT. */
@SpringBootTest
@DirtiesContext
@WithMockUser(username = "test-user")
@Transactional
class ProductCatalogControllerIT extends AbstractPostgresIT {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductSpecRepository productSpecRepository;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    private MockMvc mvc;

    @BeforeEach
    void setupMvc() {
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.anyString(), Mockito.any(PermissionAction.class)))
                .thenReturn(true);

        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        Category cat = categoryRepository.save(Category.create("CAT-API", "api test", null, 1));
        productRepository.save(Product.seedFromSheet("API-Home", "API_HOME_01", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI));
        productRepository.flush();
    }

    @Test
    void GET_products_usageScope_필터() throws Exception {
        mvc.perform(get("/api/v1/products?usageScope=BOTH&category=HOME_MULTI")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.modelCode == 'API_HOME_01')]").exists());
    }

    @Test
    void PATCH_usage_admin_변경() throws Exception {
        mvc.perform(patch("/api/v1/products/API_HOME_01/usage")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"usageScope":"ESTIMATE","estimateCategory":"OTHER"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usageScope").value("ESTIMATE"))
                .andExpect(jsonPath("$.estimateCategory").value("OTHER"));
    }

    @Test
    void POST_specs_409_on_duplicate() throws Exception {
        mvc.perform(post("/api/v1/products/API_HOME_01/specs")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"specKey":"냉방성능(kW)","specValue":"5.6","unit":"kW","displayOrder":1}
                                """))
                .andExpect(status().isCreated());

        mvc.perform(post("/api/v1/products/API_HOME_01/specs")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"specKey":"냉방성능(kW)","specValue":"6.0","unit":"kW"}
                                """))
                .andExpect(status().isConflict());
    }

    @Test
    void GET_spec_key_templates_카테고리_필터() throws Exception {
        mvc.perform(get("/api/v1/spec-key-templates?category=HOME_MULTI")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                // V4 SQL 시드된 14 row 중 일부 확인
                .andExpect(jsonPath("$[?(@.specKey == '배관경')]").exists())
                .andExpect(jsonPath("$[?(@.specKey == '냉매가스')]").exists());
    }

    @Test
    void modelCode_NULL_modelName_식별자로_usage와_spec_CRUD_왕복() throws Exception {
        Product product = saveModelNameOnlyProduct("MODEL_NAME_ONLY_01");
        ProductSpec spec = productSpecRepository.save(ProductSpec.create(
                product.getId(), "소비전력", "1.1", "kW", 1));
        productSpecRepository.flush();

        mvc.perform(get("/api/v1/products?usageScope=BOTH&category=HOME_MULTI")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.modelCode == 'MODEL_NAME_ONLY_01')]").exists());

        mvc.perform(patch("/api/v1/products/MODEL_NAME_ONLY_01/usage")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"usageScope":"ESTIMATE","estimateCategory":"OTHER"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.modelCode").value("MODEL_NAME_ONLY_01"))
                .andExpect(jsonPath("$.usageScope").value("ESTIMATE"));

        mvc.perform(get("/api/v1/products/MODEL_NAME_ONLY_01/specs")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.specKey == '소비전력')]").exists());

        mvc.perform(post("/api/v1/products/MODEL_NAME_ONLY_01/specs")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"specKey":"냉방성능(kW)","specValue":"5.6","unit":"kW","displayOrder":2}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.specKey").value("냉방성능(kW)"));

        mvc.perform(patch("/api/v1/products/MODEL_NAME_ONLY_01/specs/{specId}", spec.getId())
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"specValue":"1.3","unit":"kW"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.specValue").value("1.3"));

        mvc.perform(delete("/api/v1/products/MODEL_NAME_ONLY_01/specs/{specId}", spec.getId())
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isNoContent());
    }

    @Test
    void 완전_미존재_카탈로그_식별자는_404() throws Exception {
        mvc.perform(patch("/api/v1/products/NO_SUCH_MODEL/usage")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"usageScope":"ESTIMATE","estimateCategory":"OTHER"}
                                """))
                .andExpect(status().isNotFound());
    }

    // =========================================================================
    // PR-B (2026-06-11): 수동 override + DELETE usage + GET 필터 실효화 IT
    // =========================================================================

    /**
     * PATCH /usage — usageScopeManual=true 응답 포함.
     */
    @Test
    void PATCH_usage_수동override_usageScopeManual_true_응답() throws Exception {
        mvc.perform(patch("/api/v1/products/API_HOME_01/usage")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"usageScope":"PARTNER_ORDER"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usageScopeManual").value(true))
                .andExpect(jsonPath("$.usageScope").value("PARTNER_ORDER"))
                .andExpect(jsonPath("$.estimateCategory").isEmpty());
    }

    /**
     * DELETE /usage — 수동 override 해제 후 usageScopeManual=false 로 복귀.
     */
    @Test
    void DELETE_usage_수동override_해제() throws Exception {
        // 먼저 수동 override
        mvc.perform(patch("/api/v1/products/API_HOME_01/usage")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"usageScope":"ESTIMATE","estimateCategory":"HOME_MULTI"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usageScopeManual").value(true));

        // override 해제
        mvc.perform(delete("/api/v1/products/API_HOME_01/usage")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isNoContent());

        // 이후 GET 으로 플래그 확인
        mvc.perform(get("/api/v1/products?usageScope=ESTIMATE&category=HOME_MULTI")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk());
        // DB 에서 직접 확인 — usageScopeManual=false
        var p = productRepository.findByModelCodeAndIsDeletedFalse("API_HOME_01");
        org.assertj.core.api.Assertions.assertThat(p).isPresent();
        org.assertj.core.api.Assertions.assertThat(p.get().isUsageScopeManual()).isFalse();
    }

    /**
     * GET /api/v1/products?usageScope=PARTNER_ORDER — IN 확장 시멘틱 포함·배제 양면 단언.
     *
     * <p>지적 [24][25] (PR-B 2026-06-11):
     * PARTNER_ORDER 질의 시 BOTH 품목이 포함되어야 하고 (포함 단언),
     * ESTIMATE 품목은 배제되어야 한다 (배제 단언).
     * catalog 경로(/api/v1/products 풀패스) 왕복 검증.
     */
    @Test
    void GET_products_usageScope_PARTNER_ORDER_BOTH포함_단언_양면() throws Exception {
        Category cat2 = categoryRepository.save(Category.create("CAT-BOTH-TEST", "both test", null, 9));
        // PARTNER_ORDER 전용 품목
        productRepository.save(Product.seedFromSheet("PO Only", "PO_ONLY_01", cat2,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.PARTNER_ORDER, null));
        // ESTIMATE 전용 품목 — PARTNER_ORDER 질의에서 배제되어야 함
        productRepository.save(Product.seedFromSheet("EST Only", "EST_ONLY_01", cat2,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.ESTIMATE, EstimateCategory.HOME_MULTI));
        productRepository.flush();

        // API_HOME_01(BOTH) + PO_ONLY_01(PARTNER_ORDER) 포함 단언
        mvc.perform(get("/api/v1/products?usageScope=PARTNER_ORDER")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.modelCode == 'API_HOME_01')]").exists())   // BOTH 포함
                .andExpect(jsonPath("$.content[?(@.modelCode == 'PO_ONLY_01')]").exists())    // PARTNER_ORDER 포함
                .andExpect(jsonPath("$.content[?(@.modelCode == 'EST_ONLY_01')]").doesNotExist()); // ESTIMATE 배제
    }

    /**
     * GET /api/v1/products?usageScope=ESTIMATE — IN 확장 시멘틱 포함·배제 양면 단언.
     *
     * <p>지적 [24][25] (PR-B 2026-06-11):
     * ESTIMATE 질의 시 BOTH 품목이 포함되어야 하고 (포함 단언),
     * PARTNER_ORDER 전용 품목은 배제되어야 한다 (배제 단언).
     */
    @Test
    void GET_products_usageScope_ESTIMATE_BOTH포함_단언_양면() throws Exception {
        Category cat3 = categoryRepository.save(Category.create("CAT-EST-TEST", "est test", null, 10));
        productRepository.save(Product.seedFromSheet("PO Only", "PO_ONLY_02", cat3,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.PARTNER_ORDER, null));
        productRepository.save(Product.seedFromSheet("EST Only", "EST_ONLY_02", cat3,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.ESTIMATE, EstimateCategory.HOME_MULTI));
        productRepository.flush();

        mvc.perform(get("/api/v1/products?usageScope=ESTIMATE")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.modelCode == 'API_HOME_01')]").exists())    // BOTH 포함
                .andExpect(jsonPath("$.content[?(@.modelCode == 'EST_ONLY_02')]").exists())   // ESTIMATE 포함
                .andExpect(jsonPath("$.content[?(@.modelCode == 'PO_ONLY_02')]").doesNotExist()); // PARTNER_ORDER 배제
    }

    /**
     * GET /api/v1/products?q=PO_ONLY — catalog 경로 q 파라미터 검색 단언 (지적 [1][9][15]).
     */
    @Test
    void GET_products_q_파라미터_검색() throws Exception {
        Category cat4 = categoryRepository.save(Category.create("CAT-Q-TEST", "q test", null, 11));
        productRepository.save(Product.seedFromSheet("Q Test Product", "Q_SEARCH_MODEL", cat4,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI));
        productRepository.flush();

        // 모델코드 부분 일치
        mvc.perform(get("/api/v1/products?q=Q_SEARCH")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.modelCode == 'Q_SEARCH_MODEL')]").exists())
                .andExpect(jsonPath("$.content[?(@.modelCode == 'API_HOME_01')]").doesNotExist());
    }

    /**
     * P2-1: model_code 빈 레거시 품목 — modelName 으로 q 검색 가능 단언 (사이클2 지적 P2-1).
     *
     * <p>{@code model_code} 가 null/빈 경우 {@code ProductCatalogResponse.modelCode} 는
     * {@code model_name} fallback 으로 노출되므로 q 도 model_name 으로 검색 가능해야 한다.
     */
    @Test
    void GET_products_q_modelName_only_품목_검색_가능() throws Exception {
        Category cat = categoryRepository.save(Category.create("CAT-MNO", "model name only q", null, 12));
        // modelCode 없이 modelName 만 있는 레거시 품목
        Product legacyProduct = Product.create("레거시 냉난방기", "LEGACY_UNIT_X1", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, "KRW", Map.of(), null);
        legacyProduct.changeUsage(UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        productRepository.save(legacyProduct);
        productRepository.flush();

        // model_code 가 없고 model_name = "LEGACY_UNIT_X1" 인 품목이 q=LEGACY_UNIT 로 검색되어야 함
        mvc.perform(get("/api/v1/products?q=LEGACY_UNIT")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.modelCode == 'LEGACY_UNIT_X1')]").exists());
    }

    /**
     * P2-2: displayOrder 순서 보존 단언 (사이클2 지적 P2-2).
     *
     * <p>ORDER BY display_order ASC NULLS LAST, model_code ASC 로 결정적 순서를 보장.
     * displayOrder 낮은 품목이 앞에, null 이면 후순위.
     */
    @Test
    void GET_products_displayOrder_정렬_보장() throws Exception {
        Category cat = categoryRepository.save(Category.create("CAT-ORDER", "order test", null, 13));
        Product p1 = Product.seedFromSheet("Order First", "ORDER_FIRST", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        p1.changeDisplayOrder(1);
        Product p2 = Product.seedFromSheet("Order Second", "ORDER_SECOND", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        p2.changeDisplayOrder(2);
        Product p3 = Product.seedFromSheet("Order Null", "ORDER_NULL", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        // displayOrder null — NULLS LAST 이므로 p1, p2 뒤에
        productRepository.save(p1);
        productRepository.save(p2);
        productRepository.save(p3);
        productRepository.flush();

        mvc.perform(get("/api/v1/products?q=ORDER_")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                // 첫 번째 페이지에서 displayOrder=1 이 앞에 나와야 함
                .andExpect(jsonPath("$.content[0].modelCode").value("ORDER_FIRST"))
                .andExpect(jsonPath("$.content[1].modelCode").value("ORDER_SECOND"))
                .andExpect(jsonPath("$.content[2].modelCode").value("ORDER_NULL"));
    }

    /**
     * P3-4: q 파라미터 LIKE 와일드카드 이스케이프 단언 (사이클2 지적 P3-4).
     *
     * <p>{@code q=_} 처럼 SQL LIKE 와일드카드 문자가 포함된 검색어는 이스케이프 후 바인딩되어야
     * 예상치 않은 품목이 추가 조회되는 오동작을 방지한다. 이스케이프 미적용 시 {@code _} 는
     * 임의 단일 문자를 매칭하여 더 많은 결과를 반환한다.
     *
     * <p>검증 방식: {@code modelCode = "WC_USCR"} 를 생성하고 {@code q=WC_USCR} 로 검색.
     * 이스케이프 적용 시 {@code WC_USCR} 정확 패턴 검색으로 API_HOME_01(=WC?USCR 미매칭) 배제.
     * (jsonPath 필터의 '%' 파싱 오류 회피 — Jayway JsonPath 포맷 지시자 충돌)
     */
    @Test
    void GET_products_q_와일드카드_포함_검색_정상동작() throws Exception {
        Category cat = categoryRepository.save(Category.create("CAT-WC", "wildcard test", null, 14));
        productRepository.save(Product.seedFromSheet("Wildcard Underscore", "WC_USCR", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI));
        productRepository.flush();

        // '_' 포함 검색어 — 이스케이프 적용 시 WC_USCR 만 매칭. API_HOME_01 은 패턴 미매칭.
        mvc.perform(get("/api/v1/products?q=WC_USCR")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.modelCode == 'WC_USCR')]").exists())
                .andExpect(jsonPath("$.content[?(@.modelCode == 'API_HOME_01')]").doesNotExist());
    }

    /**
     * P3-1: modelCode 없는 품목 clearUsageOverride — evict no-op + NPE 없이 정상 완료 (사이클2 지적 P3-1).
     *
     * <p>modelCode 가 null 인 품목을 modelName 식별자로 override 해제할 때
     * evict 키가 null 이어서 캐시 miss 가 발생하지 않고 정상 처리되어야 한다.
     */
    @Test
    void DELETE_usage_modelCode_null_품목_정상처리() throws Exception {
        saveModelNameOnlyProduct("MC_NULL_EVICT_01");

        // PATCH — 수동 override
        mvc.perform(patch("/api/v1/products/MC_NULL_EVICT_01/usage")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"usageScope":"ESTIMATE","estimateCategory":"HOME_MULTI"}
                                """))
                .andExpect(status().isOk());

        // DELETE — override 해제. modelCode null 이어도 NPE 없이 204
        mvc.perform(delete("/api/v1/products/MC_NULL_EVICT_01/usage")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isNoContent());

        // DB 확인 — usageScopeManual=false
        productRepository.findByModelNameAndIsDeletedFalse("MC_NULL_EVICT_01")
                .ifPresent(p -> org.assertj.core.api.Assertions.assertThat(p.isUsageScopeManual()).isFalse());
    }

    private Product saveModelNameOnlyProduct(String modelName) {
        Category cat = categoryRepository.save(Category.create("CAT-" + modelName, "model name only", null, 2));
        Product product = Product.create("model name only", modelName, cat,
                BigDecimal.ZERO, BigDecimal.ZERO, "KRW", Map.of(), null);
        product.changeUsage(UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        Product saved = productRepository.save(product);
        productRepository.flush();
        return saved;
    }
}
