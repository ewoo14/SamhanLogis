package com.samhanair.logis.product.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Classification;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductEstimateExposure;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ClassificationRepository;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.ProductSpecRepository;
import com.samhanair.logis.product.web.dto.OpaqueUuidSerializer;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

/** 7 카탈로그 endpoint smoke + usageScope 필터 IT. */
@SpringBootTest
@DirtiesContext
@WithMockUser(username = "test-user")
@Transactional
class ProductCatalogControllerIT extends AbstractPostgresIT {

    private static final String UUID_REGEX =
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ClassificationRepository classificationRepository;

    @Autowired
    private ProductSpecRepository productSpecRepository;

    @Autowired
    private ProductEstimateExposureRepository exposureRepository;

    @Autowired
    private BundleComponentRepository bundleComponentRepository;

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
        Product apiHome = productRepository.save(Product.seedFromSheet("API-Home", "API_HOME_01", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI));
        persistExposure(apiHome, EstimateCategory.HOME_MULTI, 1);
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
    void GET_products_physicalCategoryId와_검색어를_AND로_필터하고_물리제품구분을_반환한다() throws Exception {
        Category targetCategory = categoryRepository.save(
                Category.create("CAT-PHYSICAL-TARGET", "물리 대상", null, 90));
        Category otherCategory = categoryRepository.save(
                Category.create("CAT-PHYSICAL-OTHER", "물리 다른 대상", null, 91));
        productRepository.save(Product.seedFromSheet(
                "물리 필터 대상", "PHYSICAL_FILTER_TARGET", targetCategory,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, null));
        productRepository.save(Product.seedFromSheet(
                "물리 필터 다른 대상", "PHYSICAL_FILTER_OTHER", otherCategory,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, null));
        productRepository.flush();

        mvc.perform(get("/api/v1/products")
                        .param("categoryId", targetCategory.getId().toString())
                        .param("q", "PHYSICAL_FILTER")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].modelCode").value("PHYSICAL_FILTER_TARGET"))
                .andExpect(jsonPath("$.content[0].physicalCategory.code").value("CAT-PHYSICAL-TARGET"))
                .andExpect(jsonPath("$.content[0].physicalCategory.name").value("물리 대상"));
    }

