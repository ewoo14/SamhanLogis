package com.samhanair.logis.product.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Classification;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ClassificationRepository;
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

/** F1-a Classification 마스터 CRUD IT. */
@SpringBootTest
@DirtiesContext
@WithMockUser(username = "classification-admin")
@Transactional
class ClassificationControllerIT extends AbstractPostgresIT {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private ClassificationRepository classificationRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

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
    }

    @Test
    void CRUD_계층조회는_부모의_자식만_반환하고_순서변경된다() throws Exception {
        mvc.perform(post("/api/v1/classifications")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"estimateCategory":"HOME_MULTI","catLevel":"L","name":"판넬","displayOrder":2,"active":true}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("판넬"));
        Classification catL = classificationRepository
                .findByEstimateCategoryAndCatLevelAndNameAndIsDeletedFalse(
                        EstimateCategory.HOME_MULTI, Classification.CatLevel.L, "판넬")
                .orElseThrow();

        mvc.perform(post("/api/v1/classifications")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"estimateCategory":"HOME_MULTI","catLevel":"M","parentId":"%s","name":"공기청정 WIFI","displayOrder":3,"active":true}
                                """.formatted(catL.getId())))
                .andExpect(status().isCreated());

        mvc.perform(patch("/api/v1/classifications/{id}", catL.getId())
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"displayOrder":1}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayOrder").value(1));

        mvc.perform(get("/api/v1/classifications?estimateCategory=HOME_MULTI&parentId={id}", catL.getId())
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("공기청정 WIFI"));
    }

    @Test
    void DELETE_사용중인_분류는_400으로_차단한다() throws Exception {
        Classification catL = classificationRepository.save(Classification.create(
                EstimateCategory.HOME_MULTI, Classification.CatLevel.L, null, "판넬", 1, true));
        Category category = categoryRepository.save(Category.create("CLASS-BLOCK", "classification block", null, 1));
        Product product = Product.seedFromSheet("판넬 사용 품목", "CLASS_USED_01", category,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        product.changeClassifications(catL, null, null);
        productRepository.saveAndFlush(product);

        mvc.perform(delete("/api/v1/classifications/{id}", catL.getId())
                        .header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("사용 중")));
    }

    @Test
    void 분류에_정액할인율을_지정하면_응답에_반영된다() throws Exception {
        Classification catL = classificationRepository.save(Classification.create(
                EstimateCategory.HOME_MULTI, Classification.CatLevel.L, null, "정액 정책", 1, true));

        mvc.perform(patch("/api/v1/classifications/{id}/fixed-discount", catL.getId())
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fixedDiscountRate\":\"5\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fixedDiscountRate").value(5));
    }
}
