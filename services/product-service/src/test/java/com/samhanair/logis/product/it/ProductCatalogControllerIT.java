package com.samhanair.logis.product.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
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
        mvc.perform(get("/api/v1/products?usageScope=BOTH&category=HOME_MULTI"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.modelCode == 'API_HOME_01')]").exists());
    }

    @Test
    void PATCH_usage_admin_변경() throws Exception {
        mvc.perform(patch("/api/v1/products/API_HOME_01/usage")
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
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"specKey":"냉방성능(kW)","specValue":"5.6","unit":"kW","displayOrder":1}
                                """))
                .andExpect(status().isCreated());

        mvc.perform(post("/api/v1/products/API_HOME_01/specs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"specKey":"냉방성능(kW)","specValue":"6.0","unit":"kW"}
                                """))
                .andExpect(status().isConflict());
    }

    @Test
    void GET_spec_key_templates_카테고리_필터() throws Exception {
        mvc.perform(get("/api/v1/spec-key-templates?category=HOME_MULTI"))
                .andExpect(status().isOk())
                // V4 SQL 시드된 14 row 중 일부 확인
                .andExpect(jsonPath("$[?(@.specKey == '배관경')]").exists())
                .andExpect(jsonPath("$[?(@.specKey == '냉매가스')]").exists());
    }
}
