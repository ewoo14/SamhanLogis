package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductAlias;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductAliasRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.web.dto.OpaqueUuidSerializer;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * #773 S1b 회계 라벨 → productId internal lookup 통합 테스트.
 *
 * <p>실제 DB 시드 Product 와 {@code ProductSummaryResponse.from(Product)} 변환 경로를
 * 사용해 exact 모델코드, 미매칭, LIKE 다의성, 토큰 추출 실패 상태를 검증한다.
 */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class ProductInternalControllerLabelIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN = "test-internal-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductAliasRepository productAliasRepository;

    private Product exactProduct;
    private Category category;

    @BeforeEach
    void setUp() {
        category = categoryRepository.findAll().stream()
                .filter(c -> "INDOOR_WALL".equals(c.getCode()))
                .findFirst()
                .orElseGet(() -> categoryRepository.save(
                        Category.create("INDOOR_WALL", "벽걸이형", null, 1)));

        exactProduct = productRepository.save(Product.create(
                "라벨 조회 실내기",
                "LABEL-EXACT-" + UUID.randomUUID().toString().substring(0, 8),
                category,
                new BigDecimal("1500000"),
                new BigDecimal("1200000"),
                "KRW",
                null,
                "라벨 조회 IT exact"));
        exactProduct.changeProductCategory(ProductCategory.HOME_MULTI);
        exactProduct.changeModelCode("AC023CN1DBC1");
        exactProduct.updateEcountMeta("AC023CN1DBC1", null, null, null, true, null);
    }

    @Test
    void lookupByLabel_exactModelCode_returnsProductSummary() throws Exception {
        mockMvc.perform(post("/products/internal/lookup-by-label")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("label", "AC023CN1DBC1 [CN냉전 실내기]"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id", is(OpaqueUuidSerializer.encode(exactProduct.getId()))))
                .andExpect(jsonPath("$.data.modelCode", is("AC023CN1DBC1")))
                .andExpect(jsonPath("$.data.categoryKey", is("homemulti")));
    }

    @Test
    void lookupByLabel_aliasFallback_returnsMainProductSummary() throws Exception {
        // exact model_code/model_name 매칭이 안 되는 별도 modelCode 로 alias 대상 제품 생성 (2단 alias fallback 전용).
        Product aliasMainProduct = productRepository.save(Product.create(
                "별칭 매핑 실외기",
                "ALIAS-MAIN-" + UUID.randomUUID().toString().substring(0, 8),
                category,
                new BigDecimal("2000000"),
                new BigDecimal("1600000"),
                "KRW",
                null,
                "라벨 조회 IT alias fallback"));
        aliasMainProduct.changeModelCode("ALIAS-EXPOSED-CODE1");

        // 라벨 토큰("AC999ALIASX1")은 exact model_code/model_name 어디에도 없고 alias_code 로만 등록.
        productAliasRepository.save(ProductAlias.create("AC999ALIASX1", aliasMainProduct, "ECOUNT_IMPORT"));

        mockMvc.perform(post("/products/internal/lookup-by-label")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("label", "AC999ALIASX1 [별칭 매핑 테스트]"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id", is(OpaqueUuidSerializer.encode(aliasMainProduct.getId()))))
                .andExpect(jsonPath("$.data.modelCode", is("ALIAS-EXPOSED-CODE1")));
    }

    @Test
    void lookupByLabel_missing_returns404() throws Exception {
        mockMvc.perform(post("/products/internal/lookup-by-label")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("label", "AC999ZZ9ZZZ9 [미등록]"))))
                .andExpect(status().isNotFound());
    }

    @Test
    void lookupByLabel_likeAmbiguous_returns409() throws Exception {
        productRepository.save(Product.create(
                "ACAMBIG 후보 A",
                "X-ACAMBIG-1",
                category,
                new BigDecimal("100000"),
                new BigDecimal("80000"),
                "KRW",
                null,
                "라벨 조회 IT ambiguity A"));
        productRepository.save(Product.create(
                "ACAMBIG 후보 B",
                "Y-ACAMBIG-2",
                category,
                new BigDecimal("100000"),
                new BigDecimal("80000"),
                "KRW",
                null,
                "라벨 조회 IT ambiguity B"));

        mockMvc.perform(post("/products/internal/lookup-by-label")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("label", "ACAMBIG [다의성]"))))
                .andExpect(status().isConflict());
    }

    @Test
    void lookupByLabel_blankAfterClean_returns400() throws Exception {
        mockMvc.perform(post("/products/internal/lookup-by-label")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("label", "[포장재 비용]"))))
                .andExpect(status().isBadRequest());
    }

    // =========================================================================
    // #773 후속 — lookup-by-label-bulk (N+1 HTTP 제거) 통합 테스트
    // =========================================================================

    /**
     * 벌크 endpoint 가 exact/alias/LIKE-다의성/미매칭 4가지 상태를 한 응답에서 정확히 구분함을
     * 검증한다. 위 단건 테스트들과 동일한 exact/alias/ambiguous 시나리오를 재사용해 단건↔벌크
     * parity 를 함께 증명한다.
     */
    @Test
    void lookupByLabelBulk_다양한_상태를_한번에_반환한다() throws Exception {
        Product aliasMainProduct = productRepository.save(Product.create(
                "벌크 별칭 매핑 실외기",
                "BULK-ALIAS-MAIN-" + UUID.randomUUID().toString().substring(0, 8),
                category,
                new BigDecimal("2000000"),
                new BigDecimal("1600000"),
                "KRW",
                null,
                "벌크 라벨 조회 IT alias fallback"));
        aliasMainProduct.changeModelCode("BULK-ALIAS-EXPOSED-1");
        productAliasRepository.save(ProductAlias.create("BULKALIASX1", aliasMainProduct, "ECOUNT_IMPORT"));

        productRepository.save(Product.create(
                "BULKTWOROWS 후보 A", "BX-BULKTWOROWS-1", category,
                new BigDecimal("100000"), new BigDecimal("80000"), "KRW", null,
                "벌크 라벨 조회 IT 다의성 A"));
        productRepository.save(Product.create(
                "BULKTWOROWS 후보 B", "BY-BULKTWOROWS-2", category,
                new BigDecimal("100000"), new BigDecimal("80000"), "KRW", null,
                "벌크 라벨 조회 IT 다의성 B"));

        String requestBody = objectMapper.writeValueAsString(Map.of("labels", List.of(
                "AC023CN1DBC1 [CN냉전 실내기]",
                "BULKALIASX1 [별칭 매핑 테스트]",
                "BULKTWOROWS [다의성]",
                "AC999ZZ9ZZZ9 [미등록]")));

        MvcResult result = mockMvc.perform(post("/products/internal/lookup-by-label-bulk")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode data = objectMapper
                .readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data");

        JsonNode exact = data.get("AC023CN1DBC1 [CN냉전 실내기]");
        assertThat(exact.get("status").asText()).isEqualTo("MATCHED");
        assertThat(exact.get("productId").asText()).isEqualTo(exactProduct.getId().toString());
        assertThat(exact.get("modelCode").asText()).isEqualTo("AC023CN1DBC1");

        JsonNode alias = data.get("BULKALIASX1 [별칭 매핑 테스트]");
        assertThat(alias.get("status").asText()).isEqualTo("MATCHED");
        assertThat(alias.get("productId").asText()).isEqualTo(aliasMainProduct.getId().toString());
        assertThat(alias.get("modelCode").asText()).isEqualTo("BULK-ALIAS-EXPOSED-1");

        JsonNode ambiguous = data.get("BULKTWOROWS [다의성]");
        assertThat(ambiguous.get("status").asText()).isEqualTo("AMBIGUOUS");
        assertThat(ambiguous.get("productId").isNull()).isTrue();

        JsonNode notFound = data.get("AC999ZZ9ZZZ9 [미등록]");
        assertThat(notFound.get("status").asText()).isEqualTo("NOT_FOUND");
        assertThat(notFound.get("productId").isNull()).isTrue();
    }

    @Test
    void lookupByLabelBulk_blank토큰이면_400을_반환한다() throws Exception {
        mockMvc.perform(post("/products/internal/lookup-by-label-bulk")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("labels", List.of("[포장재 비용]")))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    void lookupByLabelBulk_빈리스트는_400을_반환한다() throws Exception {
        mockMvc.perform(post("/products/internal/lookup-by-label-bulk")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("labels", List.of()))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void lookupByLabelBulk_토큰없이_호출하면_401() throws Exception {
        mockMvc.perform(post("/products/internal/lookup-by-label-bulk")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("labels", List.of("AC023CN1DBC1 [CN냉전 실내기]")))))
                .andExpect(status().isUnauthorized());
    }
}