    @Test
    void POST_products_단종된_이름은_재사용할_수_있다() throws Exception {
        Category cat = categoryRepository.save(Category.create("CAT-DISCONTINUED-NAME", "단종 이름 재사용", null, 2));
        String userId = UUID.randomUUID().toString();
        String name = "외부 통신 모듈 MIM-N10";

        MvcResult discontinued = mvc.perform(post("/products")
                        .header("X-User-Id", userId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productCreateJson(name, "COMM-MIM-N10", cat.getId())))
                .andExpect(status().isCreated())
                .andReturn();
        String productId = com.jayway.jsonpath.JsonPath.read(
                discontinued.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.data.id");

        mvc.perform(post("/products/{id}/discontinue", productId)
                        .header("X-User-Id", userId))
                .andExpect(status().isNoContent());

        mvc.perform(post("/products")
                        .header("X-User-Id", userId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productCreateJson(name, "COMM-MIM-N10-REUSED", cat.getId())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.name").value(name));

        mvc.perform(post("/products/{id}/reactivate", productId)
                        .header("X-User-Id", userId))
                .andExpect(status().isConflict());
    }

    private String productCreateJson(String name, String modelName, UUID categoryId) {
        return """
                {
                  "name":"%s",
                  "modelName":"%s",
                  "categoryId":"%s",
                  "sellingPrice":0,
                  "purchasePrice":0,
                  "currency":"KRW",
                  "tags":{},
                  "itemKind":"GENERAL",
                  "productCategory":"HOME_MULTI",
                  "unit":"EA",
                  "goodsType":"GOODS"
                }
                """.formatted(name, modelName, categoryId);
    }

    @Test
    void PATCH_usage_admin_변경() throws Exception {
        mvc.perform(patch("/api/v1/products/API_HOME_01/usage")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"usageScope":"ESTIMATE","estimateCategories":["OTHER"]}
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
                                {"specKey":"냉방능력, kW","specValue":"5.6","unit":"kW","displayOrder":1}
                                """))
                .andExpect(status().isCreated());

        MvcResult duplicate = mvc.perform(post("/api/v1/products/API_HOME_01/specs")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"specKey":"냉방능력, kW","specValue":"6.0","unit":"kW"}
                                """))
                .andExpect(status().isConflict())
                .andReturn();

        String body = duplicate.getResponse().getContentAsString(StandardCharsets.UTF_8);
        org.assertj.core.api.Assertions.assertThat(body)
                .contains("\"code\":\"CONFLICT\"")
                .contains("\"message\":\"이미 존재하는 specKey: 냉방능력, kW\"");
    }

    @Test
    void POST_specs_specValue_null은_400_검증오류() throws Exception {
        MvcResult result = mvc.perform(post("/api/v1/products/API_HOME_01/specs")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"specKey":"전원선","specValue":null,"unit":"mm","displayOrder":1}
                                """))
                .andExpect(status().isBadRequest())
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        org.assertj.core.api.Assertions.assertThat(body)
                .contains("\"code\":\"INVALID_INPUT\"")
                .contains("specValue");
    }

    @Test
    void GET_spec_key_templates_카테고리_필터() throws Exception {
        mvc.perform(get("/api/v1/spec-key-templates?category=HOME_MULTI")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                // 사양 후속 #1 재시드 row 중 일부와 valueType 계약 확인
                .andExpect(jsonPath("$[?(@.specKey == '배관경')]").exists())
                .andExpect(jsonPath("$[?(@.specKey == '냉매가스')]").exists())
                .andExpect(jsonPath("$[?(@.specKey == '제품크기, mm')].valueType")
                        .value(org.hamcrest.Matchers.hasItem("DIMENSION")));
    }

    @Test
    void POST_products_specs_unit_저장_왕복() throws Exception {
        Category cat = categoryRepository.save(Category.create("CAT-SPEC-UNIT", "spec unit", null, 14));

        mvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"단위 왕복 테스트",
                                  "modelName":"SPEC_UNIT_ROUND_01",
                                  "categoryId":"%s",
                                  "sellingPrice":0,
                                  "purchasePrice":0,
                                  "currency":"KRW",
                                  "tags":{},
                                  "itemKind":"GENERAL",
                                  "productCategory":"HOME_MULTI",
                                  "unit":"EA",
                                  "goodsType":"GOODS",
                                  "specs":[
                                    {"specKey":"냉방능력, kW","specValue":"6.0","unit":"kW"},
                                    {"specKey":"제품크기, mm","specValue":"947x365x947","unit":"mm"}
                                  ]
                                }
                                """.formatted(cat.getId())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.specs[0].specKey").value("냉방능력, kW"))
                .andExpect(jsonPath("$.data.specs[0].unit").value("kW"))
                .andExpect(jsonPath("$.data.specs[1].specValue").value("947x365x947"))
                .andExpect(jsonPath("$.data.specs[1].unit").value("mm"));
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
                                {"usageScope":"ESTIMATE","estimateCategories":["OTHER"]}
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
                                {"specKey":"냉방능력, kW","specValue":"5.6","unit":"kW","displayOrder":2}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.specKey").value("냉방능력, kW"));

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
                                {"usageScope":"ESTIMATE","estimateCategories":["OTHER"]}
                                """))
                .andExpect(status().isNotFound());
    }

    @Test
    void PATCH_specs_미존재_specId_응답은_uuid를_노출하지_않는다() throws Exception {
        UUID missingSpecId = UUID.randomUUID();

        MvcResult result = mvc.perform(patch("/api/v1/products/API_HOME_01/specs/{specId}", missingSpecId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"specValue":"1.3","unit":"kW"}
                                """))
                .andExpect(status().isNotFound())
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        org.assertj.core.api.Assertions.assertThat(body)
                .contains("\"message\":\"ProductSpec 없음\"")
                .doesNotContainPattern(UUID_REGEX);
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
                                {"usageScope":"ESTIMATE","estimateCategories":["HOME_MULTI"]}
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
     * PATCH /variable-discount — 변동DC 수동 override 설정 후 응답에 manual=true 포함.
     */
    @Test
    void PATCH_variableDiscount_수동override_variableDiscountManual_true_응답() throws Exception {
        mvc.perform(patch("/api/v1/products/API_HOME_01/variable-discount")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"hasVariableDiscount":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasVariableDiscount").value(true))
                .andExpect(jsonPath("$.variableDiscountManual").value(true));
    }

    /**
     * DELETE /variable-discount — 수동 override 해제 후 variableDiscountManual=false 로 복귀.
     */
    @Test
    void DELETE_variableDiscount_수동override_해제() throws Exception {
        mvc.perform(patch("/api/v1/products/API_HOME_01/variable-discount")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"hasVariableDiscount":false}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasVariableDiscount").value(false))
                .andExpect(jsonPath("$.variableDiscountManual").value(true));

        mvc.perform(delete("/api/v1/products/API_HOME_01/variable-discount")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isNoContent());

        var p = productRepository.findByModelCodeAndIsDeletedFalse("API_HOME_01");
        org.assertj.core.api.Assertions.assertThat(p).isPresent();
        org.assertj.core.api.Assertions.assertThat(p.get().isVariableDiscountManual()).isFalse();
        org.assertj.core.api.Assertions.assertThat(p.get().getHasVariableDiscount()).isFalse();
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
        Product p2 = Product.seedFromSheet("Order Second", "ORDER_SECOND", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        Product p3 = Product.seedFromSheet("Order Null", "ORDER_NULL", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        // displayOrder null — NULLS LAST 이므로 p1, p2 뒤에
        Product savedP1 = productRepository.save(p1);
        Product savedP2 = productRepository.save(p2);
        Product savedP3 = productRepository.save(p3);
        persistExposure(savedP1, EstimateCategory.HOME_MULTI, 1);
        persistExposure(savedP2, EstimateCategory.HOME_MULTI, 2);
        persistExposure(savedP3, EstimateCategory.HOME_MULTI, null);
        productRepository.flush();

        mvc.perform(get("/api/v1/products?category=HOME_MULTI&q=ORDER_")
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
                                {"usageScope":"ESTIMATE","estimateCategories":["HOME_MULTI"]}
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

    /**
     * §2-1: PUT /api/v1/products/display-orders — 다른 카테고리 혼합 시 400 INVALID_INPUT.
     *
     * <p>displayOrder 는 카테고리 내 정렬 ({@code findExposedCatalog} 소비) 이므로
     * 전역 재번호(다른 카테고리 혼합) 는 금지. 혼합 시 400 응답.
     */
    @Test
    void PUT_display_orders_다른_카테고리_혼합_400() throws Exception {
        Category catM = categoryRepository.save(Category.create("CAT-MIX-M", "mix test M", null, 20));
        Category catS = categoryRepository.save(Category.create("CAT-MIX-S", "mix test S", null, 21));
        productRepository.save(Product.seedFromSheet("Mix Home", "MIX_HOME_01", catM,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI));
        productRepository.save(Product.seedFromSheet("Mix Single", "MIX_SINGLE_01", catS,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.SINGLE_SET, UsageScope.BOTH, null));
        productRepository.flush();

        mvc.perform(put("/api/v1/products/display-orders")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                [
                                  {"modelCode":"MIX_HOME_01","estimateCategory":"HOME_MULTI","displayOrder":1},
                                  {"modelCode":"MIX_SINGLE_01","estimateCategory":"SINGLE_SET","displayOrder":2}
                                ]
                                """))
                .andExpect(status().isBadRequest());
    }

    // =========================================================================
    // [B+componentCount] (2026-06-11) — 구성품 CRUD + componentCount 실-HTTP 회귀
    // =========================================================================

    /**
     * (a) GET /api/v1/products/{code}/components — BUNDLE 구성품 목록 200 + displayOrder 1-based.
     */
    @Test
    void GET_components_BUNDLE_구성품_목록_displayOrder_1based() throws Exception {
        seedBundleWithComponents("BNDL_GET_01", "GET_IDU_01", "GET_ODU_01");

        mvc.perform(get("/api/v1/products/BNDL_GET_01/components")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].componentProductCode").value("GET_IDU_01"))
                .andExpect(jsonPath("$[0].displayOrder").value(1))
                .andExpect(jsonPath("$[1].componentProductCode").value("GET_ODU_01"))
                .andExpect(jsonPath("$[1].displayOrder").value(2));
    }

    /**
     * (b) PUT replace-all 왕복 후 GET 재조회 정합 (순서/필드).
     */
    @Test
    void PUT_components_replace_all_왕복_GET_재조회_정합() throws Exception {
        // 부모 BUNDLE + 구성 후보 2종 시드 (초기 구성품은 없음)
        seedBundleParent("BNDL_PUT_01");
        seedComponentProduct("PUT_IDU_01", "실내기 PUT");
        seedComponentProduct("PUT_ODU_01", "실외기 PUT");
        productRepository.flush();

        mvc.perform(put("/api/v1/products/BNDL_PUT_01/components")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                [
                                  {"componentProductCode":"PUT_ODU_01","defaultQty":1,"qtyMode":"FOLLOW_SET",
                                   "componentKind":"OUTDOOR","isDefault":true,"specText":"규격O"},
                                  {"componentProductCode":"PUT_IDU_01","defaultQty":2,"qtyMode":"FIXED",
                                   "componentKind":"INDOOR","isDefault":false,"specText":"규격I"}
                                ]
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].componentProductCode").value("PUT_IDU_01"))
                .andExpect(jsonPath("$[0].displayOrder").value(1))
                .andExpect(jsonPath("$[1].componentProductCode").value("PUT_ODU_01"))
                .andExpect(jsonPath("$[1].displayOrder").value(2));

        // GET 재조회 — 순서/필드 왕복 정합 단언
        // (defaultQty 는 DB NUMERIC(5,2) 재읽기로 scale 이 붙어(2.00 등) JSON 숫자 타입 비교가
        //  취약하므로 comparesEqualTo(BigDecimal) 로 단언. 구조/순서 필드는 그대로 단언.)
        mvc.perform(get("/api/v1/products/BNDL_PUT_01/components")
                .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].componentProductCode").value("PUT_IDU_01"))
                .andExpect(jsonPath("$[0].displayOrder").value(1))
                .andExpect(jsonPath("$[0].componentKind").value("INDOOR"))
                .andExpect(jsonPath("$[0].defaultQty").value(2.0))
                .andExpect(jsonPath("$[0].qtyMode").value("FIXED"))
                .andExpect(jsonPath("$[0].specText").value("규격I"))
                .andExpect(jsonPath("$[1].componentProductCode").value("PUT_ODU_01"))
                .andExpect(jsonPath("$[1].displayOrder").value(2))
                .andExpect(jsonPath("$[1].componentKind").value("OUTDOOR"))
                // DB NUMERIC(5,2) 재읽기 → JSON 1.00 (json-smart Double 1.0)
                .andExpect(jsonPath("$[1].defaultQty").value(1.0))
                .andExpect(jsonPath("$[1].isDefault").value(true))
                .andExpect(jsonPath("$[1].specText").value("규격O"));
    }

    /**
     * (c) 비-BUNDLE PUT → 409 CONFLICT.
     */
    @Test
    void PUT_components_비BUNDLE_409() throws Exception {
        // API_HOME_01 은 setupMvc 에서 SINGLE 로 시드됨
        seedComponentProduct("C_IDU_01", "실내기 C");
        productRepository.flush();

        mvc.perform(put("/api/v1/products/API_HOME_01/components")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                [{"componentProductCode":"C_IDU_01","defaultQty":1,"qtyMode":"FOLLOW_SET",
                                  "componentKind":"INDOOR","isDefault":true}]
                                """))
                .andExpect(status().isConflict());
    }

    /**
     * (d-1) 자기참조 구성품 PUT → 400 BAD_REQUEST.
     */
    @Test
    void PUT_components_자기참조_400() throws Exception {
        seedBundleParent("BNDL_SELF_01");
        productRepository.flush();

        mvc.perform(put("/api/v1/products/BNDL_SELF_01/components")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                [{"componentProductCode":"BNDL_SELF_01","defaultQty":1,"qtyMode":"FOLLOW_SET",
                                  "componentKind":"ACCESSORY","isDefault":false}]
                                """))
                .andExpect(status().isBadRequest());
    }

    /**
     * (d-2) 중복 componentProductCode PUT → 400 BAD_REQUEST.
     */
    @Test
    void PUT_components_중복코드_400() throws Exception {
        seedBundleParent("BNDL_DUP_01");
        seedComponentProduct("DUP_IDU_01", "실내기 DUP");
        productRepository.flush();

        mvc.perform(put("/api/v1/products/BNDL_DUP_01/components")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                [
                                  {"componentProductCode":"DUP_IDU_01","defaultQty":1,"qtyMode":"FOLLOW_SET",
                                   "componentKind":"INDOOR","isDefault":true},
                                  {"componentProductCode":"DUP_IDU_01","defaultQty":2,"qtyMode":"FOLLOW_SET",
                                   "componentKind":"INDOOR","isDefault":false}
                                ]
                                """))
                .andExpect(status().isBadRequest());
    }

    /**
     * (d-3) 미해소 구성코드(model_code 없는 행) PUT → 400 BAD_REQUEST.
     *
     * <p>[A] fix: 해소 검증은 modelCode-only(expander 와 동일 축). model_name 만 있는
     * 레거시 행을 구성품으로 지정하면 전개 시 못 찾으므로 사전 400 거부한다.
     */
    @Test
    void PUT_components_미해소코드_400() throws Exception {
        seedBundleParent("BNDL_UNRES_01");
        // model_code 없이 model_name 만 있는 레거시 품목 (modelCode-only 검증에서 미해소)
        Category cat = categoryRepository.save(Category.create("CAT-UNRES", "unres", null, 31));
        Product legacy = Product.create("레거시 실내기", "UNRES_NAME_ONLY_01", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, "KRW", Map.of(), null);
        legacy.changeUsage(UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        productRepository.save(legacy);
        productRepository.flush();

        mvc.perform(put("/api/v1/products/BNDL_UNRES_01/components")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                [{"componentProductCode":"UNRES_NAME_ONLY_01","defaultQty":1,"qtyMode":"FOLLOW_SET",
                                  "componentKind":"INDOOR","isDefault":true}]
                                """))
                .andExpect(status().isBadRequest());
    }

    /**
     * (e) GET /api/v1/products 응답 componentCount 실값 (벌크 projection 실 SQL 실행) 단언.
     */
    @Test
    void GET_products_componentCount_실값_단언() throws Exception {
        seedBundleWithComponents("BNDL_CNT_01", "CNT_IDU_01", "CNT_ODU_01");

        // BUNDLE 품목은 componentCount=2, SINGLE 품목(API_HOME_01)은 0.
        // 필터 jsonPath 는 indefinite path → JSONArray 반환이므로 hasItem 매처로 단언.
        mvc.perform(get("/api/v1/products?usageScope=BOTH&category=HOME_MULTI")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.modelCode == 'BNDL_CNT_01')].componentCount",
                        org.hamcrest.Matchers.hasItem(2)))
                .andExpect(jsonPath("$.content[?(@.modelCode == 'API_HOME_01')].componentCount",
                        org.hamcrest.Matchers.hasItem(0)));
    }

    /**
     * (f) 동일코드 유지 편집(soft-delete→flush→INSERT 부분 유니크) 200 + 재조회.
     *
     * <p>P1-D: 동일 component_product_code 를 유지한 채 수량만 변경하면
     * 기존 active 행 soft-delete 후 동일 코드 재INSERT 가 발생한다. 부분 유니크 인덱스
     * (bundle_product_id, component_product_code, is_deleted=false) 위반 없이 200 으로 통과해야 한다.
     */
    @Test
    void PUT_components_동일코드_유지_편집_200_재조회() throws Exception {
        seedBundleWithComponents("BNDL_SAME_01", "SAME_IDU_01", "SAME_ODU_01");

        // 동일 코드(SAME_IDU_01, SAME_ODU_01) 유지하되 수량/순서 변경
        mvc.perform(put("/api/v1/products/BNDL_SAME_01/components")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                [
                                  {"componentProductCode":"SAME_IDU_01","defaultQty":5,"qtyMode":"FOLLOW_SET",
                                   "componentKind":"INDOOR","isDefault":true},
                                  {"componentProductCode":"SAME_ODU_01","defaultQty":3,"qtyMode":"FOLLOW_SET",
                                   "componentKind":"OUTDOOR","isDefault":true}
                                ]
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].componentProductCode").value("SAME_IDU_01"))
                // PUT 응답은 갓 저장한 엔티티(스케일0 BigDecimal) → JSON 정수 5
                .andExpect(jsonPath("$[0].defaultQty").value(5));

        // 재조회 — active 행이 정확히 2개(중복 active 없음) + 변경 수량 반영.
        // DB NUMERIC(5,2) 재읽기 → JSON 5.00/3.00 (json-smart Double)
        mvc.perform(get("/api/v1/products/BNDL_SAME_01/components")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].componentProductCode").value("SAME_IDU_01"))
                .andExpect(jsonPath("$[0].defaultQty").value(5.0))
                .andExpect(jsonPath("$[1].componentProductCode").value("SAME_ODU_01"))
                .andExpect(jsonPath("$[1].defaultQty").value(3.0));
    }

    /**
     * (g) #1 박제: PUT components 요소 제약(@DecimalMax 999.99) 위반 → 400 (500 아님).
     *
     * <p>클래스 레벨 {@code @Validated} + {@code @Valid @RequestBody List<DTO>} 라서 요소의
     * {@code @DecimalMax("999.99")} 위반은 {@code jakarta.validation.ConstraintViolationException}
     * 으로 throw 된다. GlobalExceptionHandler 에 핸들러가 없으면 catch-all 500 으로 위장되므로
     * 400 단언으로 K-fix 완결을 박제한다(defaultQty=1000.00 → NUMERIC(5,2) 상한 초과).
     */
    @Test
    void PUT_components_defaultQty_상한초과_400() throws Exception {
        seedBundleParent("BNDL_MAXQTY_01");
        seedComponentProduct("MAXQTY_IDU_01", "실내기 MAXQTY");
        productRepository.flush();

        mvc.perform(put("/api/v1/products/BNDL_MAXQTY_01/components")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                [{"componentProductCode":"MAXQTY_IDU_01","defaultQty":1000.00,"qtyMode":"FOLLOW_SET",
                                  "componentKind":"INDOOR","isDefault":true}]
                                """))
                .andExpect(status().isBadRequest());
    }

    /**
     * (h) #18 PUT /display-orders happy-path: 동일 estimateCategory 2건 → 204 →
     * display_order DB 반영 단언 + GET /api/v1/products 순서 역전 단언.
     *
     * <p>m1(처음 displayOrder=10), m2(처음 displayOrder=20) 을 시드한 뒤
     * 카테고리 전체 활성 노출(API_HOME_01 포함)을 PUT 으로 전송한다.
     * 그중 DOHP_ 두 품목은 [{m2,1},{m1,2}] 로 순서를 역전시키고,
     * DB display_order 값과 목록 순서(m2 먼저)를 단언한다.
     */
    @Test
    void PUT_display_orders_정상경로_204_DB반영_및_목록순서_역전() throws Exception {
        Category cat = categoryRepository.save(Category.create("CAT-DOHP", "display-order happy", null, 22));
        Product m1 = Product.seedFromSheet("표시순서 M1", "DOHP_M1", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        Product m2 = Product.seedFromSheet("표시순서 M2", "DOHP_M2", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        Product savedM1 = productRepository.save(m1);
        Product savedM2 = productRepository.save(m2);
        persistExposure(savedM1, EstimateCategory.HOME_MULTI, 10);
        persistExposure(savedM2, EstimateCategory.HOME_MULTI, 20);
        productRepository.flush();

        // PUT 순서 역전: m2→1, m1→2, API_HOME_01→3 (대상 카테고리 전체 활성 노출 포함)
        mvc.perform(put("/api/v1/products/display-orders")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                [
                                  {"modelCode":"DOHP_M2","estimateCategory":"HOME_MULTI","displayOrder":1},
                                  {"modelCode":"DOHP_M1","estimateCategory":"HOME_MULTI","displayOrder":2},
                                  {"modelCode":"API_HOME_01","estimateCategory":"HOME_MULTI","displayOrder":3}
                                ]
                                """))
                .andExpect(status().isNoContent());

        // DB display_order 값 단언
        productRepository.flush();
        var m1After = productRepository.findByModelCodeAndIsDeletedFalse("DOHP_M1");
        var m2After = productRepository.findByModelCodeAndIsDeletedFalse("DOHP_M2");
        org.assertj.core.api.Assertions.assertThat(m1After).isPresent();
        org.assertj.core.api.Assertions.assertThat(m2After).isPresent();
        var m1Exposure = exposureRepository
                .findByProductIdAndEstimateCategoryAndIsDeletedFalse(m1After.get().getId(), EstimateCategory.HOME_MULTI);
        var m2Exposure = exposureRepository
                .findByProductIdAndEstimateCategoryAndIsDeletedFalse(m2After.get().getId(), EstimateCategory.HOME_MULTI);
        org.assertj.core.api.Assertions.assertThat(m1Exposure).isPresent();
        org.assertj.core.api.Assertions.assertThat(m2Exposure).isPresent();
        org.assertj.core.api.Assertions.assertThat(m1Exposure.get().getDisplayOrder()).isEqualTo(2);
        org.assertj.core.api.Assertions.assertThat(m2Exposure.get().getDisplayOrder()).isEqualTo(1);

        // GET /api/v1/products 순서 역전 단언 — q=DOHP_ 로 좁혀 결정적 검증 (m2 먼저, m1 나중)
        mvc.perform(get("/api/v1/products?category=HOME_MULTI&q=DOHP_")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].modelCode").value("DOHP_M2"))
                .andExpect(jsonPath("$.content[1].modelCode").value("DOHP_M1"));
    }

    /**
     * (i) #18 PUT /display-orders 부분 요청 가드: 동일 카테고리 활성 노출 일부만 전송하면 400.
     *
     * <p>setupMvc 의 API_HOME_01 이 같은 HOME_MULTI 활성 노출이므로, DOPART 두 건만 보내면
     * 대상 카테고리 전체 활성 노출 집합과 불일치하여 거부되어야 한다.
     */
    @Test
    void PUT_display_orders_부분요청_400() throws Exception {
        Category cat = categoryRepository.save(Category.create("CAT-DOPART", "display-order partial", null, 23));
        Product m1 = Product.seedFromSheet("표시순서 부분 M1", "DOPART_M1", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        Product m2 = Product.seedFromSheet("표시순서 부분 M2", "DOPART_M2", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        Product savedM1 = productRepository.save(m1);
        Product savedM2 = productRepository.save(m2);
        persistExposure(savedM1, EstimateCategory.HOME_MULTI, 10);
        persistExposure(savedM2, EstimateCategory.HOME_MULTI, 20);
        productRepository.flush();

        mvc.perform(put("/api/v1/products/display-orders")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                [
                                  {"modelCode":"DOPART_M2","estimateCategory":"HOME_MULTI","displayOrder":1},
                                  {"modelCode":"DOPART_M1","estimateCategory":"HOME_MULTI","displayOrder":2}
                                ]
                                """))
                .andExpect(status().isBadRequest());
    }

    /**
     * (j) #18 D-PCE-09 회귀: 같은 카테고리에 활성 노출은 있지만 usageScope=NONE 인 품목은
     * display-orders 전체 전송 모수에서 제외한다.
     *
     * <p>FE 는 reorder 입력을 {@code usageScope !== 'NONE'} 품목으로만 구성한다. 따라서
     * HOME_MULTI 활성 노출 테이블에 NONE 품목이 남아 있어도, 노출 가능 품목(API_HOME_01,
     * DOSCOPE_*) 전체만 보내면 204 로 통과해야 한다. 노출 가능 범위는
     * ESTIMATE/BOTH/PARTNER_ORDER 전체를 포함한다.
     */
    @Test
    void PUT_display_orders_usageScope_NONE_활성노출은_전체모수에서_제외_204() throws Exception {
        Category cat = categoryRepository.save(Category.create("CAT-DOSCOPE", "display-order scope", null, 24));
        Product m1 = Product.seedFromSheet("표시순서 scope M1", "DOSCOPE_M1", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.ESTIMATE, EstimateCategory.HOME_MULTI);
        Product m2 = Product.seedFromSheet("표시순서 scope M2", "DOSCOPE_M2", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        Product m3 = Product.seedFromSheet("표시순서 scope PARTNER", "DOSCOPE_PO", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.PARTNER_ORDER, EstimateCategory.HOME_MULTI);
        Product none = Product.seedFromSheet("표시순서 scope NONE", "DOSCOPE_NONE", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.NONE, EstimateCategory.HOME_MULTI);
        Product savedM1 = productRepository.save(m1);
        Product savedM2 = productRepository.save(m2);
        Product savedM3 = productRepository.save(m3);
        Product savedNone = productRepository.save(none);
        persistExposure(savedM1, EstimateCategory.HOME_MULTI, 10);
        persistExposure(savedM2, EstimateCategory.HOME_MULTI, 20);
        persistExposure(savedM3, EstimateCategory.HOME_MULTI, 30);
        persistExposure(savedNone, EstimateCategory.HOME_MULTI, 40);
        productRepository.flush();

        mvc.perform(put("/api/v1/products/display-orders")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                [
                                  {"modelCode":"DOSCOPE_M2","estimateCategory":"HOME_MULTI","displayOrder":1},
                                  {"modelCode":"DOSCOPE_M1","estimateCategory":"HOME_MULTI","displayOrder":2},
                                  {"modelCode":"DOSCOPE_PO","estimateCategory":"HOME_MULTI","displayOrder":3},
                                  {"modelCode":"API_HOME_01","estimateCategory":"HOME_MULTI","displayOrder":4}
                                ]
                                """))
                .andExpect(status().isNoContent());
    }

    // F1-a classification PATCH IT

    @Test
    void PATCH_classification_FE바디로_분류만_저장한다() throws Exception {
        Classification catL = classificationRepository.save(Classification.create(
                EstimateCategory.HOME_MULTI, Classification.CatLevel.L, null, "실내기", 1, true));
        Classification catM = classificationRepository.save(Classification.create(
                EstimateCategory.HOME_MULTI, Classification.CatLevel.M, catL, "벽걸이", 1, true));
        Classification catS = classificationRepository.save(Classification.create(
                EstimateCategory.HOME_MULTI, Classification.CatLevel.S, catM, "기본형", 1, true));
        classificationRepository.flush();

        mvc.perform(patch("/api/v1/products/API_HOME_01/classification")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "catLId":"%s",
                                  "catMId":"%s",
                                  "catSId":"%s"
                                }
                                """.formatted(catL.getId(), catM.getId(), catS.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.catL.id").value(OpaqueUuidSerializer.encode(catL.getId())))
                .andExpect(jsonPath("$.catM.id").value(OpaqueUuidSerializer.encode(catM.getId())))
                .andExpect(jsonPath("$.catS.id").value(OpaqueUuidSerializer.encode(catS.getId())));

        Product product = productRepository.findByModelCodeAndIsDeletedFalse("API_HOME_01").orElseThrow();
        org.assertj.core.api.Assertions.assertThat(product.getCatL().getId()).isEqualTo(catL.getId());
        org.assertj.core.api.Assertions.assertThat(product.getCatM().getId()).isEqualTo(catM.getId());
        org.assertj.core.api.Assertions.assertThat(product.getCatS().getId()).isEqualTo(catS.getId());
        org.assertj.core.api.Assertions.assertThat(product.isClassificationManual()).isTrue();
        org.assertj.core.api.Assertions.assertThat(product.isFixedDiscountManual()).isFalse();
    }

    @Test
    void PATCH_fixedDiscount_분류와_독립적으로_null과_숫자를_저장한다() throws Exception {
        mvc.perform(patch("/api/v1/products/API_HOME_01/fixed-discount")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fixedDiscountRate":"7.25"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fixedDiscountRate").value(7.25));

        Product product = productRepository.findByModelCodeAndIsDeletedFalse("API_HOME_01").orElseThrow();
        org.assertj.core.api.Assertions.assertThat(product.getFixedDiscountRate()).isEqualByComparingTo("7.25");
        org.assertj.core.api.Assertions.assertThat(product.isFixedDiscountManual()).isTrue();
        org.assertj.core.api.Assertions.assertThat(product.isClassificationManual()).isFalse();

        mvc.perform(patch("/api/v1/products/API_HOME_01/fixed-discount")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fixedDiscountRate":null}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fixedDiscountRate").isEmpty());

        Product cleared = productRepository.findByModelCodeAndIsDeletedFalse("API_HOME_01").orElseThrow();
        org.assertj.core.api.Assertions.assertThat(cleared.getFixedDiscountRate()).isNull();
        org.assertj.core.api.Assertions.assertThat(cleared.isFixedDiscountManual()).isTrue();
    }

    @Test
    void PATCH_fixedDiscount_범위밖은_400() throws Exception {
        mvc.perform(patch("/api/v1/products/API_HOME_01/fixed-discount")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fixedDiscountRate":"100.01"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void PATCH_classification_부모계층이_맞지_않으면_400() throws Exception {
        Classification catL = classificationRepository.save(Classification.create(
                EstimateCategory.HOME_MULTI, Classification.CatLevel.L, null, "실내기", 1, true));
        Classification wrongL = classificationRepository.save(Classification.create(
                EstimateCategory.HOME_MULTI, Classification.CatLevel.L, null, "실외기", 2, true));
        Classification catM = classificationRepository.save(Classification.create(
                EstimateCategory.HOME_MULTI, Classification.CatLevel.M, wrongL, "다른 중분류", 1, true));
        classificationRepository.flush();

        mvc.perform(patch("/api/v1/products/API_HOME_01/classification")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "catLId":"%s",
                                  "catMId":"%s",
                                  "catSId":null
                                }
                                """.formatted(catL.getId(), catM.getId())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void PATCH_classification_중지분류는_400() throws Exception {
        Classification inactive = classificationRepository.save(Classification.create(
                EstimateCategory.HOME_MULTI, Classification.CatLevel.L, null, "중지 분류", 1, false));
        classificationRepository.flush();

        mvc.perform(patch("/api/v1/products/API_HOME_01/classification")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "catLId":"%s",
                                  "catMId":null,
                                  "catSId":null
                                }
                                """.formatted(inactive.getId())))
                .andExpect(status().isBadRequest());
    }

    // ── 시드 헬퍼 ───────────────────────────────────────────────────────────

    /** 부모 BUNDLE(EXPAND) 품목 1건 저장 (구성품 없음). category=HOME_MULTI, usage=BOTH. */
    private Product seedBundleParent(String modelCode) {
        Category cat = categoryRepository.save(Category.create("CAT-" + modelCode, "bundle parent", null, 30));
        Product parent = Product.seedFromSheet("세트 " + modelCode, modelCode, cat,
                BigDecimal.valueOf(1_000_000), BigDecimal.valueOf(800_000), ProductType.BUNDLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        parent.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        Product saved = productRepository.save(parent);
        persistExposure(saved, EstimateCategory.HOME_MULTI, 30);
        return saved;
    }

    /** 구성 후보 품목(SINGLE) 1건 저장 — model_code 채워진 정상 행(해소 가능). */
    private Product seedComponentProduct(String modelCode, String name) {
        Category cat = categoryRepository.save(Category.create("CAT-" + modelCode, "component", null, 30));
        Product comp = Product.seedFromSheet(name, modelCode, cat,
                BigDecimal.valueOf(300_000), BigDecimal.valueOf(250_000), ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        Product saved = productRepository.save(comp);
        persistExposure(saved, EstimateCategory.HOME_MULTI, 30);
        return saved;
    }

    /**
     * 부모 BUNDLE + 구성품 2건(displayOrder 1,2) 직접 INSERT 시드.
     *
     * <p>#19 판별성 강화: 삽입 순서를 displayOrder 와 <b>역순</b>으로 한다 —
     * ODU(displayOrder=2) 를 먼저 save 하고 IDU(displayOrder=1) 를 나중에 save.
     * 이렇게 하면 GET 의 {@code ORDER BY display_order} 가 누락될 경우 결과 [0] 이
     * 삽입 순서대로 ODU 가 되어 {@code GET[0]=IDU(displayOrder 1)} 단언이 즉시 실패한다
     * (삽입순=displayOrder 였던 기존 시드는 ORDER BY 부재를 검출하지 못했음).
     */
    private void seedBundleWithComponents(String parentCode, String idu, String odu) {
        Product parent = seedBundleParent(parentCode);
        seedComponentProduct(idu, "실내기 " + idu);
        seedComponentProduct(odu, "실외기 " + odu);
        productRepository.flush();

        // ODU 를 먼저 save 하되 displayOrder=2 (삽입순 != 표시순서)
        BundleComponent c2 = BundleComponent.seed(parent.getId(), odu,
                BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.OUTDOOR, null, true, "규격O");
        c2.changeDisplayOrder(2);
        bundleComponentRepository.save(c2);
        bundleComponentRepository.flush();

        // IDU 를 나중에 save 하되 displayOrder=1 → ORDER BY 부재 시 GET[0]=ODU 로 단언 실패
        BundleComponent c1 = BundleComponent.seed(parent.getId(), idu,
                BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.INDOOR, null, true, "규격I");
        c1.changeDisplayOrder(1);
        bundleComponentRepository.save(c1);
        bundleComponentRepository.flush();
    }

    private Product saveModelNameOnlyProduct(String modelName) {
        Category cat = categoryRepository.save(Category.create("CAT-" + modelName, "model name only", null, 2));
        Product product = Product.create("model name only", modelName, cat,
                BigDecimal.ZERO, BigDecimal.ZERO, "KRW", Map.of(), null);
        product.changeUsage(UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        Product saved = productRepository.save(product);
        persistExposure(saved, EstimateCategory.HOME_MULTI, 2);
        productRepository.flush();
        return saved;
    }

    private void persistExposure(Product product, EstimateCategory category, Integer displayOrder) {
        exposureRepository.save(ProductEstimateExposure.create(product.getId(), category, displayOrder));
        exposureRepository.flush();
    }
}
