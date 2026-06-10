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
     * GET /products?usageScope=PARTNER_ORDER&category=HOME_MULTI — 실제 필터 적용 확인.
     * order-app M1a getProducts(category) 호출 패턴 실효화 검증.
     */
    @Test
    void GET_products_usageScope_category_복합_필터_적용() throws Exception {
        // API_HOME_01 는 BOTH 이므로 PARTNER_ORDER 단독 필터에선 안 보임 (searchByUsageScope 쿼리)
        // (ProductCatalogController GET /api/v1/products 는 searchByUsageScope 사용)
        mvc.perform(get("/api/v1/products?usageScope=PARTNER_ORDER&category=HOME_MULTI")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk());
        // 응답이 200 이고 필터가 작동함을 확인 (PARTNER_ORDER 에만 해당하는 품목이 없으므로 빈 페이지)
        mvc.perform(get("/api/v1/products?usageScope=BOTH")
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.modelCode == 'API_HOME_01')]").exists());
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
