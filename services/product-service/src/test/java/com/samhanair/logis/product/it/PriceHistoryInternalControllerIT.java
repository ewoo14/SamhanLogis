package com.samhanair.logis.product.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.PriceHistory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.PriceHistoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/** #773 S1a PriceHistory internal 적용 정가 endpoint 통합 테스트. */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
@WithMockUser(username = "price-history-internal-it")
@Transactional
class PriceHistoryInternalControllerIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN = "test-internal-token";
    private static final String UUID_REGEX =
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private PriceHistoryRepository priceHistoryRepository;

    /** GET applicable 은 asOf 기준 effectiveDate <= asOf 중 최신 인상 후 정가를 반환한다. */
    @Test
    void applicable_afterIncreaseDate_returnsLatestPrice() throws Exception {
        Product product = seedProduct("IT_PRICE_AFTER");
        seedPreAndPostIncreasePrices(product, "100000", "80000", "120000", "95000");
        productRepository.flush();
        priceHistoryRepository.flush();

        mockMvc.perform(get("/products/internal/price-history/applicable")
                        .queryParam("productId", product.getId().toString())
                        .queryParam("asOf", "2026-05-01")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.release").value(120000))
                .andExpect(jsonPath("$.data.delivery").value(95000))
                .andExpect(jsonPath("$.data.effectiveDate").value("2026-04-01"));
    }

    /** GET applicable 은 인상일 전 asOf 에서 2000-01-01 기준 인상 전 정가를 반환한다. */
    @Test
    void applicable_beforeIncreaseDate_returnsBaselinePrice() throws Exception {
        Product product = seedProduct("IT_PRICE_BEFORE");
        seedPreAndPostIncreasePrices(product, "100000", "80000", "120000", "95000");
        productRepository.flush();
        priceHistoryRepository.flush();

        mockMvc.perform(get("/products/internal/price-history/applicable")
                        .queryParam("productId", product.getId().toString())
                        .queryParam("asOf", "2026-03-31")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.release").value(100000))
                .andExpect(jsonPath("$.data.delivery").value(80000))
                .andExpect(jsonPath("$.data.effectiveDate").value("2000-01-01"));
    }

    /** GET applicable 은 적용 row 가 없으면 404 를 반환하되 응답 message 에 UUID 를 노출하지 않는다. */
    @Test
    void applicable_missingProductId_returns404WithoutUuidInMessage() throws Exception {
        UUID missingProductId = UUID.randomUUID();

        MvcResult result = mockMvc.perform(get("/products/internal/price-history/applicable")
                        .queryParam("productId", missingProductId.toString())
                        .queryParam("asOf", "2026-05-01")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("시점별 정가를 찾을 수 없습니다"))
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        org.assertj.core.api.Assertions.assertThat(body).doesNotContainPattern(UUID_REGEX);
    }

    /** POST applicable-bulk 는 요청 productId 순서의 Map 으로 각 품목의 인상 후 적용 정가를 반환한다. */
    @Test
    void applicableBulk_returnsLatestPriceMapForEachProduct() throws Exception {
        Product first = seedProduct("IT_PRICE_BULK_1");
        Product second = seedProduct("IT_PRICE_BULK_2");
        seedPreAndPostIncreasePrices(first, "100000", "80000", "120000", "95000");
        seedPreAndPostIncreasePrices(second, "200000", "160000", "240000", "190000");
        productRepository.flush();
        priceHistoryRepository.flush();

        mockMvc.perform(post("/products/internal/price-history/applicable-bulk")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "productIds":["%s","%s"],
                                  "asOf":"2026-05-01"
                                }
                                """.formatted(first.getId(), second.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data['%s'].release".formatted(first.getId())).value(120000))
                .andExpect(jsonPath("$.data['%s'].delivery".formatted(first.getId())).value(95000))
                .andExpect(jsonPath("$.data['%s'].effectiveDate".formatted(first.getId())).value("2026-04-01"))
                .andExpect(jsonPath("$.data['%s'].release".formatted(second.getId())).value(240000))
                .andExpect(jsonPath("$.data['%s'].delivery".formatted(second.getId())).value(190000))
                .andExpect(jsonPath("$.data['%s'].effectiveDate".formatted(second.getId())).value("2026-04-01"));
    }

    /** POST applicable-bulk 는 결측 productId 를 응답 Map 에서 생략하고 있는 것만 200 부분 Map 으로 반환한다. */
    @Test
    void applicableBulk_withMissingProductId_returnsPartialMapOmittingMissing() throws Exception {
        Product product = seedProduct("IT_PRICE_BULK_MISSING");
        UUID missingProductId = UUID.randomUUID();
        seedPreAndPostIncreasePrices(product, "100000", "80000", "120000", "95000");
        productRepository.flush();
        priceHistoryRepository.flush();

        mockMvc.perform(post("/products/internal/price-history/applicable-bulk")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "productIds":["%s","%s"],
                                  "asOf":"2026-05-01"
                                }
                                """.formatted(product.getId(), missingProductId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data['%s'].release".formatted(product.getId())).value(120000))
                .andExpect(jsonPath("$.data['%s'].delivery".formatted(product.getId())).value(95000))
                .andExpect(jsonPath("$.data['%s']".formatted(missingProductId)).doesNotExist());
    }

    /** POST applicable-bulk 혼합 배치(있는 것 2건 + 없는 것 1건)는 있는 것만 부분 Map 으로 반환한다. */
    @Test
    void applicableBulk_mixedBatch_returnsOnlyExistingEntries() throws Exception {
        Product first = seedProduct("IT_PRICE_BULK_MIXED_1");
        Product second = seedProduct("IT_PRICE_BULK_MIXED_2");
        UUID missingProductId = UUID.randomUUID();
        seedPreAndPostIncreasePrices(first, "100000", "80000", "120000", "95000");
        seedPreAndPostIncreasePrices(second, "200000", "160000", "240000", "190000");
        productRepository.flush();
        priceHistoryRepository.flush();

        mockMvc.perform(post("/products/internal/price-history/applicable-bulk")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "productIds":["%s","%s","%s"],
                                  "asOf":"2026-05-01"
                                }
                                """.formatted(first.getId(), missingProductId, second.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data['%s'].release".formatted(first.getId())).value(120000))
                .andExpect(jsonPath("$.data['%s'].release".formatted(second.getId())).value(240000))
                .andExpect(jsonPath("$.data['%s']".formatted(missingProductId)).doesNotExist());
    }

    private Product seedProduct(String modelCode) {
        Category category = categoryRepository.save(Category.create("CAT-" + modelCode, "price history IT", null, 50));
        return productRepository.save(Product.seedFromSheet("시점별 정가 " + modelCode, modelCode, category,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI));
    }

    private void seedPreAndPostIncreasePrices(Product product,
                                              String preRelease,
                                              String preDelivery,
                                              String postRelease,
                                              String postDelivery) {
        priceHistoryRepository.save(PriceHistory.seed(product.getId(), LocalDate.of(2000, 1, 1),
                new BigDecimal(preRelease), new BigDecimal(preDelivery), null));
        priceHistoryRepository.save(PriceHistory.seed(product.getId(), LocalDate.of(2026, 4, 1),
                new BigDecimal(postRelease), new BigDecimal(postDelivery), null));
    }
}
