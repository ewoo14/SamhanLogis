package com.samhanair.logis.product.it;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** #773 S1c 고정DC율 productId internal lookup 통합 테스트. */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class ProductInternalControllerFixedDiscountIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN = "test-internal-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

    /** bulk 조회는 입력 productId 순서의 Map 으로 percent 공간 고정DC율을 반환한다. */
    @Test
    void fixedDiscountRateBulk_returnsPercentRateByProductId() throws Exception {
        Product multi = seedProduct("IT_FIXED_DC_MULTI", new BigDecimal("45.00"));
        Product old = seedProduct("IT_FIXED_DC_OLD", new BigDecimal("50.00"));
        productRepository.flush();

        mockMvc.perform(post("/products/internal/fixed-discount-rate-bulk")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "productIds":["%s","%s"]
                                }
                                """.formatted(multi.getId(), old.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data['%s'].fixedDiscountRate".formatted(multi.getId())).value(45.00))
                .andExpect(jsonPath("$.data['%s'].fixedDiscountRate".formatted(old.getId())).value(50.00));
    }

    /** 단건 조회도 productId 기준 percent 공간 고정DC율을 반환한다. */
    @Test
    void fixedDiscountRate_returnsPercentRateByProductId() throws Exception {
        Product product = seedProduct("IT_FIXED_DC_SINGLE_GET", new BigDecimal("45.00"));
        productRepository.flush();

        mockMvc.perform(get("/products/internal/fixed-discount-rate")
                        .queryParam("productId", product.getId().toString())
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fixedDiscountRate").value(45.00));
    }

    /** 반환값은 레거시 fixedDc 분수(0.45)가 아니라 expectRate 비교 공간인 45.00 percent 그대로다. */
    @Test
    void fixedDiscountRateBulk_returnsAlreadyMultipliedPercent_notFraction() throws Exception {
        Product product = seedProduct("IT_FIXED_DC_SCALE", new BigDecimal("45.00"));
        productRepository.flush();

        mockMvc.perform(post("/products/internal/fixed-discount-rate-bulk")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "productIds":["%s"]
                                }
                                """.formatted(product.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data['%s'].fixedDiscountRate".formatted(product.getId())).value(45.00));
    }

    /** fixed_discount_rate NULL 은 고정DC 미설정이라는 유효 상태로 200 + null record 를 반환한다. */
    @Test
    void fixedDiscountRateBulk_withNullRate_returnsNullRecord() throws Exception {
        Product product = seedProduct("IT_FIXED_DC_NULL", null);
        productRepository.flush();

        mockMvc.perform(post("/products/internal/fixed-discount-rate-bulk")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "productIds":["%s"]
                                }
                                """.formatted(product.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data['%s'].fixedDiscountRate".formatted(product.getId())).value(nullValue()));
    }

    /** productId 미존재만 404 이며 부분 응답 없이 실패한다. */
    @Test
    void fixedDiscountRateBulk_withMissingProductId_returns404() throws Exception {
        Product product = seedProduct("IT_FIXED_DC_MISSING", new BigDecimal("45.00"));
        UUID missingProductId = UUID.randomUUID();
        productRepository.flush();

        mockMvc.perform(post("/products/internal/fixed-discount-rate-bulk")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "productIds":["%s","%s"]
                                }
                                """.formatted(product.getId(), missingProductId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.data").value(nullValue()))
                .andExpect(jsonPath("$.message").value("고정DC율 조회 대상 품목을 찾을 수 없습니다"));
    }

    /** 단건 GET 조회도 productId 미존재 시 동일 메시지로 404 를 반환한다. */
    @Test
    void fixedDiscountRate_withMissingProductId_returns404() throws Exception {
        UUID missingProductId = UUID.randomUUID();

        mockMvc.perform(get("/products/internal/fixed-discount-rate")
                        .queryParam("productId", missingProductId.toString())
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.data").value(nullValue()))
                .andExpect(jsonPath("$.message").value("고정DC율 조회 대상 품목을 찾을 수 없습니다"));
    }

    /** bulk 요청 productIds 가 빈 리스트면 한글 커스텀 검증 메시지와 함께 400 을 반환한다. */
    @Test
    void fixedDiscountRateBulk_withEmptyProductIds_returns400() throws Exception {
        mockMvc.perform(post("/products/internal/fixed-discount-rate-bulk")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "productIds":[]
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("productIds는 필수입니다")));
    }

    /** bulk 요청 productIds 가 500 개를 초과하면 한글 커스텀 검증 메시지와 함께 400 을 반환한다. */
    @Test
    void fixedDiscountRateBulk_withTooManyProductIds_returns400() throws Exception {
        StringBuilder ids = new StringBuilder();
        for (int i = 0; i < 501; i++) {
            if (i > 0) {
                ids.append(',');
            }
            ids.append('"').append(UUID.randomUUID()).append('"');
        }

        mockMvc.perform(post("/products/internal/fixed-discount-rate-bulk")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productIds\":[" + ids + "]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("productIds는 최대 500개입니다")));
    }

    private Product seedProduct(String modelCode, BigDecimal fixedDiscountRate) {
        Category category = categoryRepository.save(Category.create("CAT-" + modelCode,
                "fixed discount IT", null, 70));
        Product product = Product.seedFromSheet("고정DC " + modelCode, modelCode, category,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        product.changeFixedDiscountRate(fixedDiscountRate);
        return productRepository.save(product);
    }
}
